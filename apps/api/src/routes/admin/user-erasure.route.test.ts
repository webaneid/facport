import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and, inArray, like } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminUserErasureRoute } from "./user-erasure.route";
import { db } from "../../lib/db";
import { roles, userRoles, auditLogs, session, account, memberSeats, importBatches, dataUsaha, invoices, accurateConnections, user as userTable } from "../../db/schema";
import { listFks } from "../../lib/account-erasure-db";
import { insertDataUsaha, insertPlan, insertSub } from "./insights.fixtures";

// § Fase 189H, ADR-0045 — hapus permanen (hanya akun tanpa jejak bisnis; kelayakan dari katalog FK, fail-closed) dan anonimisasi (angka keuangan utuh, PII sisa dibuang). Super Admin, konfirmasi ketik,
// alasan wajib, audit tanpa email (digest), idempoten, diri sendiri/admin/staf/import berjalan ditolak.
const runId = Date.now();
const app = new Elysia().mount(auth.handler).use(adminUserErasureRoute);
let seq = 0;

async function makeUser(roleName: "admin" | "staff" | "customer" = "customer", opts: { phone?: string; companyName?: string } = {}) {
  const email = `erase-${runId}-${seq++}@test.local`;
  const res = await app.handle(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: `Erase ${seq}` }) }));
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true, phone: opts.phone ?? null, whatsapp: opts.phone ?? null, companyName: opts.companyName ?? null }).where(eq(userTable.id, user.id));
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  const signIn = await app.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }));
  return { id: user.id, email, cookie: signIn.headers.get("set-cookie") ?? "" };
}
const call = (cookie: string | null, path: "" | "/preview", body: unknown) =>
  app.handle(new Request(`http://localhost/admin/users/erase${path}`, { method: "POST", headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const exists = async (id: string) => (await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, id))).length === 1;
type Preview = { eligible: number; blocked: { id: string; reasons: { code: string; tables?: string[] }[] }[]; confirmWord: string };
type Apply = { done: number; skipped: { id: string; reasons: { code: string }[] }[] };

describe("izin & validasi", () => {
  test("401 tanpa login, 403 untuk Admin (staff), 422 untuk 0/101 akun atau kind tak dikenal", async () => {
    const staff = await makeUser("staff");
    const admin = await makeUser("admin");
    const victim = await makeUser();
    expect((await call(null, "/preview", { kind: "delete", userIds: [victim.id] })).status).toBe(401);
    expect((await call(staff.cookie, "/preview", { kind: "delete", userIds: [victim.id] })).status).toBe(403);
    expect((await call(staff.cookie, "", { kind: "delete", userIds: [victim.id], confirm: "HAPUS", reason: "uji" })).status).toBe(403);
    expect((await call(admin.cookie, "/preview", { kind: "delete", userIds: [] })).status).toBe(422);
    expect((await call(admin.cookie, "/preview", { kind: "delete", userIds: Array.from({ length: 101 }, (_, i) => `x${i}`) })).status).toBe(422);
    expect((await call(admin.cookie, "/preview", { kind: "drop", userIds: [victim.id] })).status).toBe(422);
    expect(await exists(victim.id)).toBe(true);
  });
  test("konfirmasi kata salah → 400; alasan kosong → 422; tidak ada perubahan", async () => {
    const admin = await makeUser("admin");
    const victim = await makeUser();
    for (const confirm of ["", "hapus", "ANONIMKAN", "HAPUS "]) {
      const res = await call(admin.cookie, "", { kind: "delete", userIds: [victim.id], confirm, reason: "uji coba" });
      if (confirm === "HAPUS ") expect(res.status).toBe(200); // spasi tepi dipangkas — dicek di bawah (akun ini ikut terhapus)
      else expect(res.status).toBe(400);
      if (res.status === 200) break;
    }
    const victim2 = await makeUser();
    const noReason = await call(admin.cookie, "", { kind: "delete", userIds: [victim2.id], confirm: "HAPUS", reason: "  " });
    expect(noReason.status).toBe(422);
    expect(await exists(victim2.id)).toBe(true);
  });
});

describe("hapus permanen", () => {
  test("katalog FK: tabel bisnis terdeteksi memblokir, session/account cascade, audit_logs.actor_id nullable", async () => {
    const fks = await listFks(db, "user");
    const tables = new Set(fks.map((f) => f.table));
    for (const t of ["invoices", "subscriptions", "import_batches", "data_usaha", "member_seats", "accurate_connections", "ownership_transfers", "session", "account", "user_roles", "notifications", "audit_logs"]) expect(tables.has(t)).toBe(true);
    expect(fks.find((f) => f.table === "session")?.deleteType).toBe("c");
    expect(fks.find((f) => f.table === "invoices")?.deleteType).not.toBe("c");
  });

  test("akun bersih (hanya sesi+role) terhapus; sesi ikut hilang; audit memuat digest, BUKAN email; pratinjau tidak mengubah", async () => {
    const admin = await makeUser("admin");
    const victim = await makeUser();
    expect((await db.select().from(session).where(eq(session.userId, victim.id))).length).toBeGreaterThan(0);
    const prev = (await (await call(admin.cookie, "/preview", { kind: "delete", userIds: [victim.id] })).json()) as Preview;
    expect(prev).toMatchObject({ eligible: 1, confirmWord: "HAPUS" });
    expect(await exists(victim.id)).toBe(true);

    const res = await call(admin.cookie, "", { kind: "delete", userIds: [victim.id], confirm: "HAPUS", reason: "akun uji duplikat" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Apply).done).toBe(1);
    expect(await exists(victim.id)).toBe(false);
    expect((await db.select().from(session).where(eq(session.userId, victim.id))).length).toBe(0);
    expect((await db.select().from(account).where(eq(account.userId, victim.id))).length).toBe(0);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, victim.id), eq(auditLogs.action, "delete")));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(admin.id);
    expect(logs[0]?.changes).toMatchObject({ kind: "delete", reason: "akun uji duplikat", bulk: false });
    expect(JSON.stringify(logs[0]?.changes)).not.toContain(victim.email);
    expect(JSON.stringify(logs[0]?.changes)).toMatch(/[0-9a-f]{64}/);
  });

  test("Data Usaha kosong ikut terhapus; jejak pelaku di audit_logs di-NULL-kan tetapi barisnya tetap", async () => {
    const admin = await makeUser("admin");
    const victim = await makeUser();
    const duId = await insertDataUsaha(victim.id, "Data Usaha Kosong");
    const [log] = await db.insert(auditLogs).values({ entityType: "x", entityId: "y", action: "update", changes: { a: 1 }, actorId: victim.id }).returning();
    const res = await call(admin.cookie, "", { kind: "delete", userIds: [victim.id], confirm: "HAPUS", reason: "uji" });
    expect(((await res.json()) as Apply).done).toBe(1);
    expect((await db.select().from(dataUsaha).where(eq(dataUsaha.id, duId))).length).toBe(0);
    const [after] = await db.select().from(auditLogs).where(eq(auditLogs.id, log!.id));
    expect(after?.actorId).toBeNull();
  });

  test("akun berjejak bisnis ditolak per tabel (invoice, langganan di Data Usaha) dan TIDAK terhapus; akun bersih di batch yang sama tetap diproses", async () => {
    const admin = await makeUser("admin");
    const withInvoice = await makeUser();
    await db.insert(invoices).values({ invoiceNumber: `INV/ERASE/${runId}/1`, userId: withInvoice.id, status: "paid", billToName: "T", subtotal: 1000, total: 1000, dueDate: new Date(), paidAt: new Date() });
    const withSub = await makeUser();
    const du = await insertDataUsaha(withSub.id, "DU Berlangganan");
    const plan = await insertPlan("purchase_invoice");
    await insertSub({ ownerId: withSub.id, dataUsahaId: du, planId: plan.id, start: new Date(), end: new Date(Date.now() + 86_400_000) });
    const clean = await makeUser();

    const prev = (await (await call(admin.cookie, "/preview", { kind: "delete", userIds: [withInvoice.id, withSub.id, clean.id] })).json()) as Preview;
    expect(prev.eligible).toBe(1);
    const byId = new Map(prev.blocked.map((b) => [b.id, b.reasons]));
    expect(byId.get(withInvoice.id)?.[0]).toMatchObject({ code: "HAS_RECORDS" });
    expect(byId.get(withInvoice.id)?.[0]?.tables).toContain("invoices");
    expect(byId.get(withSub.id)?.[0]?.tables).toContain("subscriptions");

    const res = (await (await call(admin.cookie, "", { kind: "delete", userIds: [withInvoice.id, withSub.id, clean.id], confirm: "HAPUS", reason: "uji" })).json()) as Apply;
    expect(res.done).toBe(1);
    expect(res.skipped).toHaveLength(2);
    expect(await exists(withInvoice.id)).toBe(true);
    expect(await exists(withSub.id)).toBe(true);
    expect(await exists(clean.id)).toBe(false);
  });

  test("diri sendiri dan akun admin/staf tidak dapat dihapus", async () => {
    const admin = await makeUser("admin");
    const staff = await makeUser("staff");
    const prev = (await (await call(admin.cookie, "/preview", { kind: "delete", userIds: [admin.id, staff.id] })).json()) as Preview;
    expect(prev.eligible).toBe(0);
    const codes = Object.fromEntries(prev.blocked.map((b) => [b.id, b.reasons.map((r) => r.code)]));
    expect(codes[admin.id]).toEqual(expect.arrayContaining(["SELF", "STAFF_ACCOUNT"]));
    expect(codes[staff.id]).toEqual(["STAFF_ACCOUNT"]);
    await call(admin.cookie, "", { kind: "delete", userIds: [admin.id, staff.id], confirm: "HAPUS", reason: "uji" });
    expect(await exists(admin.id)).toBe(true);
    expect(await exists(staff.id)).toBe(true);
  });
});

