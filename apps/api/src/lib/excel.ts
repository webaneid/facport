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
  // § Fase 147 — header DUPLIKAT (Excel client Work Order mengulang "Project No"/"Process Category Name"/"CLS1" di beberapa section):
  // `sheet_to_json` (dipakai `rawRows` di bawah) menamai kemunculan ke-2 dst "X_1", "X_2", sedangkan `header: 1` mengembalikan "X" apa
  // adanya. Tanpa penyamaan, daftar `headers` (UI "Cocokkan Kolom") berisi nama sama berulang dan TIDAK ada key baris yang cocok untuk
  // kemunculan ke-2+ (nilainya hilang diam-diam). Di sini `headers` diberi penamaan dedupe yang SAMA dengan key baris.
  const usedHeaders = new Set<string>();
  const headers = headerRow
    .map((h) => String(h ?? "").trim())
    .filter(Boolean)
    .map((name) => {
      let candidate = name;
      for (let counter = 1; usedHeaders.has(candidate); counter++) candidate = `${name}_${counter}`;
      usedHeaders.add(candidate);
      return candidate;
    });

  // § BUG DITEMUKAN 2026-09-11 (client retest Purchase Payment, error
  // Accurate "Nilai Pembayaran tidak mencukupi") — `sheet_to_json` pakai
  // nama kolom MENTAH (belum di-trim) sebagai key tiap object baris,
  // PADAHAL `headers` di atas (yang dipakai UI "Cocokkan Kolom" &
  // disimpan sebagai `columnMapping`) SUDAH di-trim. Kalau header Excel
  // punya spasi nyempil (mis. " Payment " — kejadian nyata client), semua
  // builder payload (`rawRow[trimmedName]`) GAGAL DIAM-DIAM (balik
  // `undefined`, biasanya default ke 0/kosong) — TANPA error yang jelas,
  // sampai validasi downstream (mis. saldo pembayaran Accurate) baru
  // ketahuan. Trim di sini SEKALI supaya key row SELALU konsisten dengan
  // `headers`/`columnMapping` — bug ini generik lintas SEMUA modul import
  // (bukan spesifik Purchase Payment/Tax), karena `parseExcelBuffer`
  // dipakai bersama oleh semua route `*-import.route.ts`.
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const rows = rawRows.map((row) => {
    const trimmed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      trimmed[key.trim()] = value;
    }
    return trimmed;
  });

  return { headers, rows };
}

export type TemplateFieldGuide = {
  column: string; // header kolom persis seperti yang dipakai defaultColumnMap
  required: boolean;
  example: string; // nilai contoh, dipakai di baris contoh sheet "Template"
  format?: string; // aturan format kalau ada standar khusus (mis. tanggal)
  description: string;
};

// § Fase 148/149 — baris contoh TAMBAHAN (selain baris pertama dari `f.example`), dipakai modul yang polanya BUKAN
// "1 baris = 1 dokumen" (Material Slip/Finished Good Slip: 1 dokumen bisa punya banyak barang & banyak baris lanjutan
// serial — tanpa contoh multi-baris, user tidak akan tahu cara isi pola itu cuma dari teks Petunjuk). Ditulis sebagai
// `{column, value}[]` (BUKAN array posisi mentah) supaya aman terhadap kolom BERULANG (mis. "Qty" muncul 2x, § Header
// Duplikat) — kemunculan ke-n suatu nama kolom di `overrides` mengisi kemunculan ke-n kolom itu di `fields`, sisanya
// (kolom yang tidak disebut) dikosongkan.
export type TemplateExampleOverride = { column: string; value: string | number };

function buildExampleRow(fields: TemplateFieldGuide[], overrides: TemplateExampleOverride[]): (string | number)[] {
  const queues = new Map<string, (string | number)[]>();
  for (const o of overrides) {
    const queue = queues.get(o.column) ?? [];
    queue.push(o.value);
    queues.set(o.column, queue);
  }
  return fields.map((f) => queues.get(f.column)?.shift() ?? "");
}

