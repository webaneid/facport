import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { dataUsaha } from "../db/schema";

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
    .where(and(eq(dataUsaha.userId, userId), eq(dataUsaha.name, DEFAULT_DATA_USAHA_NAME), isNull(dataUsaha.accurateConnectionId)));
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
