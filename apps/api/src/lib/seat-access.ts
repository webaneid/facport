import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "./db";
import { memberSeats, subscriptions } from "../db/schema";

// § 2026-10-07 — SATU aturan "member boleh memakai Data Usaha lewat kursi (seat)": status slot `active` DAN langganan kursinya (`seat_subscription_id`) MASIH AKTIF
// (status active, end_at belum lewat; end_at NULL = data lama, dianggap berlaku). Dulu ketiga titik akses member (gerbang fitur `subscription-gate.ts`, `hasAccessToDataUsaha`,
// `GET /me/data-usaha`) hanya mengecek `member_seats.status = 'active'` — status itu TIDAK PERNAH berubah saat langganan kursi berakhir, jadi member tetap punya akses
// selamanya setelah kursinya habis (dokumen sudah menyebut "slot ikut berakhir", kodenya tidak). Status slot sengaja TIDAK diubah saat kursi berakhir: kalau langganan kursi
// diaktifkan kembali (admin / perpanjangan), member otomatis kembali tanpa undang ulang.
// Dikembalikan sebagai subquery Drizzle (dipakai di `inArray(dataUsaha.id, ...)`).
export function memberAccessibleDataUsahaIds(userId: string, now: Date = new Date()) {
  return db
    .select({ dataUsahaId: memberSeats.dataUsahaId })
    .from(memberSeats)
    .innerJoin(subscriptions, eq(subscriptions.id, memberSeats.seatSubscriptionId))
    .where(
      and(
        eq(memberSeats.memberUserId, userId),
        eq(memberSeats.status, "active"),
        eq(subscriptions.status, "active"),
        or(isNull(subscriptions.endAt), gt(subscriptions.endAt, now)),
      ),
    );
}