describe("anonimisasi", () => {
  test("identitas diganti, akun dinonaktifkan, sesi+login dibuang, invoice UTUH; PII lama hilang dari audit, undangan seat, dan snapshot audit", async () => {
    const admin = await makeUser("admin");
    const victim = await makeUser("customer", { phone: "+6281299990000", companyName: "PT Rahasia" });
    await db.insert(invoices).values({ invoiceNumber: `INV/ANON/${runId}/1`, userId: victim.id, status: "paid", billToName: "T", subtotal: 777_000, total: 777_000, dueDate: new Date(), paidAt: new Date() });
    // jejak PII: koreksi kontak (entity user), undangan seat & akun Accurate (entity data_usaha), undangan seat milik pemilik lain atas email korban
    const ownerOther = await makeUser();
    const duOther = await insertDataUsaha(ownerOther.id, "DU Lain");
    await db.insert(auditLogs).values([
      { entityType: "user", entityId: victim.id, action: "update", changes: { phone: { from: null, to: "+6281299990000" }, companyName: "PT Rahasia", isInternal: true }, actorId: admin.id },
      { entityType: "data_usaha", entityId: duOther, action: "invite_seat", changes: { seatId: "s1", email: victim.email.toUpperCase(), by: "owner" }, actorId: ownerOther.id },
      { entityType: "data_usaha", entityId: duOther, action: "connect_accurate", changes: { accountEmail: victim.email, via: "oauth" }, actorId: ownerOther.id },
    ]);
    const plan = await insertPlan(null, { kind: "seat_addon" });
    const seatSub = await insertSub({ ownerId: ownerOther.id, dataUsahaId: duOther, planId: plan.id, start: new Date(), end: new Date(Date.now() + 86_400_000) });
    await db.insert(memberSeats).values({ dataUsahaId: duOther, primaryUserId: ownerOther.id, seatSubscriptionId: seatSub.id, status: "invited", invitedEmail: victim.email.toUpperCase() });

    const res = await call(admin.cookie, "", { kind: "anonymize", userIds: [victim.id], confirm: "ANONIMKAN", reason: "permintaan hapus data pelanggan" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Apply).done).toBe(1);

    const [u] = await db.select().from(userTable).where(eq(userTable.id, victim.id));
    expect(u).toMatchObject({ name: `Akun Anonim ${victim.id.slice(0, 8)}`, email: `anon-${victim.id}@anonymized.invalid`, phone: null, whatsapp: null, companyName: null, disabled: true, emailVerified: false });
    expect((await db.select().from(session).where(eq(session.userId, victim.id))).length).toBe(0);
    expect((await db.select().from(account).where(eq(account.userId, victim.id))).length).toBe(0);
    const [inv] = await db.select().from(invoices).where(eq(invoices.userId, victim.id));
    expect(inv?.total).toBe(777_000);

    const all = JSON.stringify(await db.select({ c: auditLogs.changes }).from(auditLogs).where(inArray(auditLogs.entityId, [victim.id, duOther])));
    expect(all.toLowerCase()).not.toContain(victim.email.toLowerCase());
    expect(all).not.toContain("+6281299990000");
    expect(all).not.toContain("PT Rahasia");
    expect(all).toContain("isInternal"); // kunci non-PII dipertahankan
    const seats = await db.select().from(memberSeats).where(eq(memberSeats.dataUsahaId, duOther));
    for (const s of seats) expect(s.invitedEmail?.toLowerCase()).not.toBe(victim.email.toLowerCase());
    const [snap] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, victim.id), eq(auditLogs.action, "anonymize")));
    expect(snap?.changes).toMatchObject({ kind: "anonymize", reason: "permintaan hapus data pelanggan" });
  });

  test("idempoten: akun yang sudah anonim dilewati (ALREADY_ANONYMIZED); import berjalan menolak", async () => {
    const admin = await makeUser("admin");
    const victim = await makeUser();
    const body = { kind: "anonymize", userIds: [victim.id], confirm: "ANONIMKAN", reason: "uji" };
    expect(((await (await call(admin.cookie, "", body)).json()) as Apply).done).toBe(1);
    const again = (await (await call(admin.cookie, "", body)).json()) as Apply;
    expect(again.done).toBe(0);
    expect(again.skipped[0]?.reasons[0]?.code).toBe("ALREADY_ANONYMIZED");

    const busy = await makeUser();
    const du = await insertDataUsaha(busy.id, "DU Sibuk");
    const plan = await insertPlan("purchase_invoice");
    const sub = await insertSub({ ownerId: busy.id, dataUsahaId: du, planId: plan.id, start: new Date(), end: new Date(Date.now() + 86_400_000) });
    await db.insert(importBatches).values({ userId: busy.id, subscriptionId: sub.id, module: "purchase_invoice", fileName: "x.xlsx", totalRows: 1, status: "processing" });
    const prev = (await (await call(admin.cookie, "/preview", { kind: "anonymize", userIds: [busy.id] })).json()) as Preview;
    expect(prev.blocked[0]?.reasons.map((r) => r.code)).toContain("IMPORT_RUNNING");
    expect(prev.eligible).toBe(0);
    void like;
  });

  test("audit lama: riwayat kontak BERSARANG (nomor lama, perusahaan) ikut hilang; alasan admin yang memuat email di-scrub; email orang lain yang memuat email korban tidak rusak", async () => {
    const admin = await makeUser("admin");
    const victim = await makeUser("customer", { phone: "+6281200001111" });
    await db.insert(auditLogs).values({ entityType: "user", entityId: victim.id, action: "update", changes: { contact: { from: { companyName: "PT Lama", phone: "+6281233334444" }, to: { companyName: "PT Baru", phone: "+6281200001111" } } }, actorId: admin.id });
    const other = await insertDataUsaha((await makeUser()).id, "DU Orang Lain");
    await db.insert(auditLogs).values({ entityType: "data_usaha", entityId: other, action: "invite_seat", changes: { email: `x${victim.email}` }, actorId: admin.id });
    const res = await call(admin.cookie, "", { kind: "anonymize", userIds: [victim.id], confirm: "ANONIMKAN", reason: `permintaan ${victim.email} via telepon` });
    expect(((await res.json()) as Apply).done).toBe(1);
    const own = JSON.stringify(await db.select({ c: auditLogs.changes }).from(auditLogs).where(eq(auditLogs.entityId, victim.id)));
    expect(own).not.toContain("PT Lama");
    expect(own).not.toContain("+6281233334444");
    expect(own).not.toContain("PT Baru");
    expect(own.toLowerCase()).not.toContain(victim.email.toLowerCase());
    const [theirs] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, other));
    expect(JSON.stringify(theirs?.changes)).toContain(`x${victim.email}`); // milik orang lain tidak diubah
  });

  test("koneksi Accurate akun diputus: token dibuang, status revoked, Data Usaha tidak lagi menunjuknya; pratinjau memberi dampak", async () => {
    const admin = await makeUser("admin");
    const victim = await makeUser();
    const du = await insertDataUsaha(victim.id, "DU Terhubung");
    const [conn] = await db.insert(accurateConnections).values({ userId: victim.id, accessTokenEncrypted: "enc-a", refreshTokenEncrypted: "enc-r", expiresAt: new Date(Date.now() + 86_400_000), status: "active" }).returning();
    await db.update(dataUsaha).set({ accurateConnectionId: conn!.id }).where(eq(dataUsaha.id, du));
    const prev = (await (await call(admin.cookie, "/preview", { kind: "anonymize", userIds: [victim.id] })).json()) as { impact: { accurateConnections: number } };
    expect(prev.impact.accurateConnections).toBe(1);
    expect(((await (await call(admin.cookie, "", { kind: "anonymize", userIds: [victim.id], confirm: "ANONIMKAN", reason: "uji" })).json()) as Apply).done).toBe(1);
    const [after] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn!.id));
    expect(after).toMatchObject({ status: "revoked", accessTokenEncrypted: "revoked", refreshTokenEncrypted: "revoked" });
    const [duAfter] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(duAfter?.accurateConnectionId).toBeNull();
  });
});
