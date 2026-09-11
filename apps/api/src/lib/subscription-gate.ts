import { Elysia } from "elysia";
import { eq, and, or, inArray, desc } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { subscriptions, plans, dataUsaha, memberSeats } from "../db/schema";

// § architecture-subscription.md § "Gating Akses Modul" — LAPISAN TERPISAH
// dari RBAC permission (lib/permission.ts). Permission jawab "role kamu
// boleh manggil endpoint import sama sekali?"; ini jawab "ADA subscription
// AKTIF yang TERMASUK modul spesifik ini?".
// § Fase 14, ADR-0019 — PLURAL (array), ganti getActiveSubscriptionWithPlan
// (singular, ambil 1 baris terbaru) — sejak 1 subscription = 1 sub-modul,
// 1 user BOLEH punya banyak subscription aktif bersamaan (1 per modul
// dibeli), bukan cuma 1.
//
// § Fase 110, architecture-user-tambahan.md — PECAH jadi 2 fungsi (dulu 1
// `getActiveSubscriptionsWithPlans`, gate lewat `subscriptions.userId`).
// Alasan (§ plan Fase 110 "Temuan Kritis" #1 & #2, DIVERIFIKASI ulang saat
// eksekusi, bukan cuma teori):
//   1. `subscriptions.userId` dibekukan saat checkout (siapa yang beli) —
//      TIDAK ikut berubah kalau kepemilikan Data Usaha ditransfer (Fase 111,
//      `data_usaha.userId` yang MUTABLE). Kalau gating akses tetap baca
//      `subscriptions.userId`, pemilik lama tetap "kelihatan" py akses
//      penuh pasca-transfer, pemilik baru nol akses.
//   2. `accurate.route.ts` `POST /connect` & `POST /reuse` pakai fungsi ini
//      untuk OTORISASI MUTASI (siapa boleh ubah/reuse koneksi Accurate
//      subscription tsb) — kalau fungsi yang sama diperluas mencakup akses
//      lewat seat (union), seorang MEMBER (yang cuma boleh PAKAI modul,
//      bukan ubah konfigurasi integrasi) bisa mengambil-alih koneksi
//      Accurate Data Usaha yang dia numpang. Privilege escalation nyata
//      kalau 1 fungsi dipakai untuk 2 keperluan berbeda ini.
// Solusi: 2 fungsi bernama eksplisit sesuai levelnya — JANGAN campur lagi.

// § OTORISASI/MUTASI — "apakah user ini PEMILIK Data Usaha subscription ini
// SEKARANG" (bukan "siapa yang beli dulu"). Dipakai endpoint yang MENGUBAH
// konfigurasi (koneksi Accurate): `accurate.route.ts` `POST /connect` & `POST
// /reuse`. TIDAK mencakup akses lewat seat — member TIDAK PERNAH lolos fungsi
// ini, sesuai desain (seat cuma untuk pakai modul, bukan kelola integrasi).
export async function getOwnedSubscriptionsWithPlans(userId: string) {
  return db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        eq(subscriptions.status, "active"),
        inArray(
          subscriptions.dataUsahaId,
          db.select({ id: dataUsaha.id }).from(dataUsaha).where(eq(dataUsaha.userId, userId)),
        ),
      ),
    )
    .orderBy(desc(subscriptions.createdAt));
}

// § AKSES/TAMPILAN — "apakah user ini BOLEH PAKAI modul ini SEKARANG",
// dari kepemilikan Data Usaha (union `getOwnedSubscriptionsWithPlans`)
// ATAU dari seat aktif (Data Usaha tempat dia numpang sebagai user
// tambahan). Dipakai `moduleAccess` macro (gate SEMUA endpoint import),
// `GET /me/subscriptions` (dashboard), `GET /accurate/subscriptions`
// (read-only, member boleh lihat status koneksi modul yang dia pakai).
export async function getAccessibleSubscriptionsWithPlans(userId: string) {
  return db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        eq(subscriptions.status, "active"),
        or(
          inArray(
            subscriptions.dataUsahaId,
            db.select({ id: dataUsaha.id }).from(dataUsaha).where(eq(dataUsaha.userId, userId)),
          ),
          inArray(
            subscriptions.dataUsahaId,
            db
              .select({ dataUsahaId: memberSeats.dataUsahaId })
              .from(memberSeats)
              .where(and(eq(memberSeats.memberUserId, userId), eq(memberSeats.status, "active"))),
          ),
        ),
      ),
    )
    // § security review 2026-09-04 (Low) — urutan WAJIB deterministik.
    // Invariant "1 modul aktif = 1 subscription" TIDAK dijaga unique
    // constraint DB — kalau user somehow punya 2 subscription aktif yang
    // sama-sama cover modul X, `.find()` di moduleAccess macro (di bawah)
    // harus konsisten ambil yang SAMA tiap request (terbaru), bukan
    // tergantung urutan return Postgres yang tidak dijamin tanpa ORDER BY.
    .orderBy(desc(subscriptions.createdAt));
  // § endAt > now TIDAK dicek manual di sini — job EXPIRE_SUBSCRIPTIONS
  // (§ architecture-jobs.md, jalan tiap hari) yang jaga `status` selalu
  // konsisten begitu lewat endAt, pola dari sebelum Fase 14, tidak berubah.
}

export const subscriptionGatePlugin = new Elysia({ name: "subscription-gate" }).macro({
  moduleAccess: (moduleKey: string) => ({
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);

      const activeSubs = await getAccessibleSubscriptionsWithPlans(session.user.id);
      // § Fase 14 — moduleKey dicari lintas SEMUA subscription aktif
      // (union), bukan cuma 1 baris terbaru. `matching.subscription` yang
      // dikembalikan adalah baris SPESIFIK yang cover moduleKey ini —
      // route pemanggil pakai ini buat resolve `accurateConnectionId`
      // modul yang bersangkutan (tiap sub-modul bisa beda koneksi
      // Accurate, § architecture-accurate-integration.md § 1).
      const matching = activeSubs.find((s) => s.plan.modules.includes(moduleKey));
      // § 1 kode error (gabung SUBSCRIPTION_INACTIVE + MODULE_NOT_IN_PLAN
      // lama) — beda-in "tidak ada subscription" vs "ada tapi bukan modul
      // ini" sudah tidak relevan begitu 1 user bisa punya banyak
      // subscription independen; dari sudut pandang customer sama-sama
      // "sub-modul ini belum kamu langganan".
      if (!matching) return status(403, { code: "MODULE_NOT_SUBSCRIBED" });

      return { user: session.user, session: session.session, subscription: matching.subscription };
    },
  }),
});
