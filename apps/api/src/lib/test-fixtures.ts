import { db } from "./db";
import { dataUsaha, plans, subscriptions, memberSeats } from "../db/schema";

// § Fase 108, architecture-user-tambahan.md § Fase B1 — `subscriptions.dataUsahaId`
// NOT NULL sejak Fase 107, jadi SETIAP test yang insert baris `subscriptions`
// langsung (bukan lewat endpoint checkout/trial) butuh 1 Data Usaha dummy
// dulu. Fungsi bersama INI (bukan duplikasi per file, beda dari kebanyakan
// helper test lain di project ini) — dipakai di puluhan file test sekaligus,
// cukup berat kalau diduplikasi 1-per-1 seperti pola `signUp`/`signIn` biasa.
export async function createTestDataUsaha(userId: string, name = "Data Usaha Test"): Promise<string> {
  const [row] = await db.insert(dataUsaha).values({ userId, name }).returning();
  return row!.id;
}

// § Fase 110, architecture-user-tambahan.md — dipakai puluhan test seat/
// invite/subscription-gate sekaligus (alasan sama seperti
// `createTestDataUsaha` di atas — beban duplikasi terlalu besar kalau
// ditulis ulang per file). Bikin 1 subscription `seat_addon` AKTIF +
// baris `member_seats` terkait dalam status `available` — pola PERSIS
// aktivasi seat sungguhan (§ admin/orders.route.ts confirm).
export async function createTestSeat(primaryUserId: string, dataUsahaId: string): Promise<string> {
  const [plan] = await db
    .insert(plans)
    .values({ name: `Seat Test Plan ${crypto.randomUUID()}`, price: 20000, durationDays: 30, modules: [], kind: "seat_addon" })
    .returning();
  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId: primaryUserId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    })
    .returning();
  const [seat] = await db.insert(memberSeats).values({ primaryUserId, dataUsahaId, seatSubscriptionId: sub!.id }).returning();
  return seat!.id;
}
