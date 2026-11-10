import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { and, eq, desc } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminStaffRoute } from "./staff.route";
import { db } from "../../lib/db";
import { roles, userRoles, auditLogs, session, account, user as userTable } from "../../db/schema";

// § Fase 216, ADR-0053 — ubah tingkat staf (Admin ↔ Super Admin, atomik) dan reset kata sandi staf, HANYA Super Admin. Guard: bukan diri sendiri, harus staf, konfirmasi ketik email dicek
// server, akun anonim/nonaktif ditolak sesuai aturan, sesi dicabut, audit tanpa sandi. Catatan: penjaga "Super Admin aktif terakhir" tidak bisa dipicu lewat endpoint (pemanggil sendiri
// harus Super Admin aktif dan tak boleh mengubah dirinya) — aturan murninya diuji di `lib/role-actions.test.ts`.
const runId = Date.now();
const app = new Elysia().mount(auth.handler).use(adminStaffRoute);
const PASSWORD = "TestPassword123!";
let seq = 0;

async function makeUser(roleNames: ("admin" | "staff" | "customer")[], opts: { disabled?: boolean; email?: string } = {}) {
  const email = opts.email ?? `staffmgr-${runId}-${seq++}@test.local`;
  const res = await app.handle(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, name: "Staff Manage Test" }) }));
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true, disabled: opts.disabled ?? false }).where(eq(userTable.id, user.id));
  for (const roleName of roleNames) {
    const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
    await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  }
  const signIn = await app.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) }));
  return { id: user.id, email, cookie: signIn.headers.get("set-cookie") ?? "" };
}

const post = (cookie: string | null, path: string, body: unknown) =>
  app.handle(new Request(`http://localhost/admin/staff${path}`, { method: "POST", headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const rolesOf = async (id: string) => (await db.select({ n: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, id))).map((r) => r.n).sort();
const sessionCount = async (id: string) => (await db.select({ id: session.id }).from(session).where(eq(session.userId, id))).length;
const signInWith = (email: string, password: string) => app.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));

describe("izin", () => {
  test("tanpa login 401; Admin (staff) 403 untuk ketiga endpoint — hanya Super Admin (users.manage)", async () => {
    const target = await makeUser(["staff"]);
    const caller = await makeUser(["staff"]);
    for (const path of [`/${target.id}/role/preview`, `/${target.id}/role`, `/${target.id}/reset-password`]) {
      expect((await post(null, path, { role: "admin", confirm: target.email })).status).toBe(401);
      expect((await post(caller.cookie, path, { role: "admin", confirm: target.email })).status).toBe(403);
    }
    expect(await rolesOf(target.id)).toEqual(["staff"]);
  });
});

describe("POST /admin/staff/:id/role/preview", () => {
  test("Admin → Super Admin: pratinjau tanpa mengubah apa pun", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff"]);
    const res = await post(admin.cookie, `/${target.id}/role/preview`, { role: "admin" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ noop: false, promotes: true, demotes: false, rolesBefore: ["staff"], rolesAfter: ["admin"] });
    expect(await rolesOf(target.id)).toEqual(["staff"]);
  });
  test("diri sendiri 400; tidak ada 404; customer biasa 400 NOT_STAFF", async () => {
    const admin = await makeUser(["admin"]);
    const customer = await makeUser(["customer"]);
    expect(await (await post(admin.cookie, `/${admin.id}/role/preview`, { role: "staff" })).json()).toEqual({ code: "CANNOT_CHANGE_OWN_ROLE" });
    expect((await post(admin.cookie, "/tidak-ada/role/preview", { role: "staff" })).status).toBe(404);
    const res = await post(admin.cookie, `/${customer.id}/role/preview`, { role: "admin" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "NOT_STAFF" });
  });
});

