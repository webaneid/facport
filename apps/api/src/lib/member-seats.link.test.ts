import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { memberSeats, user as userTable } from "../db/schema";
import { createTestDataUsaha, createTestSeat } from "./test-fixtures";
import { linkSeatToMember, hashInviteToken } from "./member-seats";
import { revokeSeat } from "./seat-actions";

// § Fase 189B (temuan audit, Medium) — menerima undangan TIDAK boleh "menghidupkan" slot yang baru dicabut: penautan bersyarat (status 'invited' + hash token yang sama).
const runId = Date.now();
let seq = 0;
async function makeUser() {
  const id = `link-seat-${runId}-${seq++}`;
  await db.insert(userTable).values({ id, name: "Link Seat", email: `${id}@test.local`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  return id;
}
async function invitedSeat(token: string) {
  const owner = await makeUser();
  const du = await createTestDataUsaha(owner);
  const seatId = await createTestSeat(owner, du);
  await db.update(memberSeats).set({ status: "invited", invitedEmail: "undangan@test.local", inviteTokenHash: hashInviteToken(token), inviteTokenExpiresAt: new Date(Date.now() + 1e9) }).where(eq(memberSeats.id, seatId));
  return { owner, du, seatId };
}
const row = async (id: string) => (await db.select().from(memberSeats).where(eq(memberSeats.id, id)))[0]!;

describe("linkSeatToMember", () => {
  test("undangan masih sah → slot aktif untuk member, token dibuang, returns true", async () => {
    const { seatId } = await invitedSeat("token-sah");
    const member = await makeUser();
    expect(await linkSeatToMember(seatId, member, hashInviteToken("token-sah"))).toBe(true);
    expect(await row(seatId)).toMatchObject({ status: "active", memberUserId: member, inviteTokenHash: null });
  });

  test("balapan: slot DICABUT setelah undangan dibaca → penautan ditolak (false), slot tetap tersedia", async () => {
    const { owner, du, seatId } = await invitedSeat("token-balap");
    await revokeSeat({ seatId, dataUsahaId: du, actor: { id: owner, role: "owner" } });
    const member = await makeUser();
    expect(await linkSeatToMember(seatId, member, hashInviteToken("token-balap"))).toBe(false);
    expect(await row(seatId)).toMatchObject({ status: "available", memberUserId: null });
  });

  test("balapan: slot dipindahkan ke email lain (hash token baru) → token lama ditolak", async () => {
    const { owner, du, seatId } = await invitedSeat("token-lama");
    await revokeSeat({ seatId, dataUsahaId: du, actor: { id: owner, role: "admin" }, reason: "pindah", newEmail: "baru@test.local" });
    const member = await makeUser();
    expect(await linkSeatToMember(seatId, member, hashInviteToken("token-lama"))).toBe(false);
    expect(await row(seatId)).toMatchObject({ status: "invited", invitedEmail: "baru@test.local", memberUserId: null });
  });

  test("dipakai dua kali (klik ganda): yang kedua ditolak, anggota pertama tidak tertimpa", async () => {
    const { seatId } = await invitedSeat("token-ganda");
    const first = await makeUser();
    const second = await makeUser();
    expect(await linkSeatToMember(seatId, first, hashInviteToken("token-ganda"))).toBe(true);
    expect(await linkSeatToMember(seatId, second, hashInviteToken("token-ganda"))).toBe(false);
    expect((await row(seatId)).memberUserId).toBe(first);
  });
});
