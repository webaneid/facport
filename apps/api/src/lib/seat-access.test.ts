import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { plans, subscriptions, memberSeats, user as userTable } from "../db/schema";
import { memberAccessibleDataUsahaIds } from "./seat-access";
import { getAccessibleSubscriptionsWithPlans, getOwnedSubscriptionsWithPlans } from "./subscription-gate";
import { hasAccessToDataUsaha } from "./data-usaha";
import { createTestDataUsaha, createTestSeat } from "./test-fixtures";
import { meRoute } from "../routes/me.route";
import { teamRoute } from "../routes/team.route";

// § 2026-10-07 — celah: member lewat kursi (seat) tetap punya akses SELAMANYA setelah langganan kursinya berakhir (status slot "active" tidak pernah berubah, ketiga titik akses
// hanya mengecek status slot). Sekarang akses member sah HANYA selama langganan kursi masih aktif & belum lewat end_at.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(meRoute).use(teamRoute);
const DAY = 24 * 60 * 60 * 1000;
let seq = 0;

async function makeUser(tag: string) {
  const email = `seat-access-${tag}-${runId}-${++seq}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: "Seat Access" }) }),
  );
  const id = ((await res.json()) as { user: { id: string } }).user.id;
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, id));
  const signIn = await testApp.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }));
  return { id, email, cookie: signIn.headers.get("set-cookie") ?? "" };
}

// Pemilik punya Data Usaha + langganan modul aktif + 1 kursi yang dihuni `member` (status slot "active").
async function setup() {
  const owner = await makeUser("owner");
  const member = await makeUser("member");
  const dataUsahaId = await createTestDataUsaha(owner.id);
  const [plan] = await db.insert(plans).values({ name: `Seat Access Plan ${runId}-${seq}`, price: 1000, durationDays: 30, interval: "monthly", modules: ["purchase_invoice"] }).returning();
  await db.insert(subscriptions).values({ userId: owner.id, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * DAY), dataUsahaId });
  const seatId = await createTestSeat(owner.id, dataUsahaId);
  await db.update(memberSeats).set({ status: "active", memberUserId: member.id }).where(eq(memberSeats.id, seatId));
  const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));
  return { owner, member, dataUsahaId, seatId, seatSubscriptionId: seat!.seatSubscriptionId };
}
const setSeatSubscription = (id: string, values: Partial<typeof subscriptions.$inferInsert>) => db.update(subscriptions).set(values).where(eq(subscriptions.id, id));
const memberSees = async (memberId: string, dataUsahaId: string) => ({
  helper: (await memberAccessibleDataUsahaIds(memberId)).some((r) => r.dataUsahaId === dataUsahaId),
  gate: (await getAccessibleSubscriptionsWithPlans(memberId)).some((s) => s.subscription.dataUsahaId === dataUsahaId),
  access: await hasAccessToDataUsaha(memberId, dataUsahaId),
});

describe("akses member lewat kursi hanya selama langganan kursi berlaku", () => {
  test("kursi aktif → member punya akses di ketiga titik (helper, gerbang fitur, hasAccessToDataUsaha)", async () => {
    const { member, dataUsahaId } = await setup();
    expect(await memberSees(member.id, dataUsahaId)).toEqual({ helper: true, gate: true, access: true });
  });

  test("langganan kursi LEWAT end_at (status masih 'active', job belum jalan) → akses member hilang di SEMUA titik; pemilik tidak terpengaruh", async () => {
    const { owner, member, dataUsahaId, seatSubscriptionId } = await setup();
    await setSeatSubscription(seatSubscriptionId, { endAt: new Date(Date.now() - 1000) });
    expect(await memberSees(member.id, dataUsahaId)).toEqual({ helper: false, gate: false, access: false });
    expect(await hasAccessToDataUsaha(owner.id, dataUsahaId)).toBe(true);
    expect((await getOwnedSubscriptionsWithPlans(owner.id)).some((s) => s.subscription.dataUsahaId === dataUsahaId)).toBe(true);
  });

  test("status langganan kursi 'expired' / 'cancelled' → akses hilang; status slot member TIDAK diubah (kursi aktif lagi = member kembali otomatis)", async () => {
    const { member, dataUsahaId, seatId, seatSubscriptionId } = await setup();
    for (const status of ["expired", "cancelled"]) {
      await setSeatSubscription(seatSubscriptionId, { status });
      expect((await memberSees(member.id, dataUsahaId)).access).toBe(false);
    }
    expect((await db.select().from(memberSeats).where(eq(memberSeats.id, seatId)))[0]!.status).toBe("active");
    await setSeatSubscription(seatSubscriptionId, { status: "active", endAt: new Date(Date.now() + 10 * DAY) });
    expect(await memberSees(member.id, dataUsahaId)).toEqual({ helper: true, gate: true, access: true });
  });

  test("end_at kursi NULL (data lama) tetap berlaku; slot yang belum 'active' (undangan/kosong) tidak pernah memberi akses", async () => {
    const { member, dataUsahaId, seatId, seatSubscriptionId } = await setup();
    await setSeatSubscription(seatSubscriptionId, { endAt: null });
    expect((await memberSees(member.id, dataUsahaId)).access).toBe(true);
    for (const status of ["invited", "available"]) {
      await db.update(memberSeats).set({ status }).where(eq(memberSeats.id, seatId));
      expect((await memberSees(member.id, dataUsahaId)).access).toBe(false);
    }
  });
});

describe("GET /me/data-usaha & GET /me/team", () => {
  test("/me/data-usaha: kursi berlaku → Data Usaha pemilik muncul di daftar member; kursi berakhir → hilang (pilih-usaha tidak menawarkannya)", async () => {
    const { member, dataUsahaId, seatSubscriptionId } = await setup();
    const list = async () => {
      const res = await testApp.handle(new Request("http://localhost/me/data-usaha", { headers: { cookie: member.cookie } }));
      return ((await res.json()) as { dataUsaha: { id: string }[] }).dataUsaha.map((d) => d.id);
    };
    expect(await list()).toContain(dataUsahaId);
    await setSeatSubscription(seatSubscriptionId, { endAt: new Date(Date.now() - 1000) });
    expect(await list()).not.toContain(dataUsahaId);
  });

  test("/me/team: pemilik melihat kursi yang sudah berakhir ditandai (seatExpired) lengkap dengan tanggal berakhirnya; kursi berlaku tidak ditandai", async () => {
    const { owner, dataUsahaId, seatId, seatSubscriptionId } = await setup();
    const seats = async () => {
      const res = await testApp.handle(new Request(`http://localhost/me/team?dataUsahaId=${dataUsahaId}`, { headers: { cookie: owner.cookie } }));
      return ((await res.json()) as { seats: { id: string; seatExpired: boolean; seatEndAt: string | null }[] }).seats;
    };
    expect((await seats()).find((s) => s.id === seatId)!.seatExpired).toBe(false);
    const ended = new Date(Date.now() - 2 * DAY);
    await setSeatSubscription(seatSubscriptionId, { endAt: ended });
    const expired = (await seats()).find((s) => s.id === seatId)!;
    expect(expired.seatExpired).toBe(true);
    expect(new Date(expired.seatEndAt!).getTime()).toBe(ended.getTime());
    await setSeatSubscription(seatSubscriptionId, { status: "expired", endAt: new Date(Date.now() + 5 * DAY) });
    expect((await seats()).find((s) => s.id === seatId)!.seatExpired).toBe(true); // status bukan aktif juga dianggap berakhir
  });
});
