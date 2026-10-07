import { Elysia } from "elysia";
import { eq, and, or, inArray, desc, gt, isNull } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { subscriptions, plans, dataUsaha } from "../db/schema";
import { memberAccessibleDataUsahaIds } from "./seat-access";
import { hasAccessToDataUsaha } from "./data-usaha";

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

// § Fase 175, ADR-0041 — akses diputus TEPAT di `end_at`, bukan menunggu job kedaluwarsa menjalankan flip `status`. Sebelumnya gerbang hanya
// percaya `status = 'active'` (job harian 01:00 UTC) → pelanggan masih bisa memakai fitur sampai ±24 jam setelah jam akhir. `end_at` NULL pada baris
// aktif (data lama tanpa tanggal akhir) tetap dianggap berlaku — tidak memutus akses siapa pun karena data tak lengkap.
function notExpiredNow() {
  return or(isNull(subscriptions.endAt), gt(subscriptions.endAt, new Date()));
}

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
        notExpiredNow(),
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
        notExpiredNow(),
        or(
          inArray(
            subscriptions.dataUsahaId,
            db.select({ id: dataUsaha.id }).from(dataUsaha).where(eq(dataUsaha.userId, userId)),
          ),
          // § 2026-10-07 — kursi harus MASIH berlaku (lib/seat-access.ts), bukan sekadar status slot "active".
          inArray(subscriptions.dataUsahaId, memberAccessibleDataUsahaIds(userId)),
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
  // § Fase 175 — `end_at > sekarang` SEKARANG dicek langsung di query (`notExpiredNow`); job EXPIRE_SUBSCRIPTIONS tetap menjaga `status` &
  // mengirim notifikasi/email berakhir (kini tiap 10 menit, § lib/job-schedules.ts), tapi BUKAN lagi penjaga akses.
}

// § Fase 140, ADR-0035 — Data Usaha aktif dikirim web lewat header ini
// (cookie `active_data_usaha_id` host-only di app.*, tidak pernah sampai
// ke api.*). Header BUKAN otorisasi: selalu divalidasi terhadap
// kepemilikan/seat di DB.
export const DATA_USAHA_HEADER = "x-data-usaha-id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const subscriptionGatePlugin = new Elysia({ name: "subscription-gate" }).macro({
  moduleAccess: (moduleKey: string) => ({
    async resolve({ status, request }) {
      const { headers } = request;
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);

      const activeSubs = await getAccessibleSubscriptionsWithPlans(session.user.id);
      // § Fase 14 — moduleKey dicari lintas SEMUA subscription aktif
      // (union), bukan cuma 1 baris terbaru. `matching.subscription` yang
      // dikembalikan adalah baris SPESIFIK yang cover moduleKey ini —
      // route pemanggil pakai ini (`subscription.id`) buat cek scope koneksi lewat DATA USAHA-nya
      // (§ Fase 143, ADR-0037: koneksi Accurate 1 per akun, dipegang Data Usaha — BUKAN lagi per sub-modul).
      // § Fase 140, ADR-0035 — SEBELUMNYA `.find()` mengambil subscription
      // TERBARU lintas semua Data Usaha (tanpa tahu Data Usaha aktif) →
      // upload bisa mendarat di perusahaan yang salah. Sekarang disaring
      // per Data Usaha; kalau ambigu tanpa header → fail closed (409).
      const requested = headers.get(DATA_USAHA_HEADER)?.trim().toLowerCase();
      // Unduh template Excel = `<a href>` biasa (tidak bisa bawa header), isinya
      // STATIS per modul dan tidak menyentuh data tenant — jangan ditolak 409
      // untuk user multi-Data-Usaha (tetap wajib berlangganan modulnya).
      // § BUG DITEMUKAN & DIPERBAIKI 2026-10-02 (security review Fase 166)
      // — cek sebelumnya `endsWith("/import/template")` COCOK untuk 24
      // modul lama (`/{module}/import/template`) TAPI TIDAK untuk 2 route
      // baru AutoProduksi (`/autoproduksi/import-formula/template`,
      // `/autoproduksi/import-produksi/template` — prefix beda, bukan
      // `/import/`). Diperlebar ke `endsWith("/template")` (TIDAK ADA
      // endpoint `/template` lain di luar konteks import, dicek via grep)
      // supaya pola path baru manapun otomatis ikut ter-cover, tidak perlu
      // hardcode per-modul lagi tiap kali ada struktur path baru.
      const isStaticTemplateDownload = request.method === "GET" && new URL(request.url).pathname.endsWith("/template");
      let candidates = activeSubs.filter((s) => s.plan.modules.includes(moduleKey));
      if (requested) {
        if (!UUID_RE.test(requested) || !(await hasAccessToDataUsaha(session.user.id, requested))) {
          return status(403, { code: "DATA_USAHA_FORBIDDEN" });
        }
        candidates = candidates.filter((s) => s.subscription.dataUsahaId === requested);
      } else if (!isStaticTemplateDownload && new Set(candidates.map((s) => s.subscription.dataUsahaId)).size > 1) {
        return status(409, { code: "DATA_USAHA_REQUIRED" });
      }
      const matching = candidates[0];
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
