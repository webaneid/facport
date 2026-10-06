import { getCompanyTimezone } from "../lib/company-timezone";
import { findLegacyYearCandidates, applyLegacyYearCorrections } from "../lib/legacy-year-correction";

// § Fase 179, ADR-0041 — koreksi SATU KALI langganan tahunan 360 hari menjadi tepat 1 tahun kalender (lihat `lib/legacy-year-correction.ts` untuk aturan kandidat).
// DEFAULT = DRY-RUN (hanya menampilkan daftar, TIDAK mengubah apa pun). Terapkan dengan `--commit` SETELAH daftar direview. Idempoten (aman dijalankan ulang).
//   dry-run : bun run src/scripts/correct-legacy-year-subscriptions.ts
//   terapkan: bun run src/scripts/correct-legacy-year-subscriptions.ts --commit
// (alias `bun run db:correct-legacy-year` = dry-run yang sama)
const commit = process.argv.includes("--commit");
const timeZone = await getCompanyTimezone();
const candidates = await findLegacyYearCandidates(timeZone);

const fmt = (d: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone }).format(d);
console.log(`Zona waktu perusahaan: ${timeZone} · mode: ${commit ? "COMMIT (mengubah data)" : "DRY-RUN (tidak mengubah apa pun)"}`);
console.table(
  candidates.map((c) => ({
    langganan: c.subscriptionId.slice(0, 8),
    user: c.userEmail,
    paket: c.planName,
    mulai: fmt(c.startAt),
    "berakhir sekarang": fmt(c.endAt),
    "berakhir sesudah koreksi": fmt(c.newEndAt),
    "tambahan hari": c.addedDays,
    tahun: c.years,
  })),
);
console.log(`Kandidat: ${candidates.length}`);

if (!commit) {
  console.log("Dry-run selesai — tidak ada yang diubah. Tambahkan --commit untuk menerapkan.");
} else if (candidates.length === 0) {
  console.log("Tidak ada yang perlu dikoreksi.");
} else {
  const { corrected, skipped } = await applyLegacyYearCorrections(candidates, timeZone);
  console.log(`SELESAI — dikoreksi: ${corrected}, dilewati (berubah di tengah jalan): ${skipped}`);
}
process.exit(0);
