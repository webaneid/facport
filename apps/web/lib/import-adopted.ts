// § 2026-10-26 — baris SUKSES yang ditautkan ke faktur yang SUDAH ada di Accurate (percobaan sebelumnya gagal membaca hasil simpan, bukan datanya salah).
// Worker menulis keterangan pada `errorMessage` baris sukses itu, diawali penanda di bawah (sama dengan `ADOPTED_NOTE_PREFIX` di apps/api/src/lib/accurate-adopt-existing.ts).
export const ADOPTED_NOTE_PREFIX = "Sudah ada di Accurate";

export function isAdoptedRow(row: { status: string; errorMessage: string | null }): boolean {
  return row.status === "success" && !!row.errorMessage && row.errorMessage.startsWith(ADOPTED_NOTE_PREFIX);
}
