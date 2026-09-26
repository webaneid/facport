import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { dataUsaha, memberSeats } from "../db/schema";

// § Fase 107/108, architecture-user-tambahan.md § Fase B0/B1 — SATU
// sumber kebenaran nama default (dipakai juga
// `scripts/backfill-data-usaha.ts`, JANGAN duplikasi string ini).
export const DEFAULT_DATA_USAHA_NAME = "Data Usaha Utama";

// § Dipakai jalur ADMIN (provisioning user baru — `admin/users.route.ts`,
// invoice manual — `admin/invoices.route.ts`, subscription manual —
// `admin/subscriptions.route.ts`/`lib/manual-subscription.ts`) yang
// belum/tidak mengharuskan admin eksplisit pilih Data Usaha di UI (itu
// baru dibangun Fase 109/110) — auto-buat/reuse 1 "Data Usaha Utama"
// per user, pola SAMA PERSIS `scripts/backfill-data-usaha.ts`.
//
// TIDAK dipakai jalur SELF-SERVICE (checkout/trial customer, § lib
// `assertOwnsDataUsaha` di bawah) — di situ `dataUsahaId` WAJIB eksplisit
// dari body request (user sadar pilih Data Usaha mana, bukan auto-default
// diam-diam tanpa sepengetahuan mereka).
export async function getOrCreateDefaultDataUsaha(userId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(dataUsaha)
    // § Fase 143 — TANPA filter `isNull(accurateConnectionId)` lagi: pointer koneksi kini HIDUP (dulu mati, jadi filter itu
    // selalu cocok). Dengan filter, Data Usaha Utama yang sudah terhubung tidak ketemu → duplikat dibuat tiap panggilan admin.
    .where(and(eq(dataUsaha.userId, userId), eq(dataUsaha.name, DEFAULT_DATA_USAHA_NAME)));
  if (existing) return existing.id;

  const [created] = await db.insert(dataUsaha).values({ userId, name: DEFAULT_DATA_USAHA_NAME }).returning();
  return created!.id;
}

// § Dipakai `subscriptions.route.ts` checkout/trial — validasi Data
// Usaha yang dikirim client BENAR MILIK user yang login (cegah user A
// checkout/trial ke Data Usaha milik user B — celah IDOR kalau tidak
// dicek, sama kelas bug seperti ownership check resource lain di
// project ini).
export async function ownsDataUsaha(userId: string, dataUsahaId: string): Promise<boolean> {
  const [row] = await db.select({ id: dataUsaha.id }).from(dataUsaha).where(and(eq(dataUsaha.id, dataUsahaId), eq(dataUsaha.userId, userId)));
  return !!row;
}

// § Fase 113, security review — pemilik SEKARANG (`ownsDataUsaha`) ATAU
// member seat AKTIF SEKARANG untuk Data Usaha ini. Dipakai endpoint READ
// yang scoped `dataUsahaId` tapi query dasarnya cuma filter kolom `userId`
// yang DIBEKUKAN saat dibuat (`importBatches.userId`,
// `accurateConnections.userId`) — kolom itu TIDAK ikut berubah saat
// kepemilikan Data Usaha ditransfer (`lib/ownership-transfer.ts`) atau
// seat di-revoke, jadi filter `userId` saja TIDAK CUKUP untuk buktikan
// user masih berhak akses Data Usaha itu SEKARANG (temuan security review:
// mantan pemilik/member yang sudah kehilangan akses tetap bisa lihat
// histori/koneksi Data Usaha itu kalau masih ingat/simpan `dataUsahaId`-nya
// dan panggil endpoint API langsung, bypass gate `layout.tsx`). Dipakai
// `GET /me/stats`, `GET /me/import-batches`, `GET /accurate/connections`
// SEBELUM query utama dijalankan — bukan cuma andalkan narrowing JOIN.
export async function hasAccessToDataUsaha(userId: string, dataUsahaId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: dataUsaha.id })
    .from(dataUsaha)
    .where(
      and(
        eq(dataUsaha.id, dataUsahaId),
        or(
          eq(dataUsaha.userId, userId),
          inArray(
            dataUsaha.id,
            db
              .select({ dataUsahaId: memberSeats.dataUsahaId })
              .from(memberSeats)
              .where(and(eq(memberSeats.memberUserId, userId), eq(memberSeats.status, "active"))),
          ),
        ),
      ),
    );
  return !!row;
}

// § diminta user 2026-09-27 — increment/decrement ATOMIK counter permanen
// "efisiensi waktu kerja" (`data_usaha.cumulativeSuccessfulRowCount`, §
// komentar kolom itu untuk kenapa kolom ini ada). Dipanggil dari
// `workers/index.ts`: `delta` POSITIF di titik final `IMPORT_TO_ACCURATE`
// (baris baru sukses), NEGATIF di `CANCEL_IMPORT` (baris yang tadinya
// sukses dibatalkan). `sql` increment (bukan read-modify-write di JS)
// supaya aman dari race condition kalau 2 job berbeda kebetulan nyentuh
// Data Usaha yang sama nyaris bersamaan. `GREATEST(..., 0)` jaga
// defensif — counter TIDAK BOLEH negatif walau ada skenario tak terduga.
export async function addCumulativeSuccessfulRows(dataUsahaId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  await db
    .update(dataUsaha)
    .set({ cumulativeSuccessfulRowCount: sql`GREATEST(${dataUsaha.cumulativeSuccessfulRowCount} + ${delta}, 0)` })
    .where(eq(dataUsaha.id, dataUsahaId));
}
