import { describe, test, expect } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { auditLogs, memberSeats, session as sessionTable, user as userTable } from "../db/schema";
import { createTestDataUsaha, createTestSeat } from "./test-fixtures";
import { SeatActionError, inviteSeat, revokeSeat } from "./seat-actions";
import { hashInviteToken } from "./member-seats";

// § Fase 189B — logika seat (undang/cabut) dipakai pemilik (`/me/team`) DAN admin (`/admin/data-usaha/:id/seats`); tiap aksi menulis riwayat Data Usaha dalam transaksi yang sama.
const runId = Date.now();
let seq = 0;

async function makeUser(name: string) {
  const id = `seat-actions-${runId}-${seq++}`;
  await db.insert(userTable).values({ id, name, email: `${id}@test.local`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  return { id, email: `${id}@test.local` };
}

async function setup(status: "available" | "invited" | "active" = "available") {
  const owner = await makeUser("Pemilik");
  const du = await createTestDataUsaha(owner.id);
  const seatId = await createTestSeat(owner.id, du);
  const member = await makeUser("Member");
  if (status === "invited") {
    await db.update(memberSeats).set({ status: "invited", invitedEmail: "undangan@test.local", inviteTokenHash: "h", inviteTokenExpiresAt: new Date(Date.now() + 1e9) }).where(eq(memberSeats.id, seatId));
  } else if (status === "active") {
    await db.update(memberSeats).set({ status: "active", memberUserId: member.id, acceptedAt: new Date() }).where(eq(memberSeats.id, seatId));
    await db.insert(sessionTable).values({ id: `sess-${runId}-${seq++}`, token: `tok-${runId}-${seq++}`, userId: member.id, expiresAt: new Date(Date.now() + 1e9), createdAt: new Date(), updatedAt: new Date() });
  }
  return { owner, member, du, seatId };
}
const eventsOf = (du: string, action: string) =>
  db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "data_usaha"), eq(auditLogs.entityId, du), eq(auditLogs.action, action)));
const seatRow = async (id: string) => (await db.select().from(memberSeats).where(eq(memberSeats.id, id)))[0]!;

describe("inviteSeat", () => {
  test("slot tersedia → invited, hash token tersimpan (bukan token mentah), peristiwa invite_seat tercatat", async () => {
    const { owner, du, seatId } = await setup();
    const res = await inviteSeat({ seatId, dataUsahaId: du, actor: { id: owner.id, role: "owner" }, email: "baru@test.local" });
    const row = await seatRow(seatId);
    expect(row).toMatchObject({ status: "invited", invitedEmail: "baru@test.local" });
    expect(row.inviteTokenHash).toBe(hashInviteToken(res.token));
    expect(row.inviteTokenHash).not.toBe(res.token);
    const [ev] = await eventsOf(du, "invite_seat");
    expect(ev!.actorId).toBe(owner.id);
    expect(ev!.changes).toMatchObject({ seatId, email: "baru@test.local", by: "owner" });
  });

  test("slot tidak tersedia → SEAT_NOT_AVAILABLE; slot Data Usaha lain → SEAT_NOT_FOUND; tanpa peristiwa", async () => {
    const { owner, du, seatId } = await setup("invited");
    await expect(inviteSeat({ seatId, dataUsahaId: du, actor: { id: owner.id, role: "owner" }, email: "x@test.local" })).rejects.toMatchObject({ code: "SEAT_NOT_AVAILABLE" });
    const other = await setup();
    await expect(inviteSeat({ seatId: other.seatId, dataUsahaId: du, actor: { id: owner.id, role: "owner" }, email: "x@test.local" })).rejects.toMatchObject({ code: "SEAT_NOT_FOUND" });
    expect(await eventsOf(du, "invite_seat")).toHaveLength(0);
    expect(new SeatActionError("SEAT_NOT_FOUND")).toBeInstanceOf(Error);
  });
});

