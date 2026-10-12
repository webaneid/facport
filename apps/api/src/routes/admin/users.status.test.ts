import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminUsersRoute } from "./users.route";
import { db } from "../../lib/db";
import { roles, userRoles, auditLogs, session, user as userTable } from "../../db/schema";

// § Fase 189H (bagian 2) — nonaktifkan/aktifkan MASSAL: pratinjau tanpa efek, izin terpusat, diri sendiri/Super Admin terakhir dilewati, sesi dicabut, audit per akun, idempoten.
const runId = Date.now();
const app = new Elysia().mount(auth.handler).use(adminUsersRoute);
let seq = 0;

async function makeUser(roleName: "admin" | "staff" | "customer") {
  const email = `status-${runId}-${seq++}@test.local`;
  const res = await app.handle(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: `Status ${seq}` }) }));
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  const signIn = await app.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }));
  return { id: user.id, email, cookie: signIn.headers.get("set-cookie") ?? "" };
}
const post = (cookie: string | null, path: "/status" | "/status/preview", body: unknown) =>
  app.handle(new Request(`http://localhost/admin/users${path}`, { method: "POST", headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const isDisabled = async (id: string) => (await db.select({ d: userTable.disabled }).from(userTable).where(eq(userTable.id, id)))[0]!.d;

describe("POST /admin/users/status — izin & validasi", () => {
  test("401 tanpa login, 403 untuk Admin (staff), 422 untuk 0 atau 101 akun", async () => {
    const staff = await makeUser("staff");
    const c = await makeUser("customer");
    expect((await post(null, "/status", { userIds: [c.id], disabled: true })).status).toBe(401);
    expect((await post(staff.cookie, "/status", { userIds: [c.id], disabled: true })).status).toBe(403);
    expect((await post(staff.cookie, "/status/preview", { userIds: [c.id], disabled: true })).status).toBe(403);
    const admin = await makeUser("admin");
    expect((await post(admin.cookie, "/status", { userIds: [], disabled: true })).status).toBe(422);
    expect((await post(admin.cookie, "/status", { userIds: Array.from({ length: 101 }, (_, i) => `x${i}`), disabled: true })).status).toBe(422);
    expect(await isDisabled(c.id)).toBe(false);
  });
});

describe("pratinjau & penerapan", () => {
  test("pratinjau menghitung tanpa mengubah; terapkan menonaktifkan, mencabut sesi, mengaudit per akun; ulang → idempoten", async () => {
    const admin = await makeUser("admin");
    const a = await makeUser("customer");
    const b = await makeUser("customer");
    const body = { userIds: [a.id, b.id, "tidak-ada", a.id], disabled: true };
    const prev = (await (await post(admin.cookie, "/status/preview", body)).json()) as Record<string, number>;
    expect(prev).toMatchObject({ requested: 3, found: 2, willChange: 2, notFound: 1, alreadyInState: 0 });
    expect(await isDisabled(a.id)).toBe(false);

    const res = await post(admin.cookie, "/status", body);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { changed: number }).changed).toBe(2);
    expect(await isDisabled(a.id)).toBe(true);
    expect(await isDisabled(b.id)).toBe(true);
    expect((await db.select().from(session).where(eq(session.userId, a.id))).length).toBe(0);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, a.id), eq(auditLogs.action, "update")));
    expect(log?.changes).toMatchObject({ disabled: true, bulk: true });
    expect(log?.actorId).toBe(admin.id);

    const again = (await (await post(admin.cookie, "/status", body)).json()) as { changed: number; alreadyInState: number };
    expect(again).toMatchObject({ changed: 0, alreadyInState: 2 });

    const enable = (await (await post(admin.cookie, "/status", { userIds: [a.id, b.id], disabled: false })).json()) as { changed: number };
    expect(enable.changed).toBe(2);
    expect(await isDisabled(a.id)).toBe(false);
  });

  test("diri sendiri dilewati (blockedSelf) sementara akun lain tetap diproses", async () => {
    const admin = await makeUser("admin");
    const other = await makeUser("customer");
    const res = (await (await post(admin.cookie, "/status", { userIds: [admin.id, other.id], disabled: true })).json()) as { changed: number; blockedSelf: number };
    expect(res).toMatchObject({ changed: 1, blockedSelf: 1 });
    expect(await isDisabled(admin.id)).toBe(false);
    expect(await isDisabled(other.id)).toBe(true);
  });

  test("akun yang sudah dianonimkan tidak dapat diaktifkan kembali (blockedAnonymized)", async () => {
    const admin = await makeUser("admin");
    const anon = await makeUser("customer");
    await db.update(userTable).set({ email: `anon-${anon.id}@anonymized.invalid`, disabled: true }).where(eq(userTable.id, anon.id));
    const res = (await (await post(admin.cookie, "/status", { userIds: [anon.id], disabled: false })).json()) as { changed: number; blockedAnonymized: number };
    expect(res).toMatchObject({ changed: 0, blockedAnonymized: 1 });
    expect(await isDisabled(anon.id)).toBe(true);
  });
});
