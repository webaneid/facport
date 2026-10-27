import { describeNonAscii, isKeyField, normalizeKeyValue } from "./input-hygiene";

// § architecture-input-hygiene.md, ADR-0052 lapis 3 — "Pemeriksaan Data" yang ikut dikembalikan endpoint unggah (Pratinjau). HANYA melaporkan: tidak
// mengubah data. Kolom yang diperiksa = kolom yang DISARANKAN sistem ke field kunci (user masih bisa mengubah pemetaan, jadi ini perkiraan).
export type DataCheckWarning = {
  column: string;
  kind: "non_ascii";
  /** Jumlah sel bermasalah di kolom ini. */
  count: number;
  /** Nomor baris data (1 = baris data pertama), maks 5 contoh. */
  rows: number[];
  /** Nilai contoh pertama + daftar karakter mencurigakannya, mis. nomor berhuruf Cyrillic + kode U+0421-nya. */
  example: string;
};

export type DataCheck = {
  /** Sel teks yang dirapikan otomatis dari karakter tak terlihat (lapis 1). */
  cleanedCells: number;
  /** Sel kolom kunci yang dirapikan otomatis dari spasi ganda/huruf lebar penuh (lapis 2). */
  normalizedKeyCells: number;
  warnings: DataCheckWarning[];
};

const MAX_WARNING_COLUMNS = 20;
const MAX_SAMPLE_ROWS = 5;

export function buildDataCheck(rows: Record<string, unknown>[], suggestedMapping: Record<string, string>, cleanedCells: number): DataCheck {
  const keyColumns = Object.entries(suggestedMapping).filter(([, field]) => isKeyField(field)).map(([column]) => column);
  let normalizedKeyCells = 0;
  const warnings: DataCheckWarning[] = [];

  for (const column of keyColumns) {
    const warning: DataCheckWarning = { column, kind: "non_ascii", count: 0, rows: [], example: "" };
    rows.forEach((row, i) => {
      const value = row[column];
      if (typeof value !== "string" || value === "") return;
      const normalized = normalizeKeyValue(value);
      if (normalized !== value) normalizedKeyCells++;
      const odd = describeNonAscii(normalized);
      if (odd.length === 0) return;
      warning.count++;
      if (warning.rows.length < MAX_SAMPLE_ROWS) warning.rows.push(i + 1);
      if (warning.example === "") warning.example = `"${normalized}" — ${odd.join(", ")}`;
    });
    if (warning.count > 0 && warnings.length < MAX_WARNING_COLUMNS) warnings.push(warning);
  }

  return { cleanedCells, normalizedKeyCells, warnings };
}