describe("revokeSeat", () => {
  test("member aktif dicabut: slot kembali tersedia, sesi member dicabut, peristiwa revoke_seat memuat email member + alasan admin", async () => {
    const { owner, member, du, seatId } = await setup("active");
    const admin = await makeUser("Admin");
    const res = await revokeSeat({ seatId, dataUsahaId: du, actor: { id: admin.id, role: "admin" }, reason: "Karyawan resign, diminta atasan" });
    expect(res).toMatchObject({ previousStatus: "active", previousMemberUserId: member.id, previousEmail: member.email });
    expect(await seatRow(seatId)).toMatchObject({ status: "available", memberUserId: null, invitedEmail: null, inviteTokenHash: null, revokedBy: admin.id });
    expect(await db.select().from(sessionTable).where(eq(sessionTable.userId, member.id))).toHaveLength(0);
    const [ev] = await eventsOf(du, "revoke_seat");
    expect(ev!.actorId).toBe(admin.id);
    expect(ev!.changes).toMatchObject({ seatId, previousStatus: "active", email: member.email, by: "admin", reason: "Karyawan resign, diminta atasan" });
    void owner;
  });

  test("undangan yang belum diterima dicabut: email = email undangan", async () => {
    const { owner, du, seatId } = await setup("invited");
    const res = await revokeSeat({ seatId, dataUsahaId: du, actor: { id: owner.id, role: "owner" } });
    expect(res).toMatchObject({ previousStatus: "invited", previousMemberUserId: null, previousEmail: "undangan@test.local" });
    const [ev] = await eventsOf(du, "revoke_seat");
    expect(ev!.changes).toMatchObject({ email: "undangan@test.local", by: "owner" });
    expect((ev!.changes as { reason?: unknown }).reason ?? null).toBeNull();
  });

  test("pindahkan akses: cabut + undang email baru di slot yang sama dalam SATU langkah; token dikembalikan untuk email undangan", async () => {
    const { member, du, seatId } = await setup("active");
    const admin = await makeUser("Admin");
    const res = await revokeSeat({ seatId, dataUsahaId: du, actor: { id: admin.id, role: "admin" }, reason: "Pindah ke pengganti", newEmail: "pengganti@test.local" });
    expect(res.invite?.email).toBe("pengganti@test.local");
    const row = await seatRow(seatId);
    expect(row).toMatchObject({ status: "invited", invitedEmail: "pengganti@test.local", memberUserId: null, revokedBy: admin.id });
    expect(row.inviteTokenHash).toBe(hashInviteToken(res.invite!.token));
    const [ev] = await eventsOf(du, "revoke_seat");
    expect(ev!.changes).toMatchObject({ email: member.email, newInviteEmail: "pengganti@test.local" });
  });

  test("slot sudah tersedia → SEAT_ALREADY_AVAILABLE; slot Data Usaha lain → SEAT_NOT_FOUND; tidak ada peristiwa", async () => {
    const a = await setup();
    await expect(revokeSeat({ seatId: a.seatId, dataUsahaId: a.du, actor: { id: a.owner.id, role: "owner" } })).rejects.toMatchObject({ code: "SEAT_ALREADY_AVAILABLE" });
    const b = await setup("active");
    await expect(revokeSeat({ seatId: b.seatId, dataUsahaId: a.du, actor: { id: a.owner.id, role: "owner" } })).rejects.toMatchObject({ code: "SEAT_NOT_FOUND" });
    expect(await eventsOf(a.du, "revoke_seat")).toHaveLength(0);
    expect((await seatRow(b.seatId)).status).toBe("active"); // seat Data Usaha lain tidak tersentuh
  });

  test("dua pencabutan BERSAMAAN pada slot yang sama: satu berhasil, satu SEAT_ALREADY_AVAILABLE, tepat satu peristiwa", async () => {
    const { owner, du, seatId } = await setup("active");
    const admin = await makeUser("Admin");
    const results = await Promise.allSettled([
      revokeSeat({ seatId, dataUsahaId: du, actor: { id: admin.id, role: "admin" }, reason: "A" }),
      revokeSeat({ seatId, dataUsahaId: du, actor: { id: owner.id, role: "owner" } }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "SEAT_ALREADY_AVAILABLE" });
    expect(await eventsOf(du, "revoke_seat")).toHaveLength(1);
  });
});
