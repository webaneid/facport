// § architecture-accurate-integration.md § "Scope Sesuai Paket Langganan".
// ✅ SEMUA scope di bawah VERIFIED 2026-08-19 terhadap daftar scope resmi
// LENGKAP (222 scope) yang diambil dari OpenAPI spec publik Accurate
// (https://account.accurate.id/open-api/json.do, TIDAK login-gated —
// lihat architecture-accurate-integration.md § "Dokumentasi Resmi") —
// bukan tebakan.
// § Fase 14, ADR-0019 — key diganti dari grup top-level
// (pembelian/penjualan/dst) ke SUB-MODUL (persis 5 yang dijual client:
// purchase_invoice, sales_invoice, sales_receipt, purchase_payment,
// journal_voucher). `purchase_order`/`receive_item` (dulu ikut bundel
// "pembelian") DIHAPUS dari sini — bukan salah satu dari 5 sub-modul
// yang dijual sekarang, scope-nya balik lagi kalau/pas sub-modul itu
// benar-benar dibangun (pola sama seperti sebelumnya: scope disiapkan
// SAAT modul itu jadi giliran, bukan mendahului).
export const MODULE_ACCURATE_SCOPES: Record<string, string[]> = {
  // § Fase 75 — `data_classification_view`/`_save` ditambah untuk
  // auto-create Kategori Keuangan (Atribut Tambahan item/expense-level,
  // `findOrCreateDataClassification`, mirror Fase 68 Sales Invoice) —
  // koneksi existing SEBELUM penambahan ini wajib re-authorize ulang.
  // § Fase 78 (2026-09-09) — BUG DITEMUKAN & DIPERBAIKI: `vendor_view`/
  // `vendor_save` DIKEMBALIKAN ke sini. ADR-0026 (commit `1bc9256`)
  // memindahkan KEDUA scope ini SEPENUHNYA ke `vendor_payable_account`
  // dengan asumsi cuma dipakai fitur "Import Akun Hutang Pemasok"
  // (`vendor-payable-account-import.route.ts`) — TAPI `findOrCreateVendor`
  // (Fase 05, dipanggil UNCONDITIONAL di `processPurchaseInvoiceGroup`
  // untuk cek/bikin vendor SETIAP kali import Faktur Pembelian, fitur
  // INTI Purchase Invoice yang TIDAK ADA hubungannya dengan fitur Akun
  // Hutang Pemasok) JUGA butuh scope ini (`vendor/list.do` buat cek
  // existing, `vendor/save.do` buat auto-create). Akibat ADR-0026:
  // SEMUA subscriber Purchase Invoice yang TIDAK JUGA subscribe Akun
  // Hutang Pemasok gagal 403 di baris PERTAMA setiap grup, sejak commit
  // itu di-deploy — baru ketahuan sekarang lewat retest client
  // (`docs/lessons-learned.md` 2026-09-09). Scope INI TETAP juga ada di
  // `vendor_payable_account` di bawah (2 modul sama-sama butuh, alasan
  // pakai beda) — BUKAN dipindah lagi, supaya keduanya jalan independen.
  purchase_invoice: [
    "purchase_invoice_view",
    "purchase_invoice_save",
    // § Fase 05 — auto-create item saat import Faktur Pembelian.
    "item_save",
    "data_classification_view",
    "data_classification_save",
    // § Fase 78 — auto-create/lookup vendor (`findOrCreateVendor`),
    // lihat komentar di atas.
    "vendor_view",
    "vendor_save",
  ],
  // § ADR-0026 — dulu dibundel gratis ke `purchase_invoice` (Fase 04),
  // sekarang sub-modul SENDIRI yang dijual terpisah (fitur "Import Akun
  // Hutang Pemasok" — endpoint bulk-update terpisah, BEDA dari
  // auto-create vendor di dalam import Purchase Invoice sendiri, § Fase
  // 78 di atas). Koneksi Accurate yang connect SEBELUM perubahan ini
  // WAJIB "Hubungkan Ulang" untuk dapat scope ini kalau baru sekarang
  // subscribe.
  vendor_payable_account: ["vendor_view", "vendor_save"],
  // § Fase 13 — SEHARUSNYA sudah ditambah saat itu (customer_view/save
  // dipakai `findOrCreateCustomer`, accurate-customer.ts), baru lengkap
  // sekarang di Fase 14 saat file ini dirombak total. Koneksi Accurate
  // existing yang connect SEBELUM scope ini ditambah TETAP perlu
  // re-authorize manual utk dapat scope baru — pola sama seperti Fase 04.
  // § Fase 68 — `data_classification_view`/`_save` ditambah untuk
  // auto-create Kategori Keuangan (Atribut Tambahan item-level,
  // `findOrCreateDataClassification`) — koneksi existing SEBELUM
  // penambahan ini juga wajib re-authorize ulang.
  sales_invoice: [
    "sales_invoice_view",
    "sales_invoice_save",
    "customer_view",
    "customer_save",
    "item_save",
    "data_classification_view",
    "data_classification_save",
  ],
  // § Fase 86 (2026-09-10) — `tax_view` ditambah untuk riset/validasi
  // "Tax ID" (lookup ke `/api/tax/detail.do` SEBELUM kirim payload
  // Sales Receipt, pola sama seperti `findOrCreateVendor`/`findOrCreateItem`).
  // Project masih tahap building, belum ada customer produksi yang
  // connect modul ini — jadi biaya "re-authorize" TIDAK relevan sekarang,
  // aman disiapkan lebih dulu sebelum fitur Tax ID benar-benar dieksekusi.
  sales_receipt: ["sales_receipt_view", "sales_receipt_save", "tax_view"],
  // § Fase 89 (2026-09-10) — `tax_view` ditambah untuk validasi "PPh ID"
  // (reuse `accurate-tax.ts` dari Sales Receipt Fase 86, lookup ke
  // `/api/tax/list.do` SEBELUM kirim payload Purchase Payment). Project
  // masih tahap building, belum ada customer produksi — aman ditambah
  // langsung (§ pelajaran sesi ini soal `tax_view` Sales Receipt).
  purchase_payment: ["purchase_payment_view", "purchase_payment_save", "glaccount_view", "tax_view"],
  // § Fase 98 (2026-09-10) — `data_classification_view`/`_save` ditambah
  // untuk auto-create Kategori Keuangan (`attribut1`-`attribut10`, §
  // Fase 95, `findOrCreateDataClassification`) — GAP ditemukan: field
  // ini ditambahkan Fase 95 TANPA scope-nya, akibatnya Accurate menolak
  // ("Kategori Keuangan X tidak ditemukan atau sudah dihapus") begitu
  // user isi kolom itu. Koneksi Accurate yang connect SEBELUM
  // penambahan ini WAJIB "Hubungkan Ulang" untuk dapat scope baru.
  journal_voucher: ["journal_voucher_view", "journal_voucher_save", "glaccount_view", "data_classification_view", "data_classification_save"],
  // § Fase 96 (2026-09-10) — `data_classification_view`/`_save` LANGSUNG
  // disertakan dari awal (§ pelajaran Fase 98: jangan tambah field
  // Kategori Keuangan tanpa scope pendukungnya).
  other_payment: ["other_payment_view", "other_payment_save", "glaccount_view", "data_classification_view", "data_classification_save"],
};

export function scopesForModules(modules: string[]): string[] {
  const scopes = new Set<string>(["item_view"]); // baseline — data referensi item hampir selalu dibutuhkan
  for (const mod of modules) {
    for (const scope of MODULE_ACCURATE_SCOPES[mod] ?? []) scopes.add(scope);
  }
  return [...scopes];
}
