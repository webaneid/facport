import { describe, test, expect, spyOn } from "bun:test";
import { Elysia } from "elysia";
import { and, eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { boss } from "../../lib/queue";
import { auditLogs, memberSeats, notifications, roles, session as sessionTable, userRoles, user as userTable } from "../../db/schema";
import { adminSeatsRoute } from "./seats.route";
import { createTestDataUsaha, createTestSeat } from "../../lib/test-fixtures";

// § Fase 189B, D7/D15 — admin mencabut/memindahkan akses User Tambahan: alasan WAJIB (tercatat di riwayat Data Usaha), notifikasi HANYA ke pemilik dan tanpa isi alasan
// (catatan internal), sesi member dicabut, undangan pengganti dikirim tim Facport (bukan atas nama pemilik). Izin: baca `users.view`, aksi `subscriptions.manage`.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminSeatsRoute);
let seq = 0;

async function makeUser(label: string, roleName?: "admin" | "staff" | "customer") {
  const email = `admin-seats-${label}-${runId}-${seq++}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: `Seats ${label}` }) }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  if (roleName) {
    const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
    await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  }
  const signIn = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }),
  );
  return { id: user.id, email, cookie: signIn.headers.get("set-cookie") ?? "" };
}

// Data Usaha + slot AKTIF berisi member (dengan sesi login)
async function scenario() {
  const owner = await makeUser("owner", "customer");
  const member = await makeUser("member", "customer");
  const du = await createTestDataUsaha(owner.id, `DU Seats ${seq}`);
  const seatId = await createTestSeat(owner.id, du);
  await db.update(memberSeats).set({ status: "active", memberUserId: member.id, acceptedAt: new Date() }).where(eq(memberSeats.id, seatId));
  return { owner, member, du, seatId };
}
const revoke = (cookie: string | null, du: string, seatId: string, body: unknown) =>
  testApp.handle(new Request(`http://localhost/admin/data-usaha/${du}/seats/${seatId}/revoke`, { method: "POST", headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const access = (cookie: string | null, du: string) =>
  testApp.handle(new Request(`http://localhost/admin/data-usaha/${du}/access`, { headers: cookie ? { cookie } : {} }));
const seatRow = async (id: string) => (await db.select().from(memberSeats).where(eq(memberSeats.id, id)))[0]!;

describe("izin", () => {
  test("tanpa login 401; customer biasa 403 (baca dan aksi); Admin (staff) boleh keduanya", async () => {
    const s = await scenario();
    const customer = await makeUser("cust", "customer");
    const staff = await makeUser("staff", "staff");
    expect((await access(null, s.du)).status).toBe(401);
    expect((await revoke(null, s.du, s.seatId, { reason: "uji coba" })).status).toBe(401);
    expect((await access(customer.cookie, s.du)).status).toBe(403);
    expect((await revoke(customer.cookie, s.du, s.seatId, { reason: "uji coba" })).status).toBe(403);
    expect((await seatRow(s.seatId)).status).toBe("active");
    expect((await access(staff.cookie, s.du)).status).toBe(200);
    expect((await revoke(staff.cookie, s.du, s.seatId, { reason: "permintaan pemilik" })).status).toBe(200);
  });
});

describe("POST /admin/data-usaha/:id/seats/:seatId/revoke", () => {
  test("alasan wajib: tanpa alasan / terlalu pendek / hanya spasi ditolak dan slot TIDAK berubah", async () => {
    const s = await scenario();
    const admin = await makeUser("admin", "admin");
    expect((await revoke(admin.cookie, s.du, s.seatId, {})).status).toBe(422);
    expect((await revoke(admin.cookie, s.du, s.seatId, { reason: "ab" })).status).toBe(422);
    const blank = await revoke(admin.cookie, s.du, s.seatId, { reason: "     " });
    expect(blank.status).toBe(422);
    expect(await blank.json()).toMatchObject({ code: "REASON_REQUIRED" });
    expect((await revoke(admin.cookie, s.du, s.seatId, { reason: "x".repeat(501) })).status).toBe(422);
    expect((await seatRow(s.seatId)).status).toBe("active");
  });

  test("berhasil: slot tersedia, sesi member dicabut, riwayat memuat alasan+pelaku, pemilik diberi notifikasi TANPA alasan, member tidak diberi notifikasi", async () => {
    const s = await scenario();
    const admin = await makeUser("admin", "admin");
    await db.insert(sessionTable).values({ id: `s-${runId}-${seq++}`, token: `t-${runId}-${seq++}`, userId: s.member.id, expiresAt: new Date(Date.now() + 1e9), createdAt: new Date(), updatedAt: new Date() });

    const res = await revoke(admin.cookie, s.du, s.seatId, { reason: "  Karyawan resign, diminta atasan via WA  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, previousStatus: "active", invited: false });
    expect(await seatRow(s.seatId)).toMatchObject({ status: "available", memberUserId: null, revokedBy: admin.id });
    expect(await db.select().from(sessionTable).where(eq(sessionTable.userId, s.member.id))).toHaveLength(0);

    const [ev] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, s.du), eq(auditLogs.action, "revoke_seat")));
    expect(ev!.actorId).toBe(admin.id);
    expect(ev!.changes).toMatchObject({ by: "admin", email: s.member.email, reason: "Karyawan resign, diminta atasan via WA" });

    const ownerNotes = await db.select().from(notifications).where(and(eq(notifications.userId, s.owner.id), eq(notifications.type, "seat_access_changed_by_admin")));
    expect(ownerNotes).toHaveLength(1);
    expect(ownerNotes[0]!.body).toContain(s.member.email);
    expect(JSON.stringify(ownerNotes)).not.toContain("Karyawan resign"); // catatan admin bersifat internal
    expect(await db.select().from(notifications).where(eq(notifications.userId, s.member.id))).toHaveLength(0);
  });

  test("slot Data Usaha lain / Data Usaha tak dikenal → 404; slot sudah tersedia → 400 SEAT_ALREADY_AVAILABLE", async () => {
    const a = await scenario();
    const b = await scenario();
    const admin = await makeUser("admin", "admin");
    const wrongDu = await revoke(admin.cookie, a.du, b.seatId, { reason: "uji isolasi" });
    expect(wrongDu.status).toBe(404);
    expect(await wrongDu.json()).toMatchObject({ code: "SEAT_NOT_FOUND" });
    expect((await seatRow(b.seatId)).status).toBe("active");

    const missingDu = await revoke(admin.cookie, "00000000-0000-0000-0000-000000000000", a.seatId, { reason: "uji" });
    expect(missingDu.status).toBe(404);
    expect(await missingDu.json()).toMatchObject({ code: "DATA_USAHA_NOT_FOUND" });

    expect((await revoke(admin.cookie, a.du, a.seatId, { reason: "pertama" })).status).toBe(200);
    const again = await revoke(admin.cookie, a.du, a.seatId, { reason: "kedua" });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ code: "SEAT_ALREADY_AVAILABLE" });
  });

  test("pindahkan akses: newEmail → slot langsung 'invited', email undangan dikirim TIM FACPORT atas permintaan pemilik, notifikasi pemilik menyebut email baru", async () => {
    const s = await scenario();
    const admin = await makeUser("admin", "admin");
    const send = spyOn(boss, "send").mockResolvedValue(null as never);
    try {
      const res = await revoke(admin.cookie, s.du, s.seatId, { reason: "Pindah ke pengganti", newEmail: "Pengganti@Test.Local" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ invited: true });
      expect(await seatRow(s.seatId)).toMatchObject({ status: "invited", invitedEmail: "pengganti@test.local", memberUserId: null });

      const emailJob = send.mock.calls.map((c) => c[1] as { to?: string; subject?: string; html?: string }).find((j) => j?.to === "pengganti@test.local");
      expect(emailJob?.subject).toBe("Undangan User Tambahan Facport");
      expect(emailJob?.html).toContain("Tim Facport");
      expect(emailJob?.html).toContain("/invite/");
      const row = await seatRow(s.seatId);
      expect(emailJob?.html).not.toContain(row.inviteTokenHash!); // hanya hash di DB, token mentah hanya di tautan email
    } finally {
      send.mockRestore();
    }
    const [note] = await db.select().from(notifications).where(and(eq(notifications.userId, s.owner.id), eq(notifications.type, "seat_access_changed_by_admin")));
    expect(note!.body).toContain("pengganti@test.local");
    const [ev] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, s.du), eq(auditLogs.action, "revoke_seat")));
    expect(ev!.changes).toMatchObject({ newInviteEmail: "pengganti@test.local" });
  });

  test("newEmail bukan email → 422 dan slot tidak berubah", async () => {
    const s = await scenario();
    const admin = await makeUser("admin", "admin");
    expect((await revoke(admin.cookie, s.du, s.seatId, { reason: "uji", newEmail: "bukan-email" })).status).toBe(422);
    expect((await seatRow(s.seatId)).status).toBe("active");
  });
});