describe("POST /admin/staff/:id/role", () => {
  test("Admin → Super Admin: role berganti atomik, customer dipertahankan, sesi dicabut, audit switch_tier", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff", "customer"]);
    expect(await sessionCount(target.id)).toBeGreaterThan(0);
    const res = await post(admin.cookie, `/${target.id}/role`, { role: "admin", confirm: target.email.toUpperCase() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, changed: true, roles: ["admin", "customer"] });
    expect(await rolesOf(target.id)).toEqual(["admin", "customer"]);
    expect(await sessionCount(target.id)).toBe(0);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, target.id), eq(auditLogs.action, "role_change"))).orderBy(desc(auditLogs.createdAt)).limit(1);
    expect(log?.actorId).toBe(admin.id);
    expect(log?.changes).toEqual({ action: "switch_tier", from: ["customer", "staff"], to: ["admin", "customer"] });
  });
  test("Super Admin → Admin (Super Admin lain tetap aktif): berhasil", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["admin"]);
    const res = await post(admin.cookie, `/${target.id}/role`, { role: "staff", confirm: target.email });
    expect(res.status).toBe(200);
    expect(await rolesOf(target.id)).toEqual(["staff"]);
  });
  test("sudah di tingkat itu → changed false, tanpa audit, sesi tidak dicabut", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff"]);
    const sessionsBefore = await sessionCount(target.id);
    const res = await post(admin.cookie, `/${target.id}/role`, { role: "staff", confirm: target.email });
    expect(await res.json()).toMatchObject({ ok: true, changed: false });
    expect(await sessionCount(target.id)).toBe(sessionsBefore);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, target.id), eq(auditLogs.action, "role_change")));
    expect(logs.length).toBe(0);
  });
  test("konfirmasi email salah 400 CONFIRM_MISMATCH (role tak berubah)", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff"]);
    const res = await post(admin.cookie, `/${target.id}/role`, { role: "admin", confirm: "lain@test.local" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "CONFIRM_MISMATCH" });
    expect(await rolesOf(target.id)).toEqual(["staff"]);
  });
  test("diri sendiri 400; customer biasa 400 NOT_STAFF; tidak ada 404", async () => {
    const admin = await makeUser(["admin"]);
    const customer = await makeUser(["customer"]);
    expect(await (await post(admin.cookie, `/${admin.id}/role`, { role: "staff", confirm: admin.email })).json()).toEqual({ code: "CANNOT_CHANGE_OWN_ROLE" });
    expect(await (await post(admin.cookie, `/${customer.id}/role`, { role: "admin", confirm: customer.email })).json()).toEqual({ code: "NOT_STAFF" });
    expect((await post(admin.cookie, "/tidak-ada/role", { role: "admin", confirm: "x" })).status).toBe(404);
    expect(await rolesOf(customer.id)).toEqual(["customer"]);
  });
  test("menaikkan akun NONAKTIF → 409 ACCOUNT_DISABLED; menurunkan akun nonaktif boleh", async () => {
    const admin = await makeUser(["admin"]);
    const disabledStaff = await makeUser(["staff"], { disabled: true });
    const disabledAdmin = await makeUser(["admin"], { disabled: true });
    const up = await post(admin.cookie, `/${disabledStaff.id}/role`, { role: "admin", confirm: disabledStaff.email });
    expect(up.status).toBe(409);
    expect(await up.json()).toEqual({ code: "ACCOUNT_DISABLED" });
    expect(await rolesOf(disabledStaff.id)).toEqual(["staff"]);
    expect((await post(admin.cookie, `/${disabledAdmin.id}/role`, { role: "staff", confirm: disabledAdmin.email })).status).toBe(200);
  });
  test("akun anonim → 409 ACCOUNT_ANONYMIZED", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff"]);
    const anonEmail = `anon-${target.id}@anonymized.invalid`;
    await db.update(userTable).set({ email: anonEmail }).where(eq(userTable.id, target.id));
    const res = await post(admin.cookie, `/${target.id}/role`, { role: "admin", confirm: anonEmail });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "ACCOUNT_ANONYMIZED" });
  });
  test("role di luar admin/staff ditolak validasi (422)", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff"]);
    expect((await post(admin.cookie, `/${target.id}/role`, { role: "customer", confirm: target.email })).status).toBe(422);
  });
});

describe("POST /admin/staff/:id/reset-password", () => {
  test("sandi sementara dikembalikan sekali; login sandi baru berhasil, sandi lama gagal, sesi dicabut, audit tanpa sandi", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff"]);
    expect(await sessionCount(target.id)).toBeGreaterThan(0);
    const res = await post(admin.cookie, `/${target.id}/reset-password`, { confirm: target.email });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; tempPassword: string };
    expect(body.email).toBe(target.email);
    expect(body.tempPassword.length).toBeGreaterThanOrEqual(12);
    expect(await sessionCount(target.id)).toBe(0);
    expect((await signInWith(target.email, body.tempPassword)).status).toBe(200);
    expect((await signInWith(target.email, PASSWORD)).status).not.toBe(200);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, target.id), eq(auditLogs.action, "update")));
    const entry = logs.find((l) => (l.changes as { passwordReset?: boolean } | null)?.passwordReset === true);
    expect(entry?.actorId).toBe(admin.id);
    expect(JSON.stringify(entry?.changes)).not.toContain(body.tempPassword);
  });
  test("diri sendiri 400; konfirmasi salah 400; customer biasa 400 NOT_STAFF; tidak ada 404", async () => {
    const admin = await makeUser(["admin"]);
    const target = await makeUser(["staff"]);
    const customer = await makeUser(["customer"]);
    expect(await (await post(admin.cookie, `/${admin.id}/reset-password`, { confirm: admin.email })).json()).toEqual({ code: "CANNOT_RESET_OWN_PASSWORD" });
    expect(await (await post(admin.cookie, `/${target.id}/reset-password`, { confirm: "lain@test.local" })).json()).toEqual({ code: "CONFIRM_MISMATCH" });
    expect(await (await post(admin.cookie, `/${customer.id}/reset-password`, { confirm: customer.email })).json()).toEqual({ code: "NOT_STAFF" });
    expect((await post(admin.cookie, "/tidak-ada/reset-password", { confirm: "x" })).status).toBe(404);
    // sandi lama tetap berlaku bila ditolak
    expect((await signInWith(target.email, PASSWORD)).status).toBe(200);
  });
  test("akun nonaktif 409; akun anonim 409; akun tanpa kredensial sandi 409 NO_PASSWORD_LOGIN (tidak dibuatkan diam-diam)", async () => {
    const admin = await makeUser(["admin"]);
    const disabled = await makeUser(["staff"], { disabled: true });
    expect(await (await post(admin.cookie, `/${disabled.id}/reset-password`, { confirm: disabled.email })).json()).toEqual({ code: "ACCOUNT_DISABLED" });

    const anon = await makeUser(["staff"]);
    const anonEmail = `anon-${anon.id}@anonymized.invalid`;
    await db.update(userTable).set({ email: anonEmail }).where(eq(userTable.id, anon.id));
    expect(await (await post(admin.cookie, `/${anon.id}/reset-password`, { confirm: anonEmail })).json()).toEqual({ code: "ACCOUNT_ANONYMIZED" });

    const googleOnly = await makeUser(["staff"]);
    await db.delete(account).where(eq(account.userId, googleOnly.id));
    const res = await post(admin.cookie, `/${googleOnly.id}/reset-password`, { confirm: googleOnly.email });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "NO_PASSWORD_LOGIN" });
    expect((await db.select().from(account).where(eq(account.userId, googleOnly.id))).length).toBe(0);
  });
});
