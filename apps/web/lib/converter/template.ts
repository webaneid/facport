import type { ConverterType } from "./converter-type";

// § Fase 151, ADR-0038 — port pola "Unduh Template" dari `tool.html` legacy (baris 1460-1467): kolom pertama tiap
// baris contoh diberi awalan "CONTOH-HAPUS " (dibaca ulang & dilewati otomatis oleh `readExcelFile`, § baris
// legacy 1421-1422) supaya user tahu itu bukan data asli. BEDA dari template Facport (`generateTemplateBuffer`,
// apps/api) yang di-generate SERVER — ini 100% client-side (konsisten prinsip Konverter, § ADR-0038 poin 1).
export async function downloadConverterTemplate(type: ConverterType): Promise<void> {
  const XLSX = await import("xlsx");
  const examples = type.examples.map((row) => row.map((cell, i) => (i === 0 ? String(`CONTOH-HAPUS ${cell ?? ""}`).trim() : cell)));
  const ws = XLSX.utils.aoa_to_sheet([type.headers, ...examples]);
  ws["!cols"] = type.headers.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type.sheetName);
  XLSX.writeFile(wb, `template_${type.key}.xlsx`);
}