// Sheet "Template" WAJIB tetap index-0 workbook — parseExcelBuffer() ambil
// workbook.SheetNames[0] sebagai sheet DATA saat user upload balik. Sheet
// "Petunjuk Pengisian" ditambah SETELAHNYA supaya tidak ganggu parsing itu.
// Baris ke-2 (dan seterusnya, kalau `extraExampleRows` diisi) sheet "Template" diisi CONTOH (bukan kosong) — user
// WAJIB hapus baris itu sebelum isi data sendiri, diingatkan eksplisit di sheet Petunjuk (§ user request 2026-08-27:
// template lama cuma header polos, tidak ada panduan cara isi/standar format sama sekali).
export function generateTemplateBuffer(fields: TemplateFieldGuide[], extraExampleRows: TemplateExampleOverride[][] = []): Buffer {
  const columns = fields.map((f) => f.column);
  const exampleRows = [fields.map((f) => f.example), ...extraExampleRows.map((overrides) => buildExampleRow(fields, overrides))];

  const templateSheet = XLSX.utils.aoa_to_sheet([columns, ...exampleRows]);
  templateSheet["!cols"] = columns.map(() => ({ wch: 20 }));

  const guideRows: (string | number)[][] = [
    ["Petunjuk Pengisian Template Import"],
    [],
    ["No", "Nama Kolom", "Wajib?", "Format / Standar", "Contoh", "Keterangan"],
    ...fields.map((f, i) => [i + 1, f.column, f.required ? "Wajib" : "Opsional", f.format ?? "-", f.example, f.description]),
    [],
    ["Catatan penting:"],
    ['1. Baris CONTOH pengisian di sheet "Template" (baris ke-2 dan seterusnya, sebelum baris kosong) — HAPUS SEMUA baris itu sebelum upload data Anda sendiri.'],
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

// § diminta user 2026-09-27 — export baris GAGAL sebagai Excel, generik
// lintas SEMUA modul import (dipanggil dari `{module}-import.route.ts`
// masing-masing, pola sama `generateTemplateBuffer`/`parseExcelBuffer` di
// atas) — supaya client bisa review error offline atau perbaiki nilai di
// Excel lalu upload ulang sebagai import baru (kolomnya SENGAJA kolom
// ASLI Excel yang diupload, BUKAN nama field internal Accurate, supaya
// cocok balik ke template asli).
//
// ⚠️ BUG DITEMUKAN saat nulis test (2026-09-27) — urutan kolom TIDAK BOLEH
// diambil dari `Object.keys(rawData)` (kolom `jsonb` di DB): dikonfirmasi
// lewat query nyata, Postgres `jsonb` TIDAK menjamin urutan key sama
// dengan urutan aslinya saat disimpan (beda dari tipe `json` yang
// preserve teks apa adanya) — `{"Customer Number":.., "Item Number":..}`
// bisa balik jadi urutan lain sama sekali setelah round-trip DB. Fix:
// urutan kolom MAPPED ditentukan dari `canonicalFieldOrder` (array biasa
// dari SOURCE CODE, BUKAN dari DB — mis. `[...VALID_FIELDS]` di tiap
// route, yang aman karena dibangun dari object literal statis, JS
// menjamin urutan insersinya), kolom yang TIDAK di-mapping (ekstra di
// Excel asli, jarang tapi mungkin) ditaruh di akhir diurutkan alfabetis
// (tidak ada sumber urutan asli yang bisa diandalkan untuk kasus ini).
export function generateFailedRowsBuffer(
  rows: { rawData: Record<string, unknown>; errorMessage: string | null }[],
  columnMapping: Record<string, string>, // excelColumn -> field internal (dari `batch.columnMapping`)
  canonicalFieldOrder: string[], // urutan field STABIL dari source code (mis. `[...VALID_FIELDS]`)
): Buffer {
  const rawColumns = rows.length > 0 ? Object.keys(rows[0]!.rawData) : [];
  const fieldOrderIndex = new Map(canonicalFieldOrder.map((field, i) => [field, i]));
  const mappedColumns = rawColumns
    .filter((c) => columnMapping[c] !== undefined)
    .sort((a, b) => (fieldOrderIndex.get(columnMapping[a]!) ?? Infinity) - (fieldOrderIndex.get(columnMapping[b]!) ?? Infinity));
  const unmappedColumns = rawColumns.filter((c) => columnMapping[c] === undefined).sort();
  const columns = [...mappedColumns, ...unmappedColumns];

  const header = [...columns, "Pesan Error"];
  const dataRows = rows.map((r) => [...columns.map((c) => (r.rawData[c] as string | number | undefined) ?? ""), r.errorMessage ?? ""]);

  const sheet = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  sheet["!cols"] = header.map(() => ({ wch: 20 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Baris Gagal");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// § filename dari `Content-Disposition` di sini SEBAGIAN dari
// `batch.fileName` (nama file ASLI upload user, disimpan apa adanya di
// DB) — user-controlled string, bukan aman langsung ditaruh mentah dalam
// header HTTP: `"`/backslash bisa "kabur" dari atribut quoted-string,
// CR/LF bisa header injection. Strip karakter itu SAJA (bukan whitelist
// ketat) supaya nama file tetap mirip aslinya buat user, sambil aman
// dipakai di header.
export function sanitizeFilenamePart(name: string): string {
  return name.replace(/[\r\n"\\]/g, "").trim() || "file";
}
