import * as XLSX from "xlsx";

export type ParsedExcel = {
  headers: string[];
  rows: Record<string, unknown>[];
};

// § architecture-accurate-integration.md § 3 — parsing generik, mapping
// kolom→field Accurate ditentukan terpisah (lib/import-mapping/*).
export function parseExcelBuffer(buffer: Buffer): ParsedExcel {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName]!;

  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? [];
  const headers = headerRow.map((h) => String(h ?? "").trim()).filter(Boolean);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return { headers, rows };
}

export type TemplateFieldGuide = {
  column: string; // header kolom persis seperti yang dipakai defaultColumnMap
  required: boolean;
  example: string; // nilai contoh, dipakai di baris contoh sheet "Template"
  format?: string; // aturan format kalau ada standar khusus (mis. tanggal)
  description: string;
};

// Sheet "Template" WAJIB tetap index-0 workbook — parseExcelBuffer() ambil
// workbook.SheetNames[0] sebagai sheet DATA saat user upload balik. Sheet
// "Petunjuk Pengisian" ditambah SETELAHNYA supaya tidak ganggu parsing itu.
// Baris ke-2 sheet "Template" diisi CONTOH (bukan kosong) — user WAJIB
// hapus baris itu sebelum isi data sendiri, diingatkan eksplisit di sheet
// Petunjuk (§ user request 2026-08-27: template lama cuma header polos,
// tidak ada panduan cara isi/standar format sama sekali).
export function generateTemplateBuffer(fields: TemplateFieldGuide[]): Buffer {
  const columns = fields.map((f) => f.column);

  const templateSheet = XLSX.utils.aoa_to_sheet([columns, fields.map((f) => f.example)]);
  templateSheet["!cols"] = columns.map(() => ({ wch: 20 }));

  const guideRows: (string | number)[][] = [
    ["Petunjuk Pengisian Template Import"],
    [],
    ["No", "Nama Kolom", "Wajib?", "Format / Standar", "Contoh", "Keterangan"],
    ...fields.map((f, i) => [i + 1, f.column, f.required ? "Wajib" : "Opsional", f.format ?? "-", f.example, f.description]),
    [],
    ["Catatan penting:"],
    ['1. Baris ke-2 di sheet "Template" adalah CONTOH pengisian — HAPUS baris itu sebelum upload data Anda sendiri.'],
    ['2. Kolom bertanda "Wajib" harus diisi untuk setiap baris, kolom "Opsional" boleh dikosongkan.'],
    ["3. Format tanggal HARUS DD/MM/YYYY (contoh: 19/08/2026) — format lain (mis. 2026-08-19) akan ditolak Accurate."],
    ["4. Nomor Vendor, Nomor Barang, dan nama-nama lain (satuan, gudang, termin) harus PERSIS SAMA seperti yang terdaftar di Accurate Online (besar-kecil huruf tidak masalah, tapi ejaan harus sama)."],
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet["!cols"] = [{ wch: 4 }, { wch: 22 }, { wch: 10 }, { wch: 30 }, { wch: 22 }, { wch: 55 }];
  guideSheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, templateSheet, "Template");
  XLSX.utils.book_append_sheet(workbook, guideSheet, "Petunjuk Pengisian");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
