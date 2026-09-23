// § Fase 151, ADR-0038 — port pola `readExcel()`+filter baris "CONTOH-HAPUS" dari `tool.html` legacy (baris
// 1388-1394, 1420-1422). `xlsx` (SheetJS) di-`import()` DINAMIS di sini (dipanggil dari halaman `/konverter/*`
// SAJA) — JANGAN ubah jadi `import` statis di atas file, itu akan menarik ~1MB+ library ke bundle GLOBAL
// (§ architecture-konverter.md § "Fondasi Kode Baru").
export type ReadExcelResult = {
  rows: Record<string, unknown>[];
  sheet: string;
  sheetCount: number;
  /** § jumlah baris contoh template ("CONTOH-HAPUS ...") yang dilewati — SAMA logic legacy: SATU pun sel di baris
   * itu cocok regex sudah cukup menandai baris itu contoh, bukan data asli. */
  skippedExampleRows: number;
};

export async function readExcelFile(file: File): Promise<ReadExcelResult> {
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0]!;
  const ws = wb.Sheets[sheetName]!;
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });

  let skippedExampleRows = 0;
  const rows = rawRows.filter((r) => {
    const isExample = Object.values(r).some((v) => typeof v === "string" && /CONTOH[^A-Za-z0-9]{0,3}HAPUS/i.test(v));
    if (isExample) skippedExampleRows++;
    return !isExample;
  });

  return { rows, sheet: sheetName, sheetCount: wb.SheetNames.length, skippedExampleRows };
}
