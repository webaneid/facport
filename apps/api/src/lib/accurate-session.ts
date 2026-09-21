import { openDatabase } from "./accurate";
import { decrypt } from "./encryption";
import type { accurateConnections } from "../db/schema";

// § architecture-accurate-integration.md § "Sesi Data Usaha" — session +
// host dari open-db.do SENGAJA tidak disimpan ke DB (beda sifat dari
// access/refresh token OAuth yang tahan 15 hari) — dibuka ulang tiap kali
// job import jalan. Dipanggil SEKALI di awal worker job, bukan per-row.
export type AccurateSessionContext = {
  accessToken: string;
  session: string;
  host: string;
};

export async function openAccurateSession(
  connection: typeof accurateConnections.$inferSelect,
  // § Fase 143, ADR-0037 — database dipilih per Data Usaha (`data_usaha.accurate_db_id`), BUKAN lagi di koneksi.
  accurateDbId: string | null,
): Promise<AccurateSessionContext> {
  if (!accurateDbId) {
    throw new Error("Data Usaha belum memilih database Accurate — pilih database dulu");
  }
  const accessToken = decrypt(connection.accessTokenEncrypted);
  const { session, host } = await openDatabase(accessToken, Number(accurateDbId));
  return { accessToken, session, host };
}