describe("GET /admin/data-usaha/:id/access", () => {
  test("memuat pemilik, daftar slot (member/undangan, masa berlaku kursi) dan riwayat gabungan terbaru dulu dengan nama pelaku", async () => {
    const s = await scenario();
    const admin = await makeUser("admin", "admin");
    await revoke(admin.cookie, s.du, s.seatId, { reason: "Resign" });
    const res = await access(admin.cookie, s.du);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dataUsaha: { id: string; ownerEmail: string };
      seats: { id: string; status: string; memberEmail: string | null; seatEndAt: string | null }[];
      history: { action: string; actorName: string | null; changes: Record<string, unknown> }[];
    };
    expect(body.dataUsaha).toMatchObject({ id: s.du, ownerEmail: s.owner.email });
    expect(body.seats).toHaveLength(1);
    expect(body.seats[0]).toMatchObject({ id: s.seatId, status: "available", memberEmail: null });
    expect(body.seats[0]!.seatEndAt).not.toBeNull();
    expect((body.seats[0] as unknown as { seatExpired: boolean }).seatExpired).toBe(false);
    expect(body.history[0]).toMatchObject({ action: "revoke_seat", actorName: "Seats admin" });
    expect(body.history[0]!.changes).toMatchObject({ reason: "Resign", email: s.member.email });
  });

  test("Data Usaha tak dikenal → 404", async () => {
    const admin = await makeUser("admin", "admin");
    expect((await access(admin.cookie, "00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});
