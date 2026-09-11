import { db } from "./db";
import { dataUsaha } from "../db/schema";

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
