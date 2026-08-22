// § architecture-accurate-integration.md § "Vendor (Data Master)" —
// TERVERIFIKASI 2026-08-20 via test call nyata (bukan tebakan): setting
// `vendorPayableAccountListNo` beneran dipakai Accurate saat posting
// Faktur Pembelian berikutnya ke vendor itu (bukan field kosmetik).
//
// MVP: 2 kolom saja (Nomor Vendor + Akun Hutang) — field vendor lain
// (alamat, NPWP, dst) SENGAJA belum didukung, lihat Known Limitations di
// phase-04-import-vendor.md kalau ditutup dengan status itu.
export const vendorPayableAccountMapping = {
  requiredFields: ["vendorNo", "payableAccountNo"] as const,
  fieldToAccuratePath: {
    vendorNo: "vendorNo",
    payableAccountNo: "vendorPayableAccountListNo",
  } as const,
  defaultColumnMap: {
    "Nomor Vendor": "vendorNo",
    "Vendor No": "vendorNo",
    "Akun Hutang": "payableAccountNo",
    "Kode Akun Hutang": "payableAccountNo",
  } as Record<string, string>,
};

export type VendorPayableAccountField = keyof typeof vendorPayableAccountMapping.fieldToAccuratePath;

// Bangun payload SEDERHANA (flat, bukan bentuk request Accurate langsung)
// dari 1 baris Excel — `saveVendorPayableAccount` (lib/accurate-vendor.ts)
// yang urus lookup `id` vendor + bentuk payload `vendor/save.do`
// sesungguhnya, karena butuh `id`+`name` internal yang tidak ada di Excel.
export function buildVendorPayableAccountPayload(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): { vendorNo: string; payableAccountNo: string } {
  const values: Partial<Record<VendorPayableAccountField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      values[field as VendorPayableAccountField] = rawRow[excelColumn];
    }
  }
  return {
    vendorNo: String(values.vendorNo ?? ""),
    payableAccountNo: String(values.payableAccountNo ?? ""),
  };
}
