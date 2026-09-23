// § Fase 151, ADR-0038, architecture-konverter.md — bentuk GENERIK 1 "Varian" Konverter (mirror `TYPES[key]` di
// `tool.html` legacy — `label`/`needsCurrency`/`note`/`headers`/`examples`/`sheet`/`file` + 3 fungsi murni
// `process`/`build`/`summary`). SATU interface dipakai SEMUA 16 tipe (dibangun bertahap Fase 151+, 1 file per
// tipe di `lib/converter/types/*.ts`) — halaman UI (`app/app/(protected)/konverter/{tipe}/page.tsx`) generik
// terhadap `ConverterType<TCtx>` ini, TIDAK perlu tahu detail tiap tipe.
export type ConverterOpts = { branch: string; defCurrency: string };

// § `errors`/`warnings` WAJIB ada di SETIAP `Ctx` (dibaca `summary()`/halaman UI generik) — tiap tipe menambah
// field lain sesuai kebutuhannya sendiri (`order`/`groups`, atau `items` untuk tipe non-dokumen seperti stdcost).
export type ConverterCtxBase = { errors: string[]; warnings: string[]; branch: string };

export type ConverterSummary = {
  // § [jumlah, label] per baris statistik kartu ringkasan — pola SAMA legacy (`s.stats.map(x => [x[0], x[1]])`).
  stats: [number, string][];
  totals: string;
  // § Fase 151 — BEDA dari legacy (yang tidak punya konsep kuota trial sama sekali, § ADR-0038 poin 5): field
  // EKSPLISIT ini (BUKAN diambil dari posisi tertentu di `stats`, yang urutan/maknanya beda-beda per tipe — mis.
  // `stdcost` bisa saja tidak punya "Baris item" di index yang sama) — dikirim APA ADANYA ke `POST
  // /me/conversion-logs` sebagai `rowCount` (§ `checkAndRecordConversionRowBudget`). WAJIB jumlah baris yang
  // LOLOS validasi (dihitung SETELAH filter error), bukan jumlah baris upload mentah.
  rowCount: number;
};

export type ConverterType<TCtx extends ConverterCtxBase = ConverterCtxBase> = {
  key: string; // moduleKey Facport, mis. "konverter_requisition" (§ MODULE_CATALOG)
  label: string;
  needsCurrency: boolean;
  // § HTML statis PENDEK (cuma tag <b>, hardcode di kode kita sendiri, BUKAN dari input user) — dirender via
  // `dangerouslySetInnerHTML` di halaman, SAMA seperti legacy (`$("typeNote").innerHTML = t.note`). Aman karena
  // sumbernya bukan data eksternal/user-controlled.
  note: string;
  headers: string[];
  examples: (string | number)[][];
  sheetName: string;
  fileName: string;
  process(rows: Record<string, unknown>[], opts: ConverterOpts): TCtx;
  build(ctx: TCtx): string;
  summary(ctx: TCtx): ConverterSummary;
};

// § Fase 156 — ditemukan saat porting `stdcost` (tipe PERTAMA yang pakai `items`, bukan `order`/`groups`):
// mirror legacy `render()` (`tool.html` baris 1409, `hasData=(ctx.order&&ctx.order.length)||(ctx.items&&
// ctx.items.length)`) — tombol Download WAJIB tetap nonaktif kalau `errors.length===0` TAPI TIDAK ADA data sama
// sekali (mis. file Excel diupload kosong/0 baris data) — 0 error di file kosong BUKAN berarti "valid", cuma
// "tidak ada yang bisa divalidasi". Duck-typing SENGAJA (bukan generic constraint) karena tiap `Ctx` beda field
// datanya (`order` utk 15 tipe dokumen, `items` utk `stdcost`) dan `ConverterCtxBase` tidak mendeklarasikan
// keduanya. `ConverterTypeView` (dipakai SEMUA tipe) memanggil ini SEBELUM `build()`, retroaktif menutup gap
// yang sama untuk 15 tipe yang sudah diporting sebelum fase ini (belum pernah ketahuan karena semuanya baru
// dites dengan data valid, bukan file kosong).
export function converterHasData(ctx: ConverterCtxBase): boolean {
  const anyCtx = ctx as unknown as { order?: unknown[]; items?: unknown[] };
  return (Array.isArray(anyCtx.order) && anyCtx.order.length > 0) || (Array.isArray(anyCtx.items) && anyCtx.items.length > 0);
}
