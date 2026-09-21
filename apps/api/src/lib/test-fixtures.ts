import { eq } from "drizzle-orm";
import { db } from "./db";
import { encrypt } from "./encryption";
import { accurateConnections, dataUsaha, plans, subscriptions, memberSeats } from "../db/schema";

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

// § Fase 143, ADR-0037 — koneksi Accurate model baru (1 per AKUN, `accurate_user_id` UNIK global — makanya id
// dibuat acak per panggilan). Kalau `dataUsahaId` diberikan, Data Usaha itu langsung menunjuk koneksi ini
// (plus database `accurateDbId` bila diisi) — pola PERSIS hasil callback OAuth + pilih database.
export async function createTestAccurateConnection(
  userId: string,
  opts: {
    dataUsahaId?: string;
    accurateDbId?: string;
    accurateDbAlias?: string;
    status?: string;
    grantedScopes?: string[] | null;
    accurateUserId?: string | null;
    accurateUserEmail?: string | null;
    /** Default true: database yang dipasang lewat fixture dianggap sudah dipilih/dikonfirmasi pemilik (alur normal). */
    dbConfirmed?: boolean;
    expiresAt?: Date;
  } = {},
) {
  const [connection] = await db
    .insert(accurateConnections)
    .values({
      userId,
      accessTokenEncrypted: encrypt("test-access-token"),
      refreshTokenEncrypted: encrypt("test-refresh-token"),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      status: opts.status ?? "active",
      grantedScopes: opts.grantedScopes === undefined ? null : opts.grantedScopes,
      accurateUserId: opts.accurateUserId === undefined ? `test-acc-${crypto.randomUUID()}` : opts.accurateUserId,
      accurateUserEmail: opts.accurateUserEmail ?? null,
    })
    .returning();
  if (opts.dataUsahaId) {
    await db
      .update(dataUsaha)
      .set({
        accurateConnectionId: connection!.id,
        accurateDbId: opts.accurateDbId ?? null,
        accurateDbAlias: opts.accurateDbAlias ?? null,
        accurateDbConfirmedAt: opts.accurateDbId && opts.dbConfirmed !== false ? new Date() : null,
      })
      .where(eq(dataUsaha.id, opts.dataUsahaId));
  }
  return connection!;
}
