import { eq } from "drizzle-orm";
import { db } from "./db";
import { memberSeats, subscriptions, user as userTable } from "../db/schema";

// § Fase 189B/189C — daftar slot User Tambahan sebuah Data Usaha (dengan member, masa berlaku kursi, dan `seatExpired`). Dipakai panel admin per Data Usaha
// (`routes/admin/seats.route.ts`) DAN Insight per pelanggan (`routes/admin/insights.route.ts`). `seatExpired` dihitung di server (sama seperti `/me/team`): kursi tak aktif atau
// lewat `end_at` → member tidak bisa memakai Data Usaha walau slot masih terisi.
export async function listSeatsForDataUsaha(dataUsahaId: string, now = Date.now()) {
  const rows = await db
    .select({
      id: memberSeats.id,
      status: memberSeats.status,
      invitedEmail: memberSeats.invitedEmail,
      invitedAt: memberSeats.invitedAt,
      acceptedAt: memberSeats.acceptedAt,
      revokedAt: memberSeats.revokedAt,
      memberUserId: memberSeats.memberUserId,
      memberName: userTable.name,
      memberEmail: userTable.email,
      seatEndAt: subscriptions.endAt,
      seatSubscriptionStatus: subscriptions.status,
    })
    .from(memberSeats)
    .innerJoin(subscriptions, eq(subscriptions.id, memberSeats.seatSubscriptionId))
    .leftJoin(userTable, eq(userTable.id, memberSeats.memberUserId))
    .where(eq(memberSeats.dataUsahaId, dataUsahaId));
  return rows.map((seat) => ({ ...seat, seatExpired: seat.seatSubscriptionStatus !== "active" || (seat.seatEndAt !== null && seat.seatEndAt.getTime() <= now) }));
}
