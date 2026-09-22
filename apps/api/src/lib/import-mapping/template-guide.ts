import type { TemplateFieldGuide } from "../excel";

// Data panduan buat generateTemplateBuffer() — TERPISAH dari
// defaultColumnMap (purchase-invoice.mapping.ts) SENGAJA: defaultColumnMap
// juga daftarkan nama kolom ALTERNATIF/sinonim yang diterima saat upload
// (mis. vendor-payable-account.mapping.ts punya "Nomor Vendor" DAN
// "Vendor No" dua-duanya → field vendorNo yang SAMA) — kalau template
// download nurut Object.keys(defaultColumnMap) mentah, hasilnya kolom
// duplikat yang membingungkan. Di sini SATU field = SATU kolom kanonis di
// template unduhan, sinonimnya disebut di kolom "Keterangan" saja.
const DATE_FORMAT = "DD/MM/YYYY (mis. 19/08/2026) — WAJIB, format lain ditolak Accurate";
const BOOLEAN_FORMAT = "TRUE atau FALSE";
// § Fase 85 (2026-09-10) — Sales Receipt pakai konvensi kompetitor
// "isikan Y jika ..., kosongkan jika tidak" (BEDA dari TRUE/FALSE Sales
// Invoice/Purchase Invoice) — field internal SUDAH terima "y"/"ya"
// case-insensitive (§ `TRUE_TEXT_VALUES` di `sales-receipt.mapping.ts`).
const Y_BOOLEAN_FORMAT = "Isi \"Y\" atau kosongkan";

export const purchaseInvoiceTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "19/08/2026", description: "Tanggal transaksi Faktur Pembelian." },
  // § Fase 81 (2026-09-09) — client konfirmasi "Bill No boleh sama walau
  // beda transaksi, Trans No harus unik" (mirror feedback Fase 63 Sales
  // Invoice) — Bill No sekarang HANYA dipakai grouping kalau Trans No di
  // bawah tidak diisi, "Trans No" DIJADIKAN WAJIB (sebelumnya opsional).
  { column: "Bill No", required: false, example: "INV-VENDOR-001", description: "Nomor referensi tagihan dari vendor (beda dari nomor transaksi Accurate). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 faktur multi-item — dipakai HANYA kalau kolom Trans No di bawah tidak diisi." },
  { column: "Vendor No", required: true, example: "V-0001", description: "Nomor/kode vendor PERSIS seperti terdaftar di Accurate Online." },
  { column: "Trans No", required: true, example: "PI-2026-0001", description: "Nomor transaksi — WAJIB DIISI dan UNIK per transaksi (beda dari Bill No yang boleh sama). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 faktur multi-item." },
  { column: "Branch Name", required: false, example: "Cabang Jakarta", description: "Nama cabang — isi kalau akun Accurate kamu multi-cabang." },
  { column: "Note", required: false, example: "Pembelian bahan baku Agustus", description: "Catatan/keterangan bebas untuk transaksi ini." },
  { column: "Currency Code", required: false, example: "IDR", description: "Kode mata uang — kosongkan kalau transaksi dalam Rupiah." },
  { column: "Rate", required: false, example: "1", description: "Kurs mata uang — isi kalau Currency Code bukan IDR." },
  { column: "Pay Term", required: false, example: "COD", description: "Nama termin pembayaran PERSIS seperti di Accurate (mis. COD, Net 30)." },
  { column: "Taxable", required: false, format: BOOLEAN_FORMAT, example: "TRUE", description: "Apakah transaksi kena pajak." },
  { column: "Inclusive Tax", required: false, format: BOOLEAN_FORMAT, example: "FALSE", description: "Apakah harga barang sudah termasuk pajak." },
  { column: "Tax No", required: false, example: "", description: "Nomor faktur pajak (kalau ada)." },
  { column: "Tax Date", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Tanggal faktur pajak (kalau ada)." },
  { column: "Reverse Inv", required: false, format: BOOLEAN_FORMAT, example: "FALSE", description: "Tandai transaksi sebagai reverse invoice." },
  { column: "Cash Discount", required: false, example: "0", description: "Nominal diskon tunai (Rupiah)." },
  { column: "Cash Disc (%)", required: false, example: "0", description: "Persentase diskon tunai." },
  { column: "Document Code", required: false, example: "", description: "Kode dokumen internal (kalau dipakai)." },
  { column: "Document Transaction Type", required: false, example: "", description: "Tipe transaksi dokumen (kalau dipakai)." },
  { column: "To Address", required: false, example: "", description: "Alamat tujuan pengiriman (kalau relevan)." },
  { column: "Shipment Name", required: false, example: "", description: "Nama pengiriman/ekspedisi (kalau relevan)." },
  { column: "Shipment Date", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Tanggal pengiriman (kalau relevan)." },
  { column: "Item No", required: true, example: "BRG-001", description: "Nomor/kode barang PERSIS seperti terdaftar di Accurate Online." },
  { column: "Unit Price", required: true, example: "50000", description: "Harga satuan barang. Angka polos, TANPA titik/koma pemisah ribuan (mis. 50000, bukan 50.000)." },
  { column: "Item Qty", required: true, example: "10", description: "Jumlah/kuantitas barang yang dibeli." },
  { column: "Item Unit Name", required: true, example: "PCS", description: "Satuan barang PERSIS seperti di Accurate (mis. PCS, KG, BOX)." },
  { column: "Item Warehouse", required: true, example: "Gudang Utama", description: "Nama gudang tujuan barang PERSIS seperti di Accurate." },
  { column: "Item Name", required: false, example: "Kertas A4 80gsm", description: "Nama barang — dipakai untuk BIKIN barang baru otomatis kalau Item No belum terdaftar di Accurate." },
  { column: "Item Notes", required: false, example: "", description: "Catatan khusus untuk baris barang ini." },
  { column: "Item Cash Disc", required: false, example: "0", description: "Nominal diskon tunai khusus barang ini (Rupiah)." },
  { column: "Item Disc (%)", required: false, example: "0", description: "Persentase diskon khusus barang ini." },
  { column: "Item - Department", required: false, example: "", description: "Nama departemen (kalau akun Accurate pakai tracking departemen)." },
  { column: "Item Prj No", required: false, example: "", description: "Nomor proyek (kalau akun Accurate pakai tracking proyek)." },
  { column: "PPN", required: false, format: BOOLEAN_FORMAT, example: "TRUE", description: "Kenakan PPN pada barang ini." },
  { column: "PPnBM", required: false, format: BOOLEAN_FORMAT, example: "FALSE", description: "Kenakan PPnBM pada barang ini." },
  { column: "PPH", required: false, format: BOOLEAN_FORMAT, example: "FALSE", description: "Kenakan PPh 23 pada barang ini." },
  { column: "Nama Vendor", required: false, example: "PT Sumber Makmur", description: "Nama vendor — WAJIB diisi HANYA kalau Vendor No di atas BELUM terdaftar di Accurate (dipakai untuk bikin vendor baru otomatis)." },
  { column: "Kategori Vendor", required: false, example: "Umum", description: "Kategori vendor baru — kosongkan untuk pakai default \"Umum\"." },
  { column: "Telepon Bisnis", required: false, example: "0211234567", description: "Nomor telepon kantor vendor baru." },
  { column: "Handphone", required: false, example: "081234567890", description: "Nomor HP vendor baru." },
  { column: "WhatsApp", required: false, example: "081234567890", description: "Nomor WhatsApp vendor baru." },
  { column: "Email Vendor", required: false, example: "vendor@contoh.com", description: "Alamat email vendor baru." },
  { column: "Alamat Vendor", required: false, example: "Jl. Contoh No. 1, Jakarta", description: "Alamat vendor baru." },
  { column: "Negara Vendor", required: false, example: "Indonesia", description: "Negara vendor baru." },
  { column: "Akun Hutang", required: false, example: "2-10100", description: "Kode Akun Hutang (COA) — kalau diisi, akan meng-update akun hutang vendor (berlaku untuk vendor baru MAUPUN vendor yang sudah ada)." },
  { column: "Kategori Barang", required: false, example: "Umum", description: "Kategori barang baru — dipakai HANYA kalau Item No belum terdaftar di Accurate, kosongkan untuk pakai default \"Umum\"." },
  // § Fase 75 (2026-09-09) — mirror LENGKAP dari Sales Invoice
  // (Fase 55/61/64/68/73/74). SEMUA ditaruh PALING AKHIR (setelah
  // seluruh kolom existing), TIDAK diselipkan di tengah — sesuai
  // permintaan. Field API charField/numericField/dateField BELUM
  // dikonfirmasi resmi khusus untuk Purchase Invoice oleh Accurate
  // Support (baru dikonfirmasi untuk Sales Invoice) — DIASUMSIKAN
  // konsisten (§ komentar `fieldToAccuratePath` purchase-invoice.mapping.ts).
  // `dataClassificationNName` (Kategori Keuangan) SUDAH dikonfirmasi
  // resmi di spec untuk Purchase Invoice langsung.
  { column: "CUSTOM CHARACTER 1", required: false, example: "", description: "Atribut Tambahan 1 level FAKTUR (bukan per barang) — nama kolom ikuti label custom di Accurate kalau sudah di-rename." },
  { column: "CUSTOM CHARACTER 2", required: false, example: "", description: "Atribut Tambahan 2 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 3", required: false, example: "", description: "Atribut Tambahan 3 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 4", required: false, example: "", description: "Atribut Tambahan 4 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 5", required: false, example: "", description: "Atribut Tambahan 5 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 6", required: false, example: "", description: "Atribut Tambahan 6 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 7", required: false, example: "", description: "Atribut Tambahan 7 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 8", required: false, example: "", description: "Atribut Tambahan 8 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 9", required: false, example: "", description: "Atribut Tambahan 9 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 10", required: false, example: "", description: "Atribut Tambahan 10 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 1", required: false, example: "", description: "Atribut Tambahan Angka 1 level FAKTUR — angka polos, tanpa titik/koma pemisah ribuan." },
  { column: "CUSTOM NUMBER 2", required: false, example: "", description: "Atribut Tambahan Angka 2 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 3", required: false, example: "", description: "Atribut Tambahan Angka 3 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 4", required: false, example: "", description: "Atribut Tambahan Angka 4 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 5", required: false, example: "", description: "Atribut Tambahan Angka 5 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 6", required: false, example: "", description: "Atribut Tambahan Angka 6 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 7", required: false, example: "", description: "Atribut Tambahan Angka 7 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 8", required: false, example: "", description: "Atribut Tambahan Angka 8 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 9", required: false, example: "", description: "Atribut Tambahan Angka 9 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 10", required: false, example: "", description: "Atribut Tambahan Angka 10 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM DATE 1", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Atribut Tambahan Tanggal 1 level FAKTUR." },
  { column: "CUSTOM DATE 2", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Atribut Tambahan Tanggal 2 level FAKTUR — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 1", required: false, example: "", description: "Atribut Tambahan 1 level ITEM (per baris barang, field API detailItem.charField1) — BEDA dari Kategori Keuangan. Maksimal 15 slot." },
  { column: "ITEM: CUSTOM CHARACTER 2", required: false, example: "", description: "Atribut Tambahan 2 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 3", required: false, example: "", description: "Atribut Tambahan 3 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 4", required: false, example: "", description: "Atribut Tambahan 4 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 5", required: false, example: "", description: "Atribut Tambahan 5 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 6", required: false, example: "", description: "Atribut Tambahan 6 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 7", required: false, example: "", description: "Atribut Tambahan 7 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 8", required: false, example: "", description: "Atribut Tambahan 8 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 9", required: false, example: "", description: "Atribut Tambahan 9 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 10", required: false, example: "", description: "Atribut Tambahan 10 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 11", required: false, example: "", description: "Atribut Tambahan 11 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 12", required: false, example: "", description: "Atribut Tambahan 12 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 13", required: false, example: "", description: "Atribut Tambahan 13 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 14", required: false, example: "", description: "Atribut Tambahan 14 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 15", required: false, example: "", description: "Atribut Tambahan 15 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 1", required: false, example: "", description: "Atribut Tambahan Angka 1 level ITEM (per baris barang, field API detailItem.numericField1) — angka polos, tanpa titik/koma pemisah ribuan. Maksimal 10 slot." },
  { column: "ITEM: CUSTOM NUMBER 2", required: false, example: "", description: "Atribut Tambahan Angka 2 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 3", required: false, example: "", description: "Atribut Tambahan Angka 3 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 4", required: false, example: "", description: "Atribut Tambahan Angka 4 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 5", required: false, example: "", description: "Atribut Tambahan Angka 5 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 6", required: false, example: "", description: "Atribut Tambahan Angka 6 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 7", required: false, example: "", description: "Atribut Tambahan Angka 7 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 8", required: false, example: "", description: "Atribut Tambahan Angka 8 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 9", required: false, example: "", description: "Atribut Tambahan Angka 9 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 10", required: false, example: "", description: "Atribut Tambahan Angka 10 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM DATE 1", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Atribut Tambahan Tanggal 1 level ITEM (per baris barang, field API detailItem.dateField1). Maksimal 2 slot." },
  { column: "ITEM: CUSTOM DATE 2", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Atribut Tambahan Tanggal 2 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 1", required: false, example: "", description: "Atribut Tambahan 1 level ITEM (per baris barang, field API detailItem.dataClassification1Name) — nama kolom ikuti label yang di-set admin Accurate di menu Preferensi | Atribut Tambahan kalau sudah di-rename. Maksimal 10 slot. Nilai yang belum ada sebagai master data Kategori Keuangan akan otomatis dibuatkan." },
  { column: "Kategori Keuangan 2", required: false, example: "", description: "Atribut Tambahan 2 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 3", required: false, example: "", description: "Atribut Tambahan 3 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 4", required: false, example: "", description: "Atribut Tambahan 4 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 5", required: false, example: "", description: "Atribut Tambahan 5 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 6", required: false, example: "", description: "Atribut Tambahan 6 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 7", required: false, example: "", description: "Atribut Tambahan 7 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 8", required: false, example: "", description: "Atribut Tambahan 8 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 9", required: false, example: "", description: "Atribut Tambahan 9 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 10", required: false, example: "", description: "Atribut Tambahan 10 level ITEM — sama pola nomor 1." },
  { column: "Akun Beban", required: false, example: "6-10100", description: "Kode Akun Perkiraan (COA) untuk baris Beban ini — WAJIB diisi bersama \"Jumlah Beban\" supaya baris ini dianggap punya data Beban." },
  { column: "Nama Beban", required: false, example: "Ongkos Kirim", description: "Nama/keterangan Beban." },
  { column: "Jumlah Beban", required: false, example: "50000", description: "Nominal Beban. Angka polos, TANPA titik/koma pemisah ribuan — WAJIB diisi bersama \"Akun Beban\"." },
  { column: "Catatan Beban", required: false, example: "", description: "Catatan tambahan untuk Beban ini." },
  { column: "Beban - Department", required: false, example: "", description: "Nama departemen untuk Beban ini (kalau akun Accurate pakai tracking departemen)." },
  // § Fase 80 (2026-09-09) — field "Proyek" level EXPENSE, dikonfirmasi
  // lewat test call nyata untuk Sales Invoice (field API TIDAK ADA di
  // spec resmi publik, pola sama dengan charField/numericField/dateField).
  { column: "Beban - Proyek", required: false, example: "", description: "Kode proyek untuk Beban ini PERSIS seperti terdaftar di Accurate (kalau akun Accurate pakai tracking proyek)." },
  { column: "Kategori Keuangan Beban 1", required: false, example: "", description: "Atribut Tambahan 1 level EXPENSE (per baris Beban, field API SAMA dengan Kategori Keuangan level Item — detailExpense.dataClassification1Name). Maksimal 10 slot." },
  { column: "Kategori Keuangan Beban 2", required: false, example: "", description: "Atribut Tambahan 2 level EXPENSE — sama pola nomor 1." },
  { column: "Kategori Keuangan Beban 3", required: false, example: "", description: "Atribut Tambahan 3 level EXPENSE — sama pola nomor 1." },
  { column: "Kategori Keuangan Beban 4", required: false, example: "", description: "Atribut Tambahan 4 level EXPENSE — sama pola nomor 1." },
  { column: "Kategori Keuangan Beban 5", required: false, example: "", description: "Atribut Tambahan 5 level EXPENSE — sama pola nomor 1." },
  { column: "Kategori Keuangan Beban 6", required: false, example: "", description: "Atribut Tambahan 6 level EXPENSE — sama pola nomor 1." },
  { column: "Kategori Keuangan Beban 7", required: false, example: "", description: "Atribut Tambahan 7 level EXPENSE — sama pola nomor 1." },
  { column: "Kategori Keuangan Beban 8", required: false, example: "", description: "Atribut Tambahan 8 level EXPENSE — sama pola nomor 1." },
  { column: "Kategori Keuangan Beban 9", required: false, example: "", description: "Atribut Tambahan 9 level EXPENSE — sama pola nomor 1." },
  { column: "Kategori Keuangan Beban 10", required: false, example: "", description: "Atribut Tambahan 10 level EXPENSE — sama pola nomor 1." },
  // § Fase 79 (2026-09-09) — field link alur pembelian (Permintaan
  // Pembelian -> Pesanan Pembelian -> Penerimaan Barang -> Faktur).
  // DIKONFIRMASI RESMI di spec Accurate. "Beban - PO No" (level EXPENSE)
  // ditaruh DI DALAM grup Beban (masih bagian Expense), field level ITEM
  // di bawahnya PALING AKHIR — sesuai permintaan user (field baru selalu
  // di ujung, SETELAH grup Expense).
  { column: "Beban - PO No", required: false, example: "", description: "Nomor transaksi Pesanan Pembelian (Purchase Order) yang terhubung dengan baris Beban ini." },
  // ⚠️ Ketiga field level ITEM berikut SALING TERHUBUNG — Accurate cuma
  // proses SATU kalau diisi bersamaan, prioritas: "ITEM: RECEIVE ITEM
  // NO" > "ITEM: PURCHASE ORDER NO" > "ITEM: PURCHASE REQUISITION NO".
  { column: "ITEM: RECEIVE ITEM NO", required: false, example: "", description: "Nomor transaksi Penerimaan Barang (Receive Item) yang terhubung dengan baris barang ini. PRIORITAS TERTINGGI kalau diisi bersamaan dengan Purchase Order No/Purchase Requisition No — yang lain diabaikan." },
  { column: "ITEM: PURCHASE ORDER NO", required: false, example: "", description: "Nomor transaksi Pesanan Pembelian (Purchase Order) yang terhubung dengan baris barang ini. Diabaikan kalau Receive Item No juga terisi di baris yang sama." },
  { column: "ITEM: PURCHASE REQUISITION NO", required: false, example: "", description: "Nomor transaksi Permintaan Pembelian (Purchase Requisition) yang terhubung dengan baris barang ini. PRIORITAS TERENDAH — diabaikan kalau Receive Item No ATAU Purchase Order No juga terisi di baris yang sama." },
];

// § Fase 13 — mirror `purchaseInvoiceTemplateGuide` (field API `poNumber`
// berperan sama seperti "Bill No" PI — pengelompokan multi-item),
// "Customer" pengganti "Vendor". § Fase 70 — judul kolom Excel disamakan
// jadi "Bill No" juga (sebelumnya "PO Number", client minta konsisten).
export const salesInvoiceTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "19/08/2026", description: "Tanggal transaksi Faktur Penjualan." },
  // § Fase 70 (2026-09-08) — client minta judul kolom diganti "PO
  // Number" -> "Bill No" (konsisten dengan istilah "Bill No" di modul
  // Purchase Invoice) — field API TETAP `poNumber` (§ ADR/komentar
  // `fieldToAccuratePath`), murni rename judul kolom Excel.
  // § Fase 77 (2026-09-09) — DIKEMBALIKAN ke "PO No" (client minta
  // singkron dengan nama field ASLI Accurate `poNumber`). Sinonim lama
  // "Bill No"/"PO Number"/"PURCHASE ORDER NO" TETAP didukung di
  // `defaultColumnMap`.
  { column: "PO No", required: false, example: "PO-CUST-001", description: "Nomor PO/referensi dari customer (field API poNumber). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 faktur multi-item — dipakai HANYA kalau kolom Trans No di bawah tidak diisi." },
  { column: "Customer No", required: true, example: "C-0001", description: "Nomor/kode customer PERSIS seperti terdaftar di Accurate Online." },
  // § Fase 61/64 — WAJIB (dikonfirmasi sheet "Penjelasan Kolom" Excel
  // resmi client) — SEBELUMNYA opsional/"kosongkan supaya otomatis",
  // KELIRU. Trans No JUGA kunci grouping multi-item (Fase 49, DIUTAMAKAN
  // dari PO Number) — WAJIB unik per transaksi, BEDA dari PO Number/Bill
  // No yang boleh sama walau beda transaksi (§ feedback client, Fase 63).
  { column: "Trans No", required: true, example: "SI-2026-0001", description: "Nomor transaksi — WAJIB DIISI dan UNIK per transaksi (beda dari PO Number yang boleh sama). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 faktur multi-item." },
  { column: "Branch Name", required: false, example: "Cabang Jakarta", description: "Nama cabang — isi kalau akun Accurate kamu multi-cabang." },
  { column: "Note", required: false, example: "Penjualan barang Agustus", description: "Catatan/keterangan bebas untuk transaksi ini." },
  { column: "Currency Code", required: false, example: "IDR", description: "Kode mata uang — kosongkan kalau transaksi dalam Rupiah." },
  { column: "Rate", required: false, example: "1", description: "Kurs mata uang — isi kalau Currency Code bukan IDR." },
  { column: "Pay Term", required: false, example: "COD", description: "Nama termin pembayaran PERSIS seperti di Accurate (mis. COD, Net 30)." },
  { column: "Taxable", required: false, format: BOOLEAN_FORMAT, example: "TRUE", description: "Apakah transaksi kena pajak." },
  { column: "Inclusive Tax", required: false, format: BOOLEAN_FORMAT, example: "FALSE", description: "Apakah harga barang sudah termasuk pajak." },
  { column: "Tax No", required: false, example: "", description: "Nomor faktur pajak (kalau ada)." },
  { column: "Tax Date", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Tanggal faktur pajak (kalau ada)." },
  { column: "Reverse Inv", required: false, format: BOOLEAN_FORMAT, example: "FALSE", description: "Tandai transaksi sebagai reverse invoice." },
  { column: "Cash Discount", required: false, example: "0", description: "Nominal diskon tunai (Rupiah)." },
  { column: "Cash Disc (%)", required: false, example: "0", description: "Persentase diskon tunai." },
  { column: "Document Code", required: false, example: "", description: "Kode dokumen internal (kalau dipakai)." },
  { column: "Document Transaction Type", required: false, example: "", description: "Tipe transaksi dokumen (kalau dipakai)." },
  { column: "Shipment Name", required: false, example: "", description: "Nama pengiriman/ekspedisi (kalau relevan)." },
  { column: "Shipment Date", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Tanggal pengiriman (kalau relevan)." },
  { column: "Item No", required: true, example: "BRG-001", description: "Nomor/kode barang PERSIS seperti terdaftar di Accurate Online." },
  { column: "Unit Price", required: true, example: "50000", description: "Harga jual barang. Angka polos, TANPA titik/koma pemisah ribuan (mis. 50000, bukan 50.000)." },
  { column: "Item Qty", required: true, example: "10", description: "Jumlah/kuantitas barang yang dijual." },
  // § Fase 61 — TIDAK WAJIB (dikonfirmasi sheet "Penjelasan Kolom" Excel
  // resmi client) — SEBELUMNYA diwajibkan di sini, KELIRU.
  { column: "Item Unit Name", required: false, example: "PCS", description: "Satuan barang PERSIS seperti di Accurate (mis. PCS, KG, BOX)." },
  { column: "Item Warehouse", required: true, example: "Gudang Utama", description: "Nama gudang asal barang PERSIS seperti di Accurate." },
  { column: "Item Name", required: false, example: "Kertas A4 80gsm", description: "Nama barang — dipakai untuk BIKIN barang baru otomatis kalau Item No belum terdaftar di Accurate." },
  { column: "Item Notes", required: false, example: "", description: "Catatan khusus untuk baris barang ini." },
  { column: "Item Cash Disc", required: false, example: "0", description: "Nominal diskon tunai khusus barang ini (Rupiah)." },
  { column: "Item Disc (%)", required: false, example: "0", description: "Persentase diskon khusus barang ini." },
  { column: "Item - Department", required: false, example: "", description: "Nama departemen (kalau akun Accurate pakai tracking departemen)." },
  { column: "Item Prj No", required: false, example: "", description: "Nomor proyek (kalau akun Accurate pakai tracking proyek)." },
  { column: "PPN", required: false, format: BOOLEAN_FORMAT, example: "TRUE", description: "Kenakan PPN pada barang ini." },
  { column: "PPnBM", required: false, format: BOOLEAN_FORMAT, example: "FALSE", description: "Kenakan PPnBM pada barang ini." },
  { column: "PPH", required: false, format: BOOLEAN_FORMAT, example: "FALSE", description: "Kenakan PPh 23 pada barang ini." },
  // § Fase 71 (2026-09-08) — SEMPAT dikira "ITEM: CUSTOM CHARACTER N"
  // itu sinonim Kategori Keuangan (Fase 69, KELIRU), lalu sempat
  // dianggap TIDAK ADA field API-nya sama sekali setelah balasan
  // PERTAMA Accurate Support (yang cuma jawab soal charField level
  // FAKTUR & dataClassificationNName, belum spesifik soal level item).
  // § Fase 73 (2026-09-09) — DIKOREKSI LAGI dengan balasan KEDUA
  // Accurate Support yang SPESIFIK menjawab "Atribut Tambahan pada
  // detail item di transaksi Sales Invoice": field API-nya ADA dan
  // BENAR adalah charField1-15 (15 slot, BUKAN 10!), numericField1-10,
  // dateField1-2 — NESTED di `detailItem`, BEDA dari charField/
  // numericField/dateField level FAKTUR di bawah (yang nempel di ROOT
  // payload). Field-field ini TIDAK ADA di `accurate-openapi.json`
  // (pola sama seperti level faktur — spec resmi memang tidak lengkap
  // untuk seluruh keluarga fitur Atribut Tambahan). Excel ASLI client
  // (Fase 55/61) PUNYA PERSIS 15 kolom "ITEM:CUSTOM CHARACTER" — cocok
  // PERSIS jumlah slotnya, membuktikan Fase 61 KELIRU menyimpulkan
  // field ini "tidak mungkin ada".
  { column: "ITEM: CUSTOM CHARACTER 1", required: false, example: "", description: "Atribut Tambahan 1 level ITEM (per baris barang, field API detailItem.charField1) — BEDA dari Kategori Keuangan. Maksimal 15 slot." },
  { column: "ITEM: CUSTOM CHARACTER 2", required: false, example: "", description: "Atribut Tambahan 2 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 3", required: false, example: "", description: "Atribut Tambahan 3 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 4", required: false, example: "", description: "Atribut Tambahan 4 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 5", required: false, example: "", description: "Atribut Tambahan 5 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 6", required: false, example: "", description: "Atribut Tambahan 6 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 7", required: false, example: "", description: "Atribut Tambahan 7 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 8", required: false, example: "", description: "Atribut Tambahan 8 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 9", required: false, example: "", description: "Atribut Tambahan 9 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 10", required: false, example: "", description: "Atribut Tambahan 10 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 11", required: false, example: "", description: "Atribut Tambahan 11 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 12", required: false, example: "", description: "Atribut Tambahan 12 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 13", required: false, example: "", description: "Atribut Tambahan 13 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 14", required: false, example: "", description: "Atribut Tambahan 14 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM CHARACTER 15", required: false, example: "", description: "Atribut Tambahan 15 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 1", required: false, example: "", description: "Atribut Tambahan Angka 1 level ITEM (per baris barang, field API detailItem.numericField1) — angka polos, tanpa titik/koma pemisah ribuan. Maksimal 10 slot." },
  { column: "ITEM: CUSTOM NUMBER 2", required: false, example: "", description: "Atribut Tambahan Angka 2 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 3", required: false, example: "", description: "Atribut Tambahan Angka 3 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 4", required: false, example: "", description: "Atribut Tambahan Angka 4 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 5", required: false, example: "", description: "Atribut Tambahan Angka 5 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 6", required: false, example: "", description: "Atribut Tambahan Angka 6 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 7", required: false, example: "", description: "Atribut Tambahan Angka 7 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 8", required: false, example: "", description: "Atribut Tambahan Angka 8 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 9", required: false, example: "", description: "Atribut Tambahan Angka 9 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM NUMBER 10", required: false, example: "", description: "Atribut Tambahan Angka 10 level ITEM — sama pola nomor 1." },
  { column: "ITEM: CUSTOM DATE 1", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Atribut Tambahan Tanggal 1 level ITEM (per baris barang, field API detailItem.dateField1). Maksimal 2 slot." },
  { column: "ITEM: CUSTOM DATE 2", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Atribut Tambahan Tanggal 2 level ITEM — sama pola nomor 1." },
  // § Fase 64 — Atribut Tambahan level HEADER/FAKTUR (BEDA dari level
  // ITEM di atas — TANPA prefix "ITEM:"). Ditemukan dari email resmi
  // Accurate Support (tiket #357901): field API `charField1-10`,
  // `numericField1-10`, `dateField1-2`, dikirim di ROOT payload (sejajar
  // Customer No/Tanggal), BUKAN per baris barang.
  { column: "CUSTOM CHARACTER 1", required: false, example: "", description: "Atribut Tambahan 1 level FAKTUR (bukan per barang) — nama kolom ikuti label custom di Accurate kalau sudah di-rename." },
  { column: "CUSTOM CHARACTER 2", required: false, example: "", description: "Atribut Tambahan 2 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 3", required: false, example: "", description: "Atribut Tambahan 3 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 4", required: false, example: "", description: "Atribut Tambahan 4 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 5", required: false, example: "", description: "Atribut Tambahan 5 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 6", required: false, example: "", description: "Atribut Tambahan 6 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 7", required: false, example: "", description: "Atribut Tambahan 7 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 8", required: false, example: "", description: "Atribut Tambahan 8 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 9", required: false, example: "", description: "Atribut Tambahan 9 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM CHARACTER 10", required: false, example: "", description: "Atribut Tambahan 10 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 1", required: false, example: "", description: "Atribut Tambahan Angka 1 level FAKTUR — angka polos, tanpa titik/koma pemisah ribuan." },
  { column: "CUSTOM NUMBER 2", required: false, example: "", description: "Atribut Tambahan Angka 2 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 3", required: false, example: "", description: "Atribut Tambahan Angka 3 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 4", required: false, example: "", description: "Atribut Tambahan Angka 4 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 5", required: false, example: "", description: "Atribut Tambahan Angka 5 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 6", required: false, example: "", description: "Atribut Tambahan Angka 6 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 7", required: false, example: "", description: "Atribut Tambahan Angka 7 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 8", required: false, example: "", description: "Atribut Tambahan Angka 8 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 9", required: false, example: "", description: "Atribut Tambahan Angka 9 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM NUMBER 10", required: false, example: "", description: "Atribut Tambahan Angka 10 level FAKTUR — sama pola nomor 1." },
  { column: "CUSTOM DATE 1", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Atribut Tambahan Tanggal 1 level FAKTUR." },
  { column: "CUSTOM DATE 2", required: false, format: DATE_FORMAT, example: "19/08/2026", description: "Atribut Tambahan Tanggal 2 level FAKTUR — sama pola nomor 1." },
  { column: "Nama Customer", required: false, example: "PT Pembeli Jaya", description: "Nama customer — WAJIB diisi HANYA kalau Customer No di atas BELUM terdaftar di Accurate (dipakai untuk bikin customer baru otomatis)." },
  { column: "Kategori Customer", required: false, example: "Umum", description: "Kategori customer baru — kosongkan untuk pakai default \"Umum\"." },
  { column: "Telepon Bisnis", required: false, example: "0211234567", description: "Nomor telepon kantor customer baru." },
  { column: "Handphone", required: false, example: "081234567890", description: "Nomor HP customer baru." },
  { column: "Email Customer", required: false, example: "customer@contoh.com", description: "Alamat email customer baru." },
  { column: "Alamat Customer", required: false, example: "Jl. Contoh No. 1, Jakarta", description: "Alamat customer baru." },
  { column: "Negara Customer", required: false, example: "Indonesia", description: "Negara customer baru." },
  { column: "Akun Piutang", required: false, example: "1-10500", description: "Kode Akun Piutang (COA) — kalau diisi, akan meng-update akun piutang customer (berlaku untuk customer baru MAUPUN yang sudah ada)." },
  { column: "Kategori Barang", required: false, example: "Umum", description: "Kategori barang baru — dipakai HANYA kalau Item No belum terdaftar di Accurate, kosongkan untuk pakai default \"Umum\"." },
  // § Fase 55, nama kolom dikoreksi Fase 61 ("Karakter N" -> "ITEM:CUSTOM
  // CHARACTER N" setelah Excel asli client diterima), dikoreksi LAGI
  // Fase 69 (2026-09-08) setelah client konfirmasi langsung via
  // screenshot Accurate: field ini TAMPIL di Accurate dengan label
  // default "Kategori Keuangan N" (nama resmi Accurate untuk
  // `/api/data-classification`, § Fase 68) — BUKAN "ITEM:CUSTOM
  // CHARACTER N" (istilah lama kita yang TIDAK muncul di UI Accurate
  // sama sekali, sumber kebingungan berulang). Label BISA di-rename
  // beda oleh admin client di menu Preferensi | Atribut Tambahan
  // Accurate — kalau begitu, nama kolom Excel WAJIB ikut label custom
  // itu (remap manual saat import) — sinonim "ITEM:CUSTOM CHARACTER N"
  // TETAP didukung di `defaultColumnMap` (client lama/existing yang
  // sudah terlanjur pakai nama itu tidak regresi). Dipindah ke PALING
  // AKHIR template Fase 70 (2026-09-08, permintaan client) — sebelumnya
  // di tengah (dekat field item lain), sekarang setelah "Kategori
  // Barang" supaya tidak "menyempil" di antara field inti.
  { column: "Kategori Keuangan 1", required: false, example: "", description: "Atribut Tambahan 1 level ITEM (per baris barang, field API dataClassification1Name) — nama kolom ikuti label yang di-set admin Accurate di menu Preferensi | Atribut Tambahan kalau sudah di-rename. Maksimal 10 (11-15 tidak didukung API Accurate). Nilai yang belum ada sebagai master data Kategori Keuangan akan otomatis dibuatkan." },
  { column: "Kategori Keuangan 2", required: false, example: "", description: "Atribut Tambahan 2 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 3", required: false, example: "", description: "Atribut Tambahan 3 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 4", required: false, example: "", description: "Atribut Tambahan 4 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 5", required: false, example: "", description: "Atribut Tambahan 5 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 6", required: false, example: "", description: "Atribut Tambahan 6 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 7", required: false, example: "", description: "Atribut Tambahan 7 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 8", required: false, example: "", description: "Atribut Tambahan 8 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 9", required: false, example: "", description: "Atribut Tambahan 9 level ITEM — sama pola nomor 1." },
  { column: "Kategori Keuangan 10", required: false, example: "", description: "Atribut Tambahan 10 level ITEM — sama pola nomor 1." },
  // § Fase 74 (2026-09-09) — level EXPENSE (baris Beban, `detailExpense[]`
  // di payload, ARRAY TERPISAH dari `detailItem[]`). Ditaruh PALING
  // AKHIR (setelah "Kategori Keuangan 10") sesuai permintaan. 1 baris
  // Excel BISA menyumbang 1 baris Barang DAN/ATAU 1 baris Beban
  // sekaligus — kolom "Akun Beban" + "Jumlah Beban" WAJIB DUA-DUANYA
  // terisi supaya baris ini dianggap punya data Beban (kalau salah satu
  // kosong, baris ini dianggap TIDAK ada data Beban-nya, kolom Beban
  // lain di baris itu diabaikan).
  // § Fase 77 (2026-09-09) — judul kolom Expense DIGANTI ke Bahasa
  // Inggris (client minta "expense diubah semua jadi bhs inggris"),
  // nama Indonesia lama ("Akun Beban" dkk) TETAP didukung sebagai
  // sinonim di `defaultColumnMap` — cuma judul kolom TEMPLATE UNDUHAN
  // yang berubah di sini.
  { column: "Expense Acc No", required: false, example: "6-10100", description: "Kode Akun Perkiraan (COA) untuk baris Beban ini — WAJIB diisi bersama \"Expense Amount\" supaya baris ini dianggap punya data Beban." },
  { column: "Expense Name", required: false, example: "Ongkos Kirim", description: "Nama/keterangan Beban." },
  { column: "Expense Amount", required: false, example: "50000", description: "Nominal Beban. Angka polos, TANPA titik/koma pemisah ribuan — WAJIB diisi bersama \"Expense Acc No\"." },
  { column: "Expense Note", required: false, example: "", description: "Catatan tambahan untuk Beban ini." },
  { column: "Expense Department", required: false, example: "", description: "Nama departemen untuk Beban ini (kalau akun Accurate pakai tracking departemen)." },
  // § Fase 80 (2026-09-09) — field "Proyek" level EXPENSE
  // (`detailExpense.projectNo`), DIKONFIRMASI lewat TEST CALL NYATA ke
  // `/api/sales-invoice/save.do` (bukan tebakan) — field ini TIDAK ADA
  // di spec resmi publik, pola sama dengan saga charField/numericField/
  // dateField (Fase 64/73): spec resmi tidak lengkap, field-nya tetap
  // benar-benar ada di API sungguhan.
  { column: "Expense Project No", required: false, example: "", description: "Kode proyek untuk Beban ini PERSIS seperti terdaftar di Accurate (kalau akun Accurate pakai tracking proyek)." },
  { column: "Expense Financial Category 1", required: false, example: "", description: "Atribut Tambahan 1 level EXPENSE (per baris Beban, field API SAMA dengan Kategori Keuangan level Item — detailExpense.dataClassification1Name). Maksimal 10 slot." },
  { column: "Expense Financial Category 2", required: false, example: "", description: "Atribut Tambahan 2 level EXPENSE — sama pola nomor 1." },
  { column: "Expense Financial Category 3", required: false, example: "", description: "Atribut Tambahan 3 level EXPENSE — sama pola nomor 1." },
  { column: "Expense Financial Category 4", required: false, example: "", description: "Atribut Tambahan 4 level EXPENSE — sama pola nomor 1." },
  { column: "Expense Financial Category 5", required: false, example: "", description: "Atribut Tambahan 5 level EXPENSE — sama pola nomor 1." },
  { column: "Expense Financial Category 6", required: false, example: "", description: "Atribut Tambahan 6 level EXPENSE — sama pola nomor 1." },
  { column: "Expense Financial Category 7", required: false, example: "", description: "Atribut Tambahan 7 level EXPENSE — sama pola nomor 1." },
  { column: "Expense Financial Category 8", required: false, example: "", description: "Atribut Tambahan 8 level EXPENSE — sama pola nomor 1." },
  { column: "Expense Financial Category 9", required: false, example: "", description: "Atribut Tambahan 9 level EXPENSE — sama pola nomor 1." },
  { column: "Expense Financial Category 10", required: false, example: "", description: "Atribut Tambahan 10 level EXPENSE — sama pola nomor 1." },
  // § Fase 76 (2026-09-09) — field LINK ALUR PENJUALAN (Penawaran ->
  // Pesanan -> Pengiriman -> Faktur), level ITEM. DIKONFIRMASI RESMI di
  // spec Accurate. Ditaruh PALING AKHIR sesuai permintaan. ⚠️ Ketiga
  // field ini SALING TERHUBUNG — kalau diisi bersamaan di 1 baris,
  // Accurate cuma proses SATU dengan prioritas: "ITEM: DELIVERY ORDER
  // NO" > "ITEM: SALES ORDER NO" > "ITEM: SALES QUOT NO", sisanya
  // diabaikan diam-diam (bukan error). "ITEM: PURCHASE ORDER NO" TIDAK
  // ditambahkan — TIDAK ADA field setara di level item Sales Invoice
  // (sudah tercakup field header "PO No").
  { column: "ITEM: DELIVERY ORDER NO", required: false, example: "", description: "Nomor transaksi Pengiriman (Delivery Order) yang terhubung dengan baris barang ini. PRIORITAS TERTINGGI kalau diisi bersamaan dengan Sales Order No/Sales Quot No — yang lain diabaikan." },
  { column: "ITEM: SALES ORDER NO", required: false, example: "", description: "Nomor transaksi Pesanan Penjualan (Sales Order) yang terhubung dengan baris barang ini. Diabaikan kalau Delivery Order No juga terisi di baris yang sama." },
  { column: "ITEM: SALES QUOT NO", required: false, example: "", description: "Nomor transaksi Penawaran Penjualan (Sales Quotation) yang terhubung dengan baris barang ini. PRIORITAS TERENDAH — diabaikan kalau Delivery Order No ATAU Sales Order No juga terisi di baris yang sama." },
  // § Fase 77 (2026-09-09) — mirror Fase 76 tapi level EXPENSE
  // (`detailExpense`, array TERPISAH dari `detailItem`). DIKONFIRMASI
  // RESMI di spec Accurate. ⚠️ Array ini TIDAK punya field
  // `deliveryOrderNumber` (beda dari `detailItem`) — cuma 2 field yang
  // SALING TERHUBUNG di sini, prioritas: "Expense Sales Order No" >
  // "Expense Sales Quotation No".
  { column: "Expense Sales Order No", required: false, example: "", description: "Nomor transaksi Pesanan Penjualan (Sales Order) yang terhubung dengan baris Beban ini. PRIORITAS TERTINGGI kalau diisi bersamaan dengan Expense Sales Quotation No — yang lain diabaikan." },
  { column: "Expense Sales Quotation No", required: false, example: "", description: "Nomor transaksi Penawaran Penjualan (Sales Quotation) yang terhubung dengan baris Beban ini. PRIORITAS TERENDAH — diabaikan kalau Expense Sales Order No juga terisi di baris yang sama." },
];

export const vendorPayableAccountTemplateGuide: TemplateFieldGuide[] = [
  { column: "Nomor Vendor", required: true, example: "V-0001", description: "Nomor/kode vendor PERSIS seperti terdaftar di Accurate Online (header alternatif yang juga diterima: \"Vendor No\")." },
  { column: "Akun Hutang", required: true, example: "2-10100", description: "Kode Akun Hutang (COA) yang mau di-assign ke vendor ini (header alternatif yang juga diterima: \"Kode Akun Hutang\")." },
];

// § architecture-purchase-payment.md — 1 baris = 1 pembayaran = 1 faktur.
// Vendor DAN faktur WAJIB SUDAH ADA di Accurate (TIDAK auto-create),
// beda dari Faktur Pembelian di atas.
// § Fase 50 — label kolom diikutkan ke istilah kompetitor
// (`FACPORT_purchase_payment.xlsx`, client sudah familiar), label
// Indonesia lama tetap didukung sebagai alias (§ purchase-payment.mapping.ts).
// § Fase 89 (2026-09-10) — URUTAN kolom di bawah SENGAJA mengikuti
// PERSIS urutan wishlist client (`template-purchase-payment.xlsx` =
// copy template kompetitor `Sample_Format_Import_PP_v4.0.xlsx`),
// konsisten koreksi Sales Receipt Fase 85/86.
// § Fase 100 (2026-09-10) — "PPh Amount" DIKEMBALIKAN (awalnya di-skip
// Fase 89 sebagai "read-only/auto-computed") dan "PPh ID" dikoreksi
// deskripsinya, SPECULATIVE mirror Sales Receipt Fase 99 — BELUM
// dikonfirmasi resmi Accurate Support khusus endpoint
// `purchase-payment/save.do` ini (lihat komentar `taxId`/`taxAmount`
// di `purchase-payment.mapping.ts` untuk detail).
export const purchasePaymentTemplateGuide: TemplateFieldGuide[] = [
  { column: "Date", required: true, format: DATE_FORMAT, example: "05/09/2026", description: "Tanggal transaksi pembayaran (header alternatif: \"Tanggal\")." },
  { column: "Purchase Payment No", required: false, example: "PP-2026-0001", description: "Nomor pembayaran (opsional). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 pembayaran yang bayar BANYAK faktur sekaligus — baris dengan kolom ini kosong tetap dianggap 1 pembayaran sendiri." },
  { column: "No. Bank Account", required: true, example: "1-10200", description: "Kode Akun (COA) bank/kas yang dipakai bayar, BUKAN nama bank literal (header alternatif: \"Akun Bank/Kas\", \"Kode Akun Bank\")." },
  { column: "No. Supplier", required: true, example: "V-0001", description: "Nomor/kode vendor PERSIS seperti terdaftar di Accurate Online — WAJIB SUDAH ADA (header alternatif: \"No Pemasok\", \"Nomor Vendor\")." },
  { column: "Description", required: false, example: "", description: "Catatan tambahan untuk transaksi pembayaran ini." },
  { column: "Branch", required: true, example: "Jakarta", description: "Nama cabang PERSIS seperti terdaftar di Accurate Online. WAJIB DIISI — dikonfirmasi via test call nyata: Accurate menolak transaksi tanpa cabang eksplisit untuk company multi-cabang (\"Profil pengguna anda memiliki akses ke lebih dari satu cabang\")." },
  { column: "Currency Code", required: false, example: "IDR", description: "Kode mata uang — kosongkan kalau transaksi dalam Rupiah." },
  { column: "Rate", required: false, example: "1", description: "Nilai tukar mata uang — isi kalau Currency Code bukan IDR. Boleh sampai 6 angka di belakang koma." },
  { column: "Cheque Amount", required: false, example: "", description: "Total nilai pembayaran EKSPLISIT untuk SELURUH pembayaran (beda dari \"Payment\" yang per-faktur) — isi SAMA di semua baris 1 pembayaran kalau mau kontrol manual. KOSONGKAN untuk pakai default: dijumlahkan otomatis dari semua \"Payment\" dalam 1 pembayaran. Boleh sampai 6 angka di belakang koma." },
  { column: "Cheque No", required: false, example: "", description: "Nomor cek/giro — relevan kalau Payment Method-nya Cek/Giro." },
  { column: "Cheque Date", required: false, format: DATE_FORMAT, example: "05/09/2026", description: "Tanggal cek/giro — relevan kalau Payment Method-nya Cek/Giro. Kosongkan untuk pakai tanggal transaksi." },
  { column: "Payment Method", required: false, example: "Transfer Bank", description: "Metode pembayaran. Nilai valid: Tunai, Cek/Giro, Transfer Bank, EDC, Kartu Debit, Kartu Kredit, QRIS, Payment Link, Virtual Account, Dompet Digital, Non Tunai Lainnya." },
  { column: "Invoice No", required: true, example: "PI-2026-001", description: "Nomor Faktur Pembelian yang dibayar, PERSIS seperti di Accurate — WAJIB SUDAH ADA. Isi faktur BEDA di tiap baris kalau 1 pembayaran (Purchase Payment No sama) bayar banyak faktur sekaligus (header alternatif: \"No Faktur\", \"Nomor Faktur\")." },
  { column: "Payment", required: true, example: "5000000", description: "Nominal pembayaran UNTUK FAKTUR DI BARIS INI (bukan total keseluruhan kalau 1 pembayaran bayar banyak faktur — Facport yang jumlahkan otomatis). Isi PENUH sesuai sisa tagihan untuk pelunasan, atau LEBIH KECIL untuk pembayaran sebagian. Angka polos, TANPA titik/koma pemisah ribuan, TAPI BOLEH sampai 6 angka di belakang koma kalau perlu presisi (header alternatif: \"Jumlah Bayar\")." },
  // § Fase 118+ (2026-09-15) — deskripsi "Nominal PPh DIHITUNG OTOMATIS...
  // TIDAK ada kolom nominal terpisah" DIHAPUS — itu kesimpulan Fase 85
  // yang TERBUKTI SALAH sejak Fase 99/100 (jawaban resmi Accurate Support:
  // nominal WAJIB diisi manual lewat "PPh Amount", API tidak auto-hitung
  // seperti UI). Deskripsi lama sempat kontradiksi dengan "PPh Amount" di
  // bawah, tidak pernah diupdate sejak koreksi itu — dibetulkan sekarang.
  { column: "Paid PPH", required: false, format: Y_BOOLEAN_FORMAT, example: "", description: "Isi \"Y\" kalau faktur ini kena potong PPh23. Kosongkan kalau tidak. WAJIB diisi bersama \"PPh ID\" dan \"PPh Amount\" supaya potongan PPh benar-benar terpotong di Accurate." },
  { column: "PPh No", required: false, example: "", description: "Nomor bukti potong PPh23 — isi kalau tidak pakai penomoran otomatis Accurate." },
  { column: "PPh ID", required: false, example: "Jasa Kebersihan", description: "Nama pajak PERSIS seperti di Data Master Pajak Accurate (mis. \"Jasa Kebersihan\") — LEBIH DISARANKAN dari kode (mis. \"Pajak Penghasilan Ps.23\") karena 1 kode dipakai banyak jenis jasa PPh23 sekaligus. WAJIB diisi bersama \"PPh Amount\" supaya baris ini dianggap punya data potongan PPh — Facport cek dulu ke Accurate (KHUSUS Master Data Pajak jenis PPh23, § Fase 118), GAGAL kalau tidak ditemukan." },
  { column: "PPh Amount", required: false, example: "40000", description: "Nominal PPh yang dipotong untuk faktur di baris ini — WAJIB diisi bersama \"PPh ID\". ⚠️ Belum dikonfirmasi resmi oleh Accurate untuk endpoint pembayaran ini (mirror Sales Receipt yang sudah dikonfirmasi)." },
  { column: "Discount", required: false, example: "", description: "Nominal diskon untuk baris faktur ini — WAJIB diisi bersama \"Discount Acc\" supaya baris ini dianggap punya data diskon. Boleh sampai 6 angka di belakang koma." },
  { column: "Discount Acc", required: false, example: "", description: "Kode Akun Diskon (COA) — WAJIB diisi bersama \"Discount\"." },
  { column: "Discount Note", required: false, example: "", description: "Catatan tambahan untuk diskon ini." },
  { column: "Discount - Dept", required: false, example: "", description: "Nama departemen untuk diskon ini (kalau akun Accurate pakai tracking departemen)." },
  { column: "Discount - Project No", required: false, example: "", description: "Nomor proyek untuk diskon ini (kalau akun Accurate pakai tracking proyek)." },
];

// § architecture-sales-receipt.md — bayangan cermin PERSIS Purchase
// Payment di atas (Customer ganti peran Vendor, Faktur Penjualan ganti
// Faktur Pembelian). Customer DAN faktur WAJIB SUDAH ADA di Accurate
// (TIDAK auto-create).
// § Fase 86 (2026-09-10) — URUTAN kolom di bawah SENGAJA mengikuti
// PERSIS urutan sheet "NOTE" client (= copy template kompetitor
// `FACPORT_Sales Receipt_v5.xlsx`), BUKAN pola "field baru selalu di
// ujung" yang dipakai modul lain (Fase 70-84) — permintaan eksplisit
// user: "susunan excel harus sama dengan yg dibuat client, karena itu
// permintaannya". 2 kolom yang TETAP di-skip (Existing Credit/Return
// Overpay, § komentar `salesReceiptMapping` di `sales-receipt.mapping.ts`)
// dilewati sesuai posisi aslinya (tidak bikin lubang kosong). Field API
// tetap SAMA seperti sebelumnya, cuma URUTAN BARIS array ini yang
// berubah — TIDAK ADA breaking change (matching kolom saat upload tetap
// by NAME, bukan posisi).
// § Fase 99 (2026-09-10) — "Tax Amount" DIKEMBALIKAN (awalnya di-skip
// Fase 85) dan "Tax ID" dikoreksi deskripsinya — jawaban resmi Accurate
// Support konfirmasi KEDUANYA field API nyata (`detailTax[]` di root),
// bukan validasi-only/read-only seperti disimpulkan sebelumnya. Lihat
// `sales-receipt.mapping.ts` § komentar `taxId`/`taxAmount` untuk detail
// lengkap.
export const salesReceiptTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "05/09/2026", description: "Tanggal transaksi penerimaan." },
  { column: "No. Sales Receipt", required: false, example: "11010101.2026.01.00001", description: "Nomor struk penerimaan (opsional). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 penerimaan yang bayar BANYAK faktur sekaligus — baris dengan kolom ini kosong tetap dianggap 1 penerimaan sendiri (header alternatif: \"Nomor Penerimaan\", \"No Penerimaan\")." },
  { column: "Akun Bank/Kas", required: true, example: "1-10200", description: "Kode Akun (COA) bank/kas yang dipakai terima pembayaran, BUKAN nama bank literal (header alternatif: \"Kode Akun Bank\")." },
  { column: "No Pelanggan", required: true, example: "C-0001", description: "Nomor/kode customer PERSIS seperti terdaftar di Accurate Online — WAJIB SUDAH ADA (header alternatif: \"Nomor Customer\", \"Customer No\")." },
  { column: "Description", required: false, example: "", description: "Catatan tambahan untuk transaksi penerimaan ini." },
  { column: "Branch", required: true, example: "Jakarta", description: "Nama cabang PERSIS seperti terdaftar di Accurate Online. WAJIB DIISI — dikonfirmasi via test call nyata: Accurate menolak transaksi tanpa cabang eksplisit untuk company multi-cabang (\"Profil pengguna anda memiliki akses ke lebih dari satu cabang\")." },
  { column: "Currency Code", required: false, example: "IDR", description: "Kode mata uang — kosongkan kalau transaksi dalam Rupiah." },
  { column: "kurs", required: false, example: "1", description: "Nilai tukar mata uang — isi kalau Currency Code bukan IDR. Boleh sampai 6 angka di belakang koma." },
  { column: "Cheque Amount", required: false, example: "", description: "Total nilai penerimaan EKSPLISIT untuk SELURUH struk (beda dari \"Jumlah Bayar\" yang per-faktur) — isi SAMA di semua baris 1 penerimaan kalau mau kontrol manual. KOSONGKAN untuk pakai default: dijumlahkan otomatis dari semua \"Jumlah Bayar\" dalam 1 penerimaan. Boleh sampai 6 angka di belakang koma." },
  { column: "Cheque No", required: false, example: "", description: "Nomor cek/giro — relevan kalau Payment Method-nya Cek/Giro." },
  { column: "Cheque Date", required: false, format: DATE_FORMAT, example: "05/09/2026", description: "Tanggal cek/giro — relevan kalau Payment Method-nya Cek/Giro. Kosongkan untuk pakai tanggal transaksi." },
  { column: "Payment Method", required: false, example: "Transfer Bank", description: "Metode pembayaran. Nilai valid: Tunai, Cek/Giro, Transfer Bank, EDC, Kartu Debit, Kartu Kredit, QRIS, Payment Link, Virtual Account, Dompet Digital, Non Tunai Lainnya." },
  { column: "Pass Validate Inv Date", required: false, format: Y_BOOLEAN_FORMAT, example: "", description: "Isi \"Y\" untuk bypass validasi tanggal pembayaran lebih kecil dari tanggal faktur. Kosongkan kalau tidak perlu." },
  { column: "Use credit", required: false, format: Y_BOOLEAN_FORMAT, example: "", description: "Isi \"Y\" untuk pakai saldo kredit customer sebagai bagian pembayaran. Kosongkan kalau tidak perlu." },
  { column: "No Faktur", required: true, example: "SI-2026-001", description: "Nomor Faktur Penjualan yang dibayar, PERSIS seperti di Accurate — WAJIB SUDAH ADA. Isi faktur BEDA di tiap baris kalau 1 penerimaan (No. Sales Receipt sama) bayar banyak faktur sekaligus (header alternatif: \"Nomor Faktur\")." },
  { column: "Jumlah Bayar", required: true, example: "5000000", description: "Nominal penerimaan UNTUK FAKTUR DI BARIS INI (bukan total keseluruhan kalau 1 penerimaan bayar banyak faktur — Facport yang jumlahkan otomatis). Isi PENUH sesuai sisa piutang faktur untuk pelunasan, atau LEBIH KECIL untuk penerimaan sebagian. Angka polos, TANPA titik/koma pemisah ribuan, TAPI BOLEH sampai 6 angka di belakang koma kalau perlu presisi (mis. 5000000.123456)." },
  { column: "Department", required: false, example: "", description: "Nama departemen untuk baris faktur ini (kalau akun Accurate pakai tracking departemen)." },
  // § Fase 118+ (2026-09-15) — sama seperti Purchase Payment di atas,
  // deskripsi "auto-hitung" DIHAPUS (terbukti salah sejak Fase 99).
  { column: "Paid PPH", required: false, format: Y_BOOLEAN_FORMAT, example: "", description: "Isi \"Y\" kalau faktur ini kena potong PPh23. Kosongkan kalau tidak. WAJIB diisi bersama \"Tax ID\" dan \"Tax Amount\" supaya potongan PPh benar-benar terpotong di Accurate." },
  { column: "PPh No", required: false, example: "", description: "Nomor bukti potong PPh23 — isi kalau tidak pakai penomoran otomatis Accurate." },
  { column: "Tax ID", required: false, example: "Jasa Kebersihan", description: "Nama pajak PERSIS seperti di Data Master Pajak Accurate (mis. \"Jasa Kebersihan\") — LEBIH DISARANKAN dari kode (mis. \"Pajak Penghasilan Ps.23\") karena 1 kode dipakai banyak jenis jasa PPh23 sekaligus (kode saja bisa cocok ke jenis yang SALAH). WAJIB diisi bersama \"Tax Amount\" supaya baris ini dianggap punya data potongan PPh — Facport cek dulu ke Accurate (KHUSUS Master Data Pajak jenis PPh23, § Fase 118), GAGAL kalau tidak ditemukan." },
  { column: "Tax Amount", required: false, example: "40000", description: "Nominal PPh yang dipotong untuk faktur di baris ini — WAJIB diisi bersama \"Tax ID\". BEDA dari UI Accurate yang menghitung otomatis: lewat import, nominal ini HARUS dihitung & diisi sendiri (dikonfirmasi resmi oleh Accurate Support 2026-09-10)." },
  { column: "Discount", required: false, example: "", description: "Nominal diskon untuk baris faktur ini — WAJIB diisi bersama \"Discount Acc\" supaya baris ini dianggap punya data diskon. Boleh sampai 6 angka di belakang koma." },
  { column: "Discount Acc", required: false, example: "", description: "Kode Akun Diskon (COA) — WAJIB diisi bersama \"Discount\"." },
  { column: "Discount Note", required: false, example: "", description: "Catatan tambahan untuk diskon ini." },
  { column: "Diskon - Dept", required: false, example: "", description: "Nama departemen untuk diskon ini (kalau akun Accurate pakai tracking departemen)." },
  { column: "Diskon - Project No", required: false, example: "", description: "Nomor proyek untuk diskon ini (kalau akun Accurate pakai tracking proyek)." },
];

// § Fase 96 (2026-09-10) — Opsi A (format lebar, 2 akun sederhana)
// DIPENSIUNKAN TOTAL — client (3 template berturut-turut: v3, v4.1,
// template final) SELALU pakai grouping N-akun, tidak pernah pakai
// format lebar, dan modul ini belum punya customer produksi nyata.
// SEKARANG SATU FORMAT SAJA, PERSIS 26 kolom
// `CLIENT_template-jurnal-umum-v2.xlsx` (client eksplisit minta "isinya
// ini saja" — SEMUA alias ganda yang sebelumnya ada DIHAPUS, satu nama
// kolom per konsep). Baris dengan "Transaction Number" SAMA digabung
// jadi 1 jurnal (bisa N akun, tidak terbatas 2).
//
// "Nominal Debit"/"Nominal Kredit" — isi HANYA SATU per baris, tipe
// ditentukan otomatis dari kolom mana yang terisi (mirror radio button
// Debit/Kredit UI Accurate asli, BUKAN diketik manual). "Branch" WAJIB
// (dikonfirmasi screenshot UI client tanda merah *). `currencyCode`
// TIDAK diimplementasi — dikonfirmasi test call nyata: bukan field
// input, murni properti akun COA (§ `journal-voucher.mapping.ts`).
//
// Akun COA WAJIB SUDAH ADA di Accurate (TIDAK auto-create). Total
// DEBIT WAJIB SAMA PERSIS dengan total CREDIT dalam 1 jurnal (aturan
// double-entry, SUM semua baris bertipe DEBIT vs SUM semua baris
// bertipe CREDIT dalam 1 grup), divalidasi Facport SEBELUM kirim ke
// Accurate.
export const journalVoucherTemplateGuide: TemplateFieldGuide[] = [
  { column: "Trans Date", required: true, format: DATE_FORMAT, example: "05/09/2026", description: "Tanggal transaksi jurnal." },
  { column: "Akun", required: true, example: "6-20500", description: "Kode Akun (COA) untuk BARIS INI, PERSIS seperti terdaftar di Accurate Online — WAJIB SUDAH ADA." },
  { column: "Nominal Debit", required: false, example: "500000", description: "Isi HANYA kalau baris ini debit (kosongkan kolom Nominal Kredit). Total semua baris Debit dalam 1 Transaction Number WAJIB SAMA PERSIS dengan total semua baris Kredit. Angka polos, TANPA titik/koma pemisah ribuan." },
  { column: "Nominal Kredit", required: false, example: "", description: "Isi HANYA kalau baris ini kredit (kosongkan kolom Nominal Debit) — 1 baris TIDAK BOLEH isi Debit dan Kredit sekaligus, dan TIDAK BOLEH kosong dua-duanya." },
  { column: "Trans Description", required: false, example: "Penyesuaian beban dibayar dimuka", description: "Catatan/keterangan bebas untuk transaksi jurnal ini." },
  { column: "Transaction Number", required: true, example: "JV.2026.01.00001", description: "Nomor transaksi jurnal — isi SAMA di beberapa baris untuk menggabungkannya jadi 1 jurnal dengan BANYAK akun (N akun, tidak terbatas 2)." },
  { column: "Branch", required: true, example: "JAKARTA", description: "Nama cabang — WAJIB diisi (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Kurs", required: false, example: "", description: "Nilai tukar — isi kalau akun baris ini pakai mata uang asing (Accurate otomatis tahu dari akunnya, bukan dari kolom terpisah). Kosongkan untuk akun mata uang dasar (IDR)." },
  { column: "JV Prime Amount", required: false, example: "", description: "Nominal dalam mata uang asing — opsional, kalau kosong Accurate hitung otomatis dari nominal Debit/Kredit dibagi Kurs." },
  { column: "No Department", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "No Project", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Memo", required: false, example: "", description: "Catatan bebas khusus baris ini (beda dari \"Trans Description\" yang levelnya per-jurnal)." },
  { column: "JV Subsidiary Type", required: false, example: "", description: "Isi \"CUSTOMER\", \"EMPLOYEE\", atau \"VENDOR\" — cuma diisi kalau akun baris ini tipe Piutang/Hutang Usaha." },
  { column: "JV Cust No", required: false, example: "", description: "Kode Customer — isi kalau JV Subsidiary Type = CUSTOMER." },
  { column: "JV Employee No", required: false, example: "", description: "Kode Karyawan — isi kalau JV Subsidiary Type = EMPLOYEE." },
  { column: "JV Vendor No", required: false, example: "", description: "Kode Vendor — isi kalau JV Subsidiary Type = VENDOR." },
  { column: "Kategori Keuangan 1", required: false, example: "", description: "Data Classification 1 (Kategori Keuangan), harus PERSIS terdaftar di Accurate." },
  { column: "Kategori Keuangan 2", required: false, example: "", description: "Data Classification 2." },
  { column: "Kategori Keuangan 3", required: false, example: "", description: "Data Classification 3." },
  { column: "Kategori Keuangan 4", required: false, example: "", description: "Data Classification 4." },
  { column: "Kategori Keuangan 5", required: false, example: "", description: "Data Classification 5." },
  { column: "Kategori Keuangan 6", required: false, example: "", description: "Data Classification 6." },
  { column: "Kategori Keuangan 7", required: false, example: "", description: "Data Classification 7." },
  { column: "Kategori Keuangan 8", required: false, example: "", description: "Data Classification 8." },
  { column: "Kategori Keuangan 9", required: false, example: "", description: "Data Classification 9." },
  { column: "Kategori Keuangan 10", required: false, example: "", description: "Data Classification 10." },
];

// § architecture-other-payment.md — Other Payment = pembayaran bank/kas
// untuk BEBAN LANGSUNG (listrik, gaji, dll), TANPA faktur/vendor. Baris
// dengan "Trans No" SAMA digabung jadi 1 transaksi (N akun beban, bisa
// 1 baris/1 akun saja — TIDAK ada aturan double-entry/minimal baris).
//
// § "Expense Name" kolom BARU (TIDAK ada di template client asli) —
// WAJIB di Accurate (`detailAccount[].expenseName`), tapi template
// client tidak punya kolom untuk ini. Keputusan eksplisit user: tambah
// kolom baru, JANGAN biarkan kosong/repurpose kolom lain (risiko
// Accurate tolak field wajib kosong).
//
// § "Proyek" dan "Atribut Tambahan/Number/Tanggal" (charField/
// numericField/dateField, LEVEL ROOT) — diimplementasikan dengan
// catatan BELUM diverifikasi end-to-end KHUSUS endpoint
// `other-payment/save.do` (ada di 48 endpoint Accurate lain, dan
// dikonfirmasi resmi Support untuk Purchase Invoice — diasumsikan
// konsisten, tapi belum dites langsung ke endpoint ini). Tab
// "Deferral" SENGAJA TIDAK diimplementasi — bukan gap, tidak ada
// kolom Excel untuk ini di template client sama sekali.
export const otherPaymentTemplateGuide: TemplateFieldGuide[] = [
  { column: "Trans Date", required: true, format: DATE_FORMAT, example: "10/09/2026", description: "Tanggal transaksi pembayaran." },
  { column: "Trans No", required: true, example: "OP.2026.09.00001", description: "Nomor transaksi — isi SAMA di beberapa baris untuk menggabungkannya jadi 1 pembayaran dengan BANYAK akun beban (N akun, tidak terbatas 1)." },
  { column: "Branch Name", required: true, example: "JAKARTA", description: "Nama cabang — WAJIB diisi (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Bank No", required: true, example: "1-10200", description: "Kode Akun (COA) kas/bank sumber dana, PERSIS seperti terdaftar di Accurate — WAJIB SUDAH ADA." },
  { column: "Payee", required: true, example: "PLN", description: "Informasi penerima pembayaran (siapa/apa yang dibayar), bebas teks." },
  { column: "Cheque No", required: false, example: "", description: "Nomor cek/giro — kalau ada." },
  { column: "Description", required: false, example: "", description: "Catatan bebas untuk transaksi ini." },
  { column: "Rate", required: false, example: "1", description: "Nilai tukar mata uang — isi kalau transaksi pakai mata uang asing." },
  { column: "Acc No", required: true, example: "6-30100", description: "Kode Akun (COA) beban untuk BARIS INI, PERSIS seperti terdaftar di Accurate — WAJIB SUDAH ADA." },
  { column: "Expense Name", required: true, example: "Pembayaran listrik", description: "Nama/keterangan beban untuk baris ini (\"Paid to\" di UI Accurate) — BUKAN nama master akun (itu tetap tampil di Accurate berdasar Acc No), ini teks bebas spesifik untuk transaksi ini, WAJIB diisi." },
  { column: "Amount", required: true, example: "500000", description: "Nominal beban untuk baris ini. Angka polos, TANPA titik/koma pemisah ribuan." },
  { column: "Memo", required: false, example: "", description: "Catatan bebas khusus baris ini." },
  { column: "Department", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate. ⚠️ Belum diverifikasi end-to-end untuk endpoint ini." },
  { column: "Atribut Tambahan 1", required: false, example: "", description: "Atribut tambahan (teks bebas) level transaksi, dari baris PERTAMA grup saja. ⚠️ Belum diverifikasi end-to-end untuk endpoint ini." },
  { column: "Atribut Tambahan 2", required: false, example: "", description: "Atribut tambahan 2, sama catatan di atas." },
  { column: "Atribut Tambahan 3", required: false, example: "", description: "Atribut tambahan 3, sama catatan di atas." },
  { column: "Atribut Tambahan 4", required: false, example: "", description: "Atribut tambahan 4, sama catatan di atas." },
  { column: "Atribut Tambahan 5", required: false, example: "", description: "Atribut tambahan 5, sama catatan di atas." },
  { column: "Atribut Tambahan 6", required: false, example: "", description: "Atribut tambahan 6, sama catatan di atas." },
  { column: "Atribut Tambahan 7", required: false, example: "", description: "Atribut tambahan 7, sama catatan di atas." },
  { column: "Atribut Tambahan 8", required: false, example: "", description: "Atribut tambahan 8, sama catatan di atas." },
  { column: "Atribut Tambahan 9", required: false, example: "", description: "Atribut tambahan 9, sama catatan di atas." },
  { column: "Atribut Tambahan 10", required: false, example: "", description: "Atribut tambahan 10, sama catatan di atas." },
  { column: "Atribut Number 1", required: false, example: "", description: "Atribut angka level transaksi, dari baris PERTAMA grup saja. ⚠️ Belum diverifikasi end-to-end untuk endpoint ini." },
  { column: "Atribut Number 2", required: false, example: "", description: "Atribut angka 2, sama catatan di atas." },
  { column: "Atribut Number 3", required: false, example: "", description: "Atribut angka 3, sama catatan di atas." },
  { column: "Atribut Number 4", required: false, example: "", description: "Atribut angka 4, sama catatan di atas." },
  { column: "Atribut Number 5", required: false, example: "", description: "Atribut angka 5, sama catatan di atas." },
  { column: "Atribut Number 6", required: false, example: "", description: "Atribut angka 6, sama catatan di atas." },
  { column: "Atribut Number 7", required: false, example: "", description: "Atribut angka 7, sama catatan di atas." },
  { column: "Atribut Number 8", required: false, example: "", description: "Atribut angka 8, sama catatan di atas." },
  { column: "Atribut Number 9", required: false, example: "", description: "Atribut angka 9, sama catatan di atas." },
  { column: "Atribut Number 10", required: false, example: "", description: "Atribut angka 10, sama catatan di atas." },
  { column: "Atribut Tanggal 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tanggal 1 level transaksi, dari baris PERTAMA grup saja. ⚠️ Belum diverifikasi end-to-end untuk endpoint ini." },
  { column: "Atribut Tanggal 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tanggal 2, sama catatan di atas." },
  { column: "Kategori Keuangan 1", required: false, example: "", description: "Data Classification 1 (Kategori Keuangan) untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "Kategori Keuangan 2", required: false, example: "", description: "Data Classification 2, sama catatan di atas." },
  { column: "Kategori Keuangan 3", required: false, example: "", description: "Data Classification 3, sama catatan di atas." },
  { column: "Kategori Keuangan 4", required: false, example: "", description: "Data Classification 4, sama catatan di atas." },
  { column: "Kategori Keuangan 5", required: false, example: "", description: "Data Classification 5, sama catatan di atas." },
  { column: "Kategori Keuangan 6", required: false, example: "", description: "Data Classification 6, sama catatan di atas." },
  { column: "Kategori Keuangan 7", required: false, example: "", description: "Data Classification 7, sama catatan di atas." },
  { column: "Kategori Keuangan 8", required: false, example: "", description: "Data Classification 8, sama catatan di atas." },
  { column: "Kategori Keuangan 9", required: false, example: "", description: "Data Classification 9, sama catatan di atas." },
  { column: "Kategori Keuangan 10", required: false, example: "", description: "Data Classification 10, sama catatan di atas." },
];

// § Fase 128, architecture-other-deposit.md — kebalikan Other Payment
// (uang MASUK, bukan keluar), struktur API IDENTIK (dikonfirmasi ulang
// terhadap accurate-openapi.json, bukan asumsi).
export const otherDepositTemplateGuide: TemplateFieldGuide[] = [
  { column: "Trans Date", required: true, format: DATE_FORMAT, example: "10/09/2026", description: "Tanggal transaksi penerimaan." },
  { column: "Trans No", required: true, example: "OD.2026.09.00001", description: "Nomor transaksi — isi SAMA di beberapa baris untuk menggabungkannya jadi 1 penerimaan dengan BANYAK akun (N akun, tidak terbatas 1)." },
  { column: "Branch Name", required: true, example: "JAKARTA", description: "Nama cabang — WAJIB diisi (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Bank No", required: true, example: "1-10200", description: "Kode Akun (COA) kas/bank TUJUAN dana masuk, PERSIS seperti terdaftar di Accurate — WAJIB SUDAH ADA." },
  { column: "Payee", required: true, example: "PT Mitra Jaya", description: "Informasi pemberi/sumber dana (siapa/apa yang menyetor), bebas teks." },
  { column: "Cheque No", required: false, example: "", description: "Nomor cek/giro — kalau ada." },
  { column: "Description", required: false, example: "", description: "Catatan bebas untuk transaksi ini." },
  { column: "Rate", required: false, example: "1", description: "Nilai tukar mata uang — isi kalau transaksi pakai mata uang asing." },
  { column: "Acc No", required: true, example: "4-10100", description: "Kode Akun (COA) untuk BARIS INI, PERSIS seperti terdaftar di Accurate — WAJIB SUDAH ADA." },
  { column: "Expense Name", required: true, example: "Pendapatan Lain-lain", description: "Nama/keterangan untuk baris ini (field API Accurate literal namanya \"expenseName\" walau konteks penerimaan, § mapping.ts) — BUKAN nama master akun, ini teks bebas spesifik untuk transaksi ini, WAJIB diisi." },
  { column: "Amount", required: true, example: "500000", description: "Nominal untuk baris ini. Angka polos, TANPA titik/koma pemisah ribuan." },
  { column: "Memo", required: false, example: "", description: "Catatan bebas khusus baris ini." },
  { column: "Department", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate. ⚠️ Belum diverifikasi end-to-end untuk endpoint ini." },
  { column: "Atribut Tambahan 1", required: false, example: "", description: "Atribut tambahan (teks bebas) level transaksi, dari baris PERTAMA grup saja. ⚠️ Belum diverifikasi end-to-end untuk endpoint ini." },
  { column: "Atribut Tambahan 2", required: false, example: "", description: "Atribut tambahan 2, sama catatan di atas." },
  { column: "Atribut Tambahan 3", required: false, example: "", description: "Atribut tambahan 3, sama catatan di atas." },
  { column: "Atribut Tambahan 4", required: false, example: "", description: "Atribut tambahan 4, sama catatan di atas." },
  { column: "Atribut Tambahan 5", required: false, example: "", description: "Atribut tambahan 5, sama catatan di atas." },
  { column: "Atribut Tambahan 6", required: false, example: "", description: "Atribut tambahan 6, sama catatan di atas." },
  { column: "Atribut Tambahan 7", required: false, example: "", description: "Atribut tambahan 7, sama catatan di atas." },
  { column: "Atribut Tambahan 8", required: false, example: "", description: "Atribut tambahan 8, sama catatan di atas." },
  { column: "Atribut Tambahan 9", required: false, example: "", description: "Atribut tambahan 9, sama catatan di atas." },
  { column: "Atribut Tambahan 10", required: false, example: "", description: "Atribut tambahan 10, sama catatan di atas." },
  { column: "Atribut Number 1", required: false, example: "", description: "Atribut angka level transaksi, dari baris PERTAMA grup saja. ⚠️ Belum diverifikasi end-to-end untuk endpoint ini." },
  { column: "Atribut Number 2", required: false, example: "", description: "Atribut angka 2, sama catatan di atas." },
  { column: "Atribut Number 3", required: false, example: "", description: "Atribut angka 3, sama catatan di atas." },
  { column: "Atribut Number 4", required: false, example: "", description: "Atribut angka 4, sama catatan di atas." },
  { column: "Atribut Number 5", required: false, example: "", description: "Atribut angka 5, sama catatan di atas." },
  { column: "Atribut Number 6", required: false, example: "", description: "Atribut angka 6, sama catatan di atas." },
  { column: "Atribut Number 7", required: false, example: "", description: "Atribut angka 7, sama catatan di atas." },
  { column: "Atribut Number 8", required: false, example: "", description: "Atribut angka 8, sama catatan di atas." },
  { column: "Atribut Number 9", required: false, example: "", description: "Atribut angka 9, sama catatan di atas." },
  { column: "Atribut Number 10", required: false, example: "", description: "Atribut angka 10, sama catatan di atas." },
  { column: "Atribut Tanggal 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tanggal 1 level transaksi, dari baris PERTAMA grup saja. ⚠️ Belum diverifikasi end-to-end untuk endpoint ini." },
  { column: "Atribut Tanggal 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tanggal 2, sama catatan di atas." },
  { column: "Kategori Keuangan 1", required: false, example: "", description: "Data Classification 1 (Kategori Keuangan) untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "Kategori Keuangan 2", required: false, example: "", description: "Data Classification 2, sama catatan di atas." },
  { column: "Kategori Keuangan 3", required: false, example: "", description: "Data Classification 3, sama catatan di atas." },
  { column: "Kategori Keuangan 4", required: false, example: "", description: "Data Classification 4, sama catatan di atas." },
  { column: "Kategori Keuangan 5", required: false, example: "", description: "Data Classification 5, sama catatan di atas." },
  { column: "Kategori Keuangan 6", required: false, example: "", description: "Data Classification 6, sama catatan di atas." },
  { column: "Kategori Keuangan 7", required: false, example: "", description: "Data Classification 7, sama catatan di atas." },
  { column: "Kategori Keuangan 8", required: false, example: "", description: "Data Classification 8, sama catatan di atas." },
  { column: "Kategori Keuangan 9", required: false, example: "", description: "Data Classification 9, sama catatan di atas." },
  { column: "Kategori Keuangan 10", required: false, example: "", description: "Data Classification 10, sama catatan di atas." },
];

// § Fase 120, architecture-purchase-order.md — titik AWAL rantai
// procurement, mirror Purchase Invoice (auto-create vendor+item). "Trans
// No" WAJIB sejak awal modul ini (bukan retrofit) — kunci grouping
// multi-item. Field "Atribut Tambahan" level ITEM (Custom Character
// s/d 15 slot, Number 10, Date 2) SUDAH dikonfirmasi resmi Accurate
// Support (tiket #357901) — lihat architecture-purchase-order.md §
// "Atribut Tambahan".
export const purchaseOrderTemplateGuide: TemplateFieldGuide[] = [
  { column: "Trans Date", required: true, format: DATE_FORMAT, example: "15/09/2026", description: "Tanggal transaksi Purchase Order." },
  { column: "Trans No", required: true, example: "PO.2026.09.00001", description: "Nomor transaksi — WAJIB diisi, sekaligus kunci penggabungan baris jadi 1 Purchase Order (isi SAMA di beberapa baris untuk 1 PO berisi banyak barang)." },
  { column: "Vendor No", required: true, example: "V.0001", description: "Nomor/kode vendor PERSIS seperti di Accurate — kalau belum ada, dibuatkan otomatis (isi kolom \"Nama Vendor\" dkk di bawah)." },
  { column: "Pay Term Name", required: false, example: "", description: "Nama termin pembayaran, harus PERSIS terdaftar di Accurate." },
  { column: "To Address", required: false, example: "", description: "Alamat pengiriman/tujuan." },
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Description", required: false, example: "", description: "Catatan tambahan untuk transaksi ini." },
  { column: "Fill Price By Vendor", required: false, format: BOOLEAN_FORMAT, example: "", description: "Isi harga barang otomatis dari data vendor (bukan input manual)." },
  { column: "Cash Discount", required: false, example: "", description: "Nominal diskon nilai total transaksi." },
  { column: "Cash Disc Percent", required: false, example: "", description: "Diskon nilai total dalam persen — boleh bertingkat, mis. \"5 + 2\"." },
  { column: "Currency Code", required: false, example: "IDR", description: "Kode mata uang — kosongkan kalau Rupiah." },
  { column: "Rate", required: false, example: "1", description: "Nilai tukar mata uang — isi kalau Currency Code bukan IDR." },
  { column: "FOB Name", required: false, example: "", description: "Free On Board — titik alih tanggung jawab pengiriman." },
  { column: "Shipment Date", required: false, format: DATE_FORMAT, example: "", description: "Tanggal pengiriman diharapkan." },
  { column: "Shipment Name", required: false, example: "", description: "Nama metode/kurir pengiriman." },
  { column: "Include Tax", required: false, format: BOOLEAN_FORMAT, example: "", description: "Harga barang sudah termasuk pajak atau belum." },
  { column: "Taxable", required: false, format: BOOLEAN_FORMAT, example: "", description: "Transaksi ini kena pajak atau tidak." },
  { column: "Item No", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti di Accurate — kalau belum ada, dibuatkan otomatis (isi \"Item Name\"/\"Unit Name\")." },
  { column: "Item Name", required: false, example: "", description: "Nama barang — dipakai juga saat auto-create barang baru." },
  { column: "Qty", required: true, example: "10", description: "Jumlah barang yang dipesan. Angka polos, tanpa titik/koma pemisah ribuan." },
  { column: "Unit Name", required: true, example: "PCS", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Price", required: true, example: "50000", description: "Harga satuan barang." },
  { column: "Item Note", required: false, example: "", description: "Catatan untuk baris barang ini." },
  { column: "Item Warehouse", required: false, example: "", description: "Nama gudang tujuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "ITEM: Cash Discount", required: false, example: "", description: "Diskon nominal untuk baris barang ini." },
  { column: "ITEM: Disc Percent", required: false, example: "", description: "Diskon persen untuk baris barang ini." },
  { column: "ITEM: Requisite No", required: false, example: "", description: "Nomor Permintaan Pembelian terkait, kalau ada." },
  { column: "ITEM: Department", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "ITEM: Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "PPN", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPN atau tidak." },
  { column: "PPnBM", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPnBM atau tidak." },
  { column: "PPh", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPh atau tidak." },
  { column: "ITEM: Finance Category 1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "ITEM: Finance Category 2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "ITEM: Finance Category 3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "ITEM: Finance Category 4", required: false, example: "", description: "Kategori Keuangan 4, sama catatan di atas." },
  { column: "ITEM: Finance Category 5", required: false, example: "", description: "Kategori Keuangan 5, sama catatan di atas." },
  { column: "ITEM: Finance Category 6", required: false, example: "", description: "Kategori Keuangan 6, sama catatan di atas." },
  { column: "ITEM: Finance Category 7", required: false, example: "", description: "Kategori Keuangan 7, sama catatan di atas." },
  { column: "ITEM: Finance Category 8", required: false, example: "", description: "Kategori Keuangan 8, sama catatan di atas." },
  { column: "ITEM: Finance Category 9", required: false, example: "", description: "Kategori Keuangan 9, sama catatan di atas." },
  { column: "ITEM: Finance Category 10", required: false, example: "", description: "Kategori Keuangan 10, sama catatan di atas." },
  { column: "Expense Acc No", required: false, example: "", description: "Kode Akun (COA) beban tambahan level dokumen — WAJIB diisi bersama \"Expense Amount\"." },
  { column: "Expense Name", required: false, example: "", description: "Nama/keterangan beban tambahan." },
  { column: "Expense Amount", required: false, example: "", description: "Nominal beban tambahan — WAJIB diisi bersama \"Expense Acc No\"." },
  { column: "Expense Note", required: false, example: "", description: "Catatan beban tambahan." },
  { column: "EXPENSE: Department", required: false, example: "", description: "Nama departemen untuk baris beban ini." },
  { column: "EXPENSE: Project No", required: false, example: "", description: "Kode proyek untuk baris beban ini." },
  { column: "EXPENSE: Finance Category 1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris beban ini." },
  { column: "EXPENSE: Finance Category 2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 4", required: false, example: "", description: "Kategori Keuangan 4, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 5", required: false, example: "", description: "Kategori Keuangan 5, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 6", required: false, example: "", description: "Kategori Keuangan 6, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 7", required: false, example: "", description: "Kategori Keuangan 7, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 8", required: false, example: "", description: "Kategori Keuangan 8, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 9", required: false, example: "", description: "Kategori Keuangan 9, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 10", required: false, example: "", description: "Kategori Keuangan 10, sama catatan di atas." },
  { column: "ITEM: Custom Character 1", required: false, example: "", description: "Atribut tambahan teks 1 untuk baris ini (dikonfirmasi resmi Accurate Support, § architecture-purchase-order.md)." },
  { column: "ITEM: Custom Character 2", required: false, example: "", description: "Atribut tambahan teks 2, sama catatan di atas." },
  { column: "ITEM: Custom Character 3", required: false, example: "", description: "Atribut tambahan teks 3, sama catatan di atas." },
  { column: "ITEM: Custom Character 4", required: false, example: "", description: "Atribut tambahan teks 4, sama catatan di atas." },
  { column: "ITEM: Custom Character 5", required: false, example: "", description: "Atribut tambahan teks 5, sama catatan di atas." },
  { column: "ITEM: Custom Character 6", required: false, example: "", description: "Atribut tambahan teks 6, sama catatan di atas." },
  { column: "ITEM: Custom Character 7", required: false, example: "", description: "Atribut tambahan teks 7, sama catatan di atas." },
  { column: "ITEM: Custom Character 8", required: false, example: "", description: "Atribut tambahan teks 8, sama catatan di atas." },
  { column: "ITEM: Custom Character 9", required: false, example: "", description: "Atribut tambahan teks 9, sama catatan di atas." },
  { column: "ITEM: Custom Character 10", required: false, example: "", description: "Atribut tambahan teks 10, sama catatan di atas." },
  { column: "ITEM: Custom Number 1", required: false, example: "", description: "Atribut tambahan angka 1 untuk baris ini." },
  { column: "ITEM: Custom Number 2", required: false, example: "", description: "Atribut tambahan angka 2, sama catatan di atas." },
  { column: "ITEM: Custom Number 3", required: false, example: "", description: "Atribut tambahan angka 3, sama catatan di atas." },
  { column: "ITEM: Custom Number 4", required: false, example: "", description: "Atribut tambahan angka 4, sama catatan di atas." },
  { column: "ITEM: Custom Number 5", required: false, example: "", description: "Atribut tambahan angka 5, sama catatan di atas." },
  { column: "ITEM: Custom Number 6", required: false, example: "", description: "Atribut tambahan angka 6, sama catatan di atas." },
  { column: "ITEM: Custom Number 7", required: false, example: "", description: "Atribut tambahan angka 7, sama catatan di atas." },
  { column: "ITEM: Custom Number 8", required: false, example: "", description: "Atribut tambahan angka 8, sama catatan di atas." },
  { column: "ITEM: Custom Number 9", required: false, example: "", description: "Atribut tambahan angka 9, sama catatan di atas." },
  { column: "ITEM: Custom Number 10", required: false, example: "", description: "Atribut tambahan angka 10, sama catatan di atas." },
  { column: "ITEM: Custom Date 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 1 untuk baris ini." },
  { column: "ITEM: Custom Date 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 2, sama catatan di atas." },
];

// § Fase 121, architecture-receive-item.md — dokumen bukti barang
// diterima dari vendor. BEDA dari Purchase Order: TIDAK ADA kolom
// Expense sama sekali (modul ini tidak punya detailExpense[]), auto-create
// vendor/item TIDAK berlaku (vendorNo/itemNo dikirim apa adanya).
export const receiveItemTemplateGuide: TemplateFieldGuide[] = [
  { column: "Date", required: true, format: DATE_FORMAT, example: "15/09/2026", description: "Tanggal transaksi Receive Item." },
  { column: "Vendor No", required: true, example: "V.0001", description: "Nomor/kode vendor PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Receive Number", required: true, example: "SJ-2026-00001", description: "Nomor surat jalan/pengiriman dari VENDOR (bukan nomor internal Accurate) — WAJIB diisi, sekaligus kunci penggabungan baris jadi 1 Receive Item (isi SAMA di beberapa baris untuk 1 penerimaan berisi banyak barang)." },
  { column: "Trans Number", required: false, example: "", description: "Nomor transaksi INTERNAL Accurate — kosongkan untuk auto-number, BEDA dari \"Receive Number\" di atas." },
  { column: "Currency Code", required: false, example: "", description: "Kode mata uang, kosongkan untuk mata uang dasar perusahaan." },
  { column: "Description", required: false, example: "", description: "Keterangan/catatan untuk transaksi ini." },
  { column: "FOB Name", required: false, example: "", description: "Free On Board — titik serah tanggung jawab pengiriman." },
  { column: "Shipment Name", required: false, example: "", description: "Nama jasa pengiriman/ekspedisi." },
  { column: "Shipment Date", required: false, format: DATE_FORMAT, example: "", description: "Tanggal pengiriman barang." },
  { column: "To Address", required: false, example: "", description: "Alamat tujuan pengiriman." },
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Custom Character 1", required: false, example: "", description: "Atribut tambahan teks 1 level dokumen (dikonfirmasi resmi Accurate Support, § architecture-receive-item.md)." },
  { column: "Custom Character 2", required: false, example: "", description: "Atribut tambahan teks 2, sama catatan di atas." },
  { column: "Custom Character 3", required: false, example: "", description: "Atribut tambahan teks 3, sama catatan di atas." },
  { column: "Custom Character 4", required: false, example: "", description: "Atribut tambahan teks 4, sama catatan di atas." },
  { column: "Custom Character 5", required: false, example: "", description: "Atribut tambahan teks 5, sama catatan di atas." },
  { column: "Custom Character 6", required: false, example: "", description: "Atribut tambahan teks 6, sama catatan di atas." },
  { column: "Custom Character 7", required: false, example: "", description: "Atribut tambahan teks 7, sama catatan di atas." },
  { column: "Custom Character 8", required: false, example: "", description: "Atribut tambahan teks 8, sama catatan di atas." },
  { column: "Custom Character 9", required: false, example: "", description: "Atribut tambahan teks 9, sama catatan di atas." },
  { column: "Custom Character 10", required: false, example: "", description: "Atribut tambahan teks 10, sama catatan di atas." },
  { column: "Custom Number 1", required: false, example: "", description: "Atribut tambahan angka 1 level dokumen." },
  { column: "Custom Number 2", required: false, example: "", description: "Atribut tambahan angka 2, sama catatan di atas." },
  { column: "Custom Number 3", required: false, example: "", description: "Atribut tambahan angka 3, sama catatan di atas." },
  { column: "Custom Number 4", required: false, example: "", description: "Atribut tambahan angka 4, sama catatan di atas." },
  { column: "Custom Number 5", required: false, example: "", description: "Atribut tambahan angka 5, sama catatan di atas." },
  { column: "Custom Number 6", required: false, example: "", description: "Atribut tambahan angka 6, sama catatan di atas." },
  { column: "Custom Number 7", required: false, example: "", description: "Atribut tambahan angka 7, sama catatan di atas." },
  { column: "Custom Number 8", required: false, example: "", description: "Atribut tambahan angka 8, sama catatan di atas." },
  { column: "Custom Number 9", required: false, example: "", description: "Atribut tambahan angka 9, sama catatan di atas." },
  { column: "Custom Number 10", required: false, example: "", description: "Atribut tambahan angka 10, sama catatan di atas." },
  { column: "Custom Date 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 1 level dokumen." },
  { column: "Custom Date 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 2, sama catatan di atas." },
  { column: "Item No", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Item Name", required: false, example: "", description: "Nama/deskripsi barang — kosongkan untuk pakai nama dari data master barang." },
  { column: "Quantity", required: true, example: "10", description: "Jumlah barang yang diterima." },
  { column: "Unit Name", required: true, example: "Unit", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Warehouse", required: false, example: "", description: "Nama gudang tujuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "ITEM: Department", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "ITEM: Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "ITEM: Description", required: false, example: "", description: "Catatan tambahan untuk baris barang ini (BUKAN nama barang — lihat \"Item Name\" di atas)." },
  { column: "ITEM: Purchase Order No", required: false, example: "", description: "Nomor transaksi Pesanan Pembelian (Purchase Order) terkait, kalau barang ini menutup PO tertentu — kolom TAMBAHAN di luar permintaan awal, opsional." },
  { column: "ITEM: Finance Category 1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "ITEM: Finance Category 2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "ITEM: Finance Category 3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "ITEM: Finance Category 4", required: false, example: "", description: "Kategori Keuangan 4, sama catatan di atas." },
  { column: "ITEM: Finance Category 5", required: false, example: "", description: "Kategori Keuangan 5, sama catatan di atas." },
  { column: "ITEM: Finance Category 6", required: false, example: "", description: "Kategori Keuangan 6, sama catatan di atas." },
  { column: "ITEM: Finance Category 7", required: false, example: "", description: "Kategori Keuangan 7, sama catatan di atas." },
  { column: "ITEM: Finance Category 8", required: false, example: "", description: "Kategori Keuangan 8, sama catatan di atas." },
  { column: "ITEM: Finance Category 9", required: false, example: "", description: "Kategori Keuangan 9, sama catatan di atas." },
  { column: "ITEM: Finance Category 10", required: false, example: "", description: "Kategori Keuangan 10, sama catatan di atas." },
  { column: "ITEM: Custom Character 1", required: false, example: "", description: "Atribut tambahan teks 1 level barang." },
  { column: "ITEM: Custom Character 2", required: false, example: "", description: "Atribut tambahan teks 2, sama catatan di atas." },
  { column: "ITEM: Custom Character 3", required: false, example: "", description: "Atribut tambahan teks 3, sama catatan di atas." },
  { column: "ITEM: Custom Character 4", required: false, example: "", description: "Atribut tambahan teks 4, sama catatan di atas." },
  { column: "ITEM: Custom Character 5", required: false, example: "", description: "Atribut tambahan teks 5, sama catatan di atas." },
  { column: "ITEM: Custom Character 6", required: false, example: "", description: "Atribut tambahan teks 6, sama catatan di atas." },
  { column: "ITEM: Custom Character 7", required: false, example: "", description: "Atribut tambahan teks 7, sama catatan di atas." },
  { column: "ITEM: Custom Character 8", required: false, example: "", description: "Atribut tambahan teks 8, sama catatan di atas." },
  { column: "ITEM: Custom Character 9", required: false, example: "", description: "Atribut tambahan teks 9, sama catatan di atas." },
  { column: "ITEM: Custom Character 10", required: false, example: "", description: "Atribut tambahan teks 10, sama catatan di atas." },
  { column: "ITEM: Custom Number 1", required: false, example: "", description: "Atribut tambahan angka 1 level barang." },
  { column: "ITEM: Custom Number 2", required: false, example: "", description: "Atribut tambahan angka 2, sama catatan di atas." },
  { column: "ITEM: Custom Number 3", required: false, example: "", description: "Atribut tambahan angka 3, sama catatan di atas." },
  { column: "ITEM: Custom Number 4", required: false, example: "", description: "Atribut tambahan angka 4, sama catatan di atas." },
  { column: "ITEM: Custom Number 5", required: false, example: "", description: "Atribut tambahan angka 5, sama catatan di atas." },
  { column: "ITEM: Custom Number 6", required: false, example: "", description: "Atribut tambahan angka 6, sama catatan di atas." },
  { column: "ITEM: Custom Number 7", required: false, example: "", description: "Atribut tambahan angka 7, sama catatan di atas." },
  { column: "ITEM: Custom Number 8", required: false, example: "", description: "Atribut tambahan angka 8, sama catatan di atas." },
  { column: "ITEM: Custom Number 9", required: false, example: "", description: "Atribut tambahan angka 9, sama catatan di atas." },
  { column: "ITEM: Custom Number 10", required: false, example: "", description: "Atribut tambahan angka 10, sama catatan di atas." },
  { column: "ITEM: Custom Date 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 1 level barang." },
  { column: "ITEM: Custom Date 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 2, sama catatan di atas." },
];

// § Fase 122, architecture-purchase-return.md — retur terhadap
// transaksi yang sudah ada (Purchase Invoice/Receive Item/tanpa acuan).
// TIDAK ADA kolom Item Warehouse/Expense Project (tidak ada field API
// untuk keduanya di endpoint ini, § architecture doc).
export const purchaseReturnTemplateGuide: TemplateFieldGuide[] = [
  { column: "Date", required: true, format: DATE_FORMAT, example: "15/09/2026", description: "Tanggal transaksi Purchase Return." },
  { column: "TransNo", required: false, example: "", description: "Nomor transaksi INTERNAL Accurate — opsional, sekaligus kunci penggabungan baris kalau diisi (isi SAMA di beberapa baris untuk 1 retur berisi banyak barang). Kosongkan untuk auto-number, tiap baris jadi retur sendiri-sendiri." },
  { column: "Invoice No", required: false, example: "", description: "Nomor Faktur Pembelian yang diretur — WAJIB diisi kalau \"Return Type\" = INVOICE atau INVOICE_DP." },
  { column: "Receive Item No", required: false, example: "", description: "Nomor Receive Item yang diretur — WAJIB diisi kalau \"Return Type\" = RECEIVE." },
  { column: "Vendor No", required: true, example: "V.0001", description: "Nomor/kode vendor PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Return Type", required: true, example: "NO_INVOICE", description: "Jenis retur — isi salah satu: INVOICE (retur ke Faktur Pembelian), INVOICE_DP (retur ke Faktur Pembelian Uang Muka), RECEIVE (retur ke Receive Item), atau NO_INVOICE (retur tanpa acuan dokumen)." },
  { column: "To Address", required: false, example: "", description: "Alamat pengembalian barang." },
  { column: "Branch", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Notes", required: false, example: "", description: "Keterangan/catatan untuk transaksi ini." },
  { column: "Tax Date", required: true, format: DATE_FORMAT, example: "15/09/2026", description: "Tanggal Faktur Pajak — WAJIB diisi (retur selalu melibatkan Faktur Pajak)." },
  { column: "Tax Num", required: true, example: "", description: "Nomor Faktur Pajak — WAJIB diisi." },
  { column: "Cash Disc", required: false, example: "", description: "Diskon tunai nominal." },
  { column: "Cash Disc %", required: false, example: "", description: "Diskon tunai persen." },
  { column: "Currency Code", required: false, example: "", description: "Kode mata uang, kosongkan untuk mata uang dasar perusahaan." },
  { column: "Rate", required: false, example: "", description: "Kurs mata uang asing ke mata uang dasar." },
  { column: "Fiscal Rate", required: false, example: "", description: "Kurs pajak (fiskal)." },
  { column: "FOB", required: false, example: "", description: "Free On Board — titik serah tanggung jawab pengiriman." },
  { column: "Taxable", required: false, format: BOOLEAN_FORMAT, example: "", description: "Transaksi ini kena pajak atau tidak." },
  { column: "Include Tax", required: false, format: BOOLEAN_FORMAT, example: "", description: "Harga sudah termasuk pajak atau belum." },
  { column: "Pay Term", required: false, example: "", description: "Nama syarat pembayaran, harus PERSIS terdaftar di Accurate." },
  { column: "Shipment Name", required: false, example: "", description: "Nama jasa pengiriman/ekspedisi." },
  { column: "Item No", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Item Name", required: false, example: "", description: "Nama/deskripsi barang — kosongkan untuk pakai nama dari data master barang." },
  { column: "Item Qty", required: true, example: "5", description: "Jumlah barang yang diretur." },
  { column: "Item Unit Name", required: true, example: "Unit", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Notes", required: false, example: "", description: "Catatan untuk baris barang ini." },
  { column: "Item Department", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "ITEM: Finance Category 1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "ITEM: Finance Category 2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "ITEM: Finance Category 3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "ITEM: Finance Category 4", required: false, example: "", description: "Kategori Keuangan 4, sama catatan di atas." },
  { column: "ITEM: Finance Category 5", required: false, example: "", description: "Kategori Keuangan 5, sama catatan di atas." },
  { column: "ITEM: Finance Category 6", required: false, example: "", description: "Kategori Keuangan 6, sama catatan di atas." },
  { column: "ITEM: Finance Category 7", required: false, example: "", description: "Kategori Keuangan 7, sama catatan di atas." },
  { column: "ITEM: Finance Category 8", required: false, example: "", description: "Kategori Keuangan 8, sama catatan di atas." },
  { column: "ITEM: Finance Category 9", required: false, example: "", description: "Kategori Keuangan 9, sama catatan di atas." },
  { column: "ITEM: Finance Category 10", required: false, example: "", description: "Kategori Keuangan 10, sama catatan di atas." },
  { column: "ITEM: Custom Character 1", required: false, example: "", description: "Atribut tambahan teks 1 untuk baris ini (dikonfirmasi resmi Accurate Support)." },
  { column: "ITEM: Custom Character 2", required: false, example: "", description: "Atribut tambahan teks 2, sama catatan di atas." },
  { column: "ITEM: Custom Character 3", required: false, example: "", description: "Atribut tambahan teks 3, sama catatan di atas." },
  { column: "ITEM: Custom Character 4", required: false, example: "", description: "Atribut tambahan teks 4, sama catatan di atas." },
  { column: "ITEM: Custom Character 5", required: false, example: "", description: "Atribut tambahan teks 5, sama catatan di atas." },
  { column: "ITEM: Custom Character 6", required: false, example: "", description: "Atribut tambahan teks 6, sama catatan di atas." },
  { column: "ITEM: Custom Character 7", required: false, example: "", description: "Atribut tambahan teks 7, sama catatan di atas." },
  { column: "ITEM: Custom Character 8", required: false, example: "", description: "Atribut tambahan teks 8, sama catatan di atas." },
  { column: "ITEM: Custom Character 9", required: false, example: "", description: "Atribut tambahan teks 9, sama catatan di atas." },
  { column: "ITEM: Custom Character 10", required: false, example: "", description: "Atribut tambahan teks 10, sama catatan di atas." },
  { column: "ITEM: Custom Number 1", required: false, example: "", description: "Atribut tambahan angka 1 untuk baris ini." },
  { column: "ITEM: Custom Number 2", required: false, example: "", description: "Atribut tambahan angka 2, sama catatan di atas." },
  { column: "ITEM: Custom Number 3", required: false, example: "", description: "Atribut tambahan angka 3, sama catatan di atas." },
  { column: "ITEM: Custom Number 4", required: false, example: "", description: "Atribut tambahan angka 4, sama catatan di atas." },
  { column: "ITEM: Custom Number 5", required: false, example: "", description: "Atribut tambahan angka 5, sama catatan di atas." },
  { column: "ITEM: Custom Number 6", required: false, example: "", description: "Atribut tambahan angka 6, sama catatan di atas." },
  { column: "ITEM: Custom Number 7", required: false, example: "", description: "Atribut tambahan angka 7, sama catatan di atas." },
  { column: "ITEM: Custom Number 8", required: false, example: "", description: "Atribut tambahan angka 8, sama catatan di atas." },
  { column: "ITEM: Custom Number 9", required: false, example: "", description: "Atribut tambahan angka 9, sama catatan di atas." },
  { column: "ITEM: Custom Number 10", required: false, example: "", description: "Atribut tambahan angka 10, sama catatan di atas." },
  { column: "ITEM: Custom Date 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 1 untuk baris ini." },
  { column: "ITEM: Custom Date 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 2, sama catatan di atas." },
  { column: "Expense Acc No", required: false, example: "", description: "Kode Akun (COA) beban tambahan level dokumen — WAJIB diisi bersama \"Expense Amount\"." },
  { column: "Expense Name", required: false, example: "", description: "Nama/keterangan beban tambahan." },
  { column: "Expense Amount", required: false, example: "", description: "Nominal beban tambahan — WAJIB diisi bersama \"Expense Acc No\"." },
  { column: "Expense Notes", required: false, example: "", description: "Catatan beban tambahan." },
  { column: "Expense Department", required: false, example: "", description: "Nama departemen untuk baris beban ini." },
  { column: "EXPENSE: Finance Category 1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris beban ini." },
  { column: "EXPENSE: Finance Category 2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 4", required: false, example: "", description: "Kategori Keuangan 4, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 5", required: false, example: "", description: "Kategori Keuangan 5, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 6", required: false, example: "", description: "Kategori Keuangan 6, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 7", required: false, example: "", description: "Kategori Keuangan 7, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 8", required: false, example: "", description: "Kategori Keuangan 8, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 9", required: false, example: "", description: "Kategori Keuangan 9, sama catatan di atas." },
  { column: "EXPENSE: Finance Category 10", required: false, example: "", description: "Kategori Keuangan 10, sama catatan di atas." },
];

// § Fase 123, architecture-sales-quotation.md — dokumen PALING AWAL
// rantai penjualan (proposal/penawaran harga), auto-create
// Customer+Item (mirror Sales Invoice). TIDAK ADA kolom "Expense
// Project No" (tidak ada field API untuk itu, § architecture doc).
export const salesQuotationTemplateGuide: TemplateFieldGuide[] = [
  { column: "Date", required: true, format: DATE_FORMAT, example: "15/09/2026", description: "Tanggal transaksi Sales Quotation." },
  { column: "Trans Number", required: false, example: "", description: "Nomor transaksi INTERNAL Accurate — opsional, sekaligus kunci penggabungan baris kalau diisi (isi SAMA di beberapa baris untuk 1 quotation berisi banyak barang). Kosongkan untuk auto-number, tiap baris jadi quotation sendiri-sendiri." },
  { column: "Customer Number", required: true, example: "C.0001", description: "Nomor/kode customer PERSIS seperti di Accurate — dibuatkan otomatis kalau belum ada (isi kolom \"Nama Customer\" dkk kalau perlu)." },
  { column: "Currency Code", required: false, example: "", description: "Kode mata uang, kosongkan untuk mata uang dasar perusahaan." },
  { column: "Payterm Name", required: false, example: "", description: "Nama syarat pembayaran, harus PERSIS terdaftar di Accurate." },
  { column: "To Address", required: false, example: "", description: "Alamat pengiriman/tujuan." },
  { column: "Description", required: false, example: "", description: "Keterangan/catatan untuk transaksi ini." },
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Cash Discount", required: false, example: "", description: "Diskon tunai nominal." },
  { column: "Cash Discount Percent", required: false, example: "", description: "Diskon tunai persen." },
  { column: "FOB Name", required: false, example: "", description: "Free On Board — titik serah tanggung jawab pengiriman." },
  { column: "Taxable", required: false, format: BOOLEAN_FORMAT, example: "", description: "Transaksi ini kena pajak atau tidak." },
  { column: "Include Tax", required: false, format: BOOLEAN_FORMAT, example: "", description: "Harga sudah termasuk pajak atau belum." },
  { column: "Custom Character 1", required: false, example: "", description: "Atribut tambahan teks 1 level dokumen (dikonfirmasi resmi Accurate Support)." },
  { column: "Custom Character 2", required: false, example: "", description: "Atribut tambahan teks 2, sama catatan di atas." },
  { column: "Custom Character 3", required: false, example: "", description: "Atribut tambahan teks 3, sama catatan di atas." },
  { column: "Custom Character 4", required: false, example: "", description: "Atribut tambahan teks 4, sama catatan di atas." },
  { column: "Custom Character 5", required: false, example: "", description: "Atribut tambahan teks 5, sama catatan di atas." },
  { column: "Custom Character 6", required: false, example: "", description: "Atribut tambahan teks 6, sama catatan di atas." },
  { column: "Custom Character 7", required: false, example: "", description: "Atribut tambahan teks 7, sama catatan di atas." },
  { column: "Custom Character 8", required: false, example: "", description: "Atribut tambahan teks 8, sama catatan di atas." },
  { column: "Custom Character 9", required: false, example: "", description: "Atribut tambahan teks 9, sama catatan di atas." },
  { column: "Custom Character 10", required: false, example: "", description: "Atribut tambahan teks 10, sama catatan di atas." },
  { column: "Custom Number 1", required: false, example: "", description: "Atribut tambahan angka 1 level dokumen." },
  { column: "Custom Number 2", required: false, example: "", description: "Atribut tambahan angka 2, sama catatan di atas." },
  { column: "Custom Number 3", required: false, example: "", description: "Atribut tambahan angka 3, sama catatan di atas." },
  { column: "Custom Number 4", required: false, example: "", description: "Atribut tambahan angka 4, sama catatan di atas." },
  { column: "Custom Number 5", required: false, example: "", description: "Atribut tambahan angka 5, sama catatan di atas." },
  { column: "Custom Number 6", required: false, example: "", description: "Atribut tambahan angka 6, sama catatan di atas." },
  { column: "Custom Number 7", required: false, example: "", description: "Atribut tambahan angka 7, sama catatan di atas." },
  { column: "Custom Number 8", required: false, example: "", description: "Atribut tambahan angka 8, sama catatan di atas." },
  { column: "Custom Number 9", required: false, example: "", description: "Atribut tambahan angka 9, sama catatan di atas." },
  { column: "Custom Number 10", required: false, example: "", description: "Atribut tambahan angka 10, sama catatan di atas." },
  { column: "Custom Date 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 1 level dokumen." },
  { column: "Custom Date 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 2, sama catatan di atas." },
  { column: "Item Number", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti di Accurate — dibuatkan otomatis kalau belum ada." },
  { column: "Item Name", required: false, example: "", description: "Nama/deskripsi barang — kosongkan untuk pakai nama dari data master barang." },
  { column: "Item price", required: true, example: "50000", description: "Harga satuan barang." },
  { column: "Item Quantity", required: true, example: "5", description: "Jumlah barang yang ditawarkan." },
  { column: "Item Unit Name", required: true, example: "Unit", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Salesman No", required: false, example: "", description: "Kode tenaga penjual untuk baris ini — 1 kode per baris (tidak mendukung banyak salesman sekaligus)." },
  { column: "Item Cash Discount", required: false, example: "", description: "Diskon nominal untuk baris barang ini." },
  { column: "Item Discount Percent", required: false, example: "", description: "Diskon persen untuk baris barang ini." },
  { column: "Item Tax1", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena Pajak 1 atau tidak." },
  { column: "Item Tax2", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena Pajak 2 atau tidak." },
  { column: "Item Tax3", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena Pajak 3 atau tidak." },
  { column: "Item Note", required: false, example: "", description: "Catatan untuk baris barang ini." },
  { column: "Item Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Department", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "ITEM: Finance Category 1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "ITEM: Finance Category 2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "ITEM: Finance Category 3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "ITEM: Finance Category 4", required: false, example: "", description: "Kategori Keuangan 4, sama catatan di atas." },
  { column: "ITEM: Finance Category 5", required: false, example: "", description: "Kategori Keuangan 5, sama catatan di atas." },
  { column: "ITEM: Finance Category 6", required: false, example: "", description: "Kategori Keuangan 6, sama catatan di atas." },
  { column: "ITEM: Finance Category 7", required: false, example: "", description: "Kategori Keuangan 7, sama catatan di atas." },
  { column: "ITEM: Finance Category 8", required: false, example: "", description: "Kategori Keuangan 8, sama catatan di atas." },
  { column: "ITEM: Finance Category 9", required: false, example: "", description: "Kategori Keuangan 9, sama catatan di atas." },
  { column: "ITEM: Finance Category 10", required: false, example: "", description: "Kategori Keuangan 10, sama catatan di atas." },
  { column: "ITEM: Custom Character 1", required: false, example: "", description: "Atribut tambahan teks 1 level barang." },
  { column: "ITEM: Custom Character 2", required: false, example: "", description: "Atribut tambahan teks 2, sama catatan di atas." },
  { column: "ITEM: Custom Character 3", required: false, example: "", description: "Atribut tambahan teks 3, sama catatan di atas." },
  { column: "ITEM: Custom Character 4", required: false, example: "", description: "Atribut tambahan teks 4, sama catatan di atas." },
  { column: "ITEM: Custom Character 5", required: false, example: "", description: "Atribut tambahan teks 5, sama catatan di atas." },
  { column: "ITEM: Custom Character 6", required: false, example: "", description: "Atribut tambahan teks 6, sama catatan di atas." },
  { column: "ITEM: Custom Character 7", required: false, example: "", description: "Atribut tambahan teks 7, sama catatan di atas." },
  { column: "ITEM: Custom Character 8", required: false, example: "", description: "Atribut tambahan teks 8, sama catatan di atas." },
  { column: "ITEM: Custom Character 9", required: false, example: "", description: "Atribut tambahan teks 9, sama catatan di atas." },
  { column: "ITEM: Custom Character 10", required: false, example: "", description: "Atribut tambahan teks 10, sama catatan di atas." },
  { column: "ITEM: Custom Number 1", required: false, example: "", description: "Atribut tambahan angka 1 level barang." },
  { column: "ITEM: Custom Number 2", required: false, example: "", description: "Atribut tambahan angka 2, sama catatan di atas." },
  { column: "ITEM: Custom Number 3", required: false, example: "", description: "Atribut tambahan angka 3, sama catatan di atas." },
  { column: "ITEM: Custom Number 4", required: false, example: "", description: "Atribut tambahan angka 4, sama catatan di atas." },
  { column: "ITEM: Custom Number 5", required: false, example: "", description: "Atribut tambahan angka 5, sama catatan di atas." },
  { column: "ITEM: Custom Number 6", required: false, example: "", description: "Atribut tambahan angka 6, sama catatan di atas." },
  { column: "ITEM: Custom Number 7", required: false, example: "", description: "Atribut tambahan angka 7, sama catatan di atas." },
  { column: "ITEM: Custom Number 8", required: false, example: "", description: "Atribut tambahan angka 8, sama catatan di atas." },
  { column: "ITEM: Custom Number 9", required: false, example: "", description: "Atribut tambahan angka 9, sama catatan di atas." },
  { column: "ITEM: Custom Number 10", required: false, example: "", description: "Atribut tambahan angka 10, sama catatan di atas." },
  { column: "ITEM: Custom Date 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 1 level barang." },
  { column: "ITEM: Custom Date 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 2, sama catatan di atas." },
  { column: "Expense Account no", required: false, example: "", description: "Kode Akun (COA) beban tambahan level dokumen — WAJIB diisi bersama \"Expense Amount\"." },
  { column: "Expense Name", required: false, example: "", description: "Nama/keterangan beban tambahan." },
  { column: "Expense Amount", required: false, example: "", description: "Nominal beban tambahan — WAJIB diisi bersama \"Expense Account no\"." },
  { column: "Expense Note", required: false, example: "", description: "Catatan beban tambahan." },
  { column: "Expense Department", required: false, example: "", description: "Nama departemen untuk baris beban ini." },
  { column: "Expense: Finance Category 1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris beban ini." },
  { column: "Expense: Finance Category 2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "Expense: Finance Category 3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "Expense: Finance Category 4", required: false, example: "", description: "Kategori Keuangan 4, sama catatan di atas." },
  { column: "Expense: Finance Category 5", required: false, example: "", description: "Kategori Keuangan 5, sama catatan di atas." },
  { column: "Expense: Finance Category 6", required: false, example: "", description: "Kategori Keuangan 6, sama catatan di atas." },
  { column: "Expense: Finance Category 7", required: false, example: "", description: "Kategori Keuangan 7, sama catatan di atas." },
  { column: "Expense: Finance Category 8", required: false, example: "", description: "Kategori Keuangan 8, sama catatan di atas." },
  { column: "Expense: Finance Category 9", required: false, example: "", description: "Kategori Keuangan 9, sama catatan di atas." },
  { column: "Expense: Finance Category 10", required: false, example: "", description: "Kategori Keuangan 10, sama catatan di atas." },
];

// § Fase 137, architecture-sales-order.md — kelanjutan LANGSUNG Sales
// Quotation (client konfirmasi penawaran jadi pesanan resmi), auto-create
// Customer+Item (mirror Sales Quotation/Sales Invoice). Field BARU vs
// Sales Quotation: "PO Number" dan "Sales List No" (ARRAY beneran,
// dipisah koma). Nama kolom PERSIS sesuai sheet client asli (BUKAN gaya
// generik seperti Sales Quotation lama).
export const salesOrderTemplateGuide: TemplateFieldGuide[] = [
  { column: "Trans Date", required: true, format: DATE_FORMAT, example: "15/09/2026", description: "Tanggal transaksi Sales Order." },
  { column: "Trans No", required: false, example: "", description: "Nomor transaksi INTERNAL Accurate — opsional, sekaligus kunci penggabungan baris kalau diisi (isi SAMA di beberapa baris untuk 1 sales order berisi banyak barang). Kosongkan untuk auto-number, tiap baris jadi sales order sendiri-sendiri." },
  { column: "Cust No", required: true, example: "C.0001", description: "Nomor/kode customer PERSIS seperti di Accurate — dibuatkan otomatis kalau belum ada." },
  { column: "Pay Term Name", required: false, example: "", description: "Nama syarat pembayaran, harus PERSIS terdaftar di Accurate." },
  { column: "To Address", required: false, example: "", description: "Alamat pengiriman/tujuan." },
  { column: "Description", required: false, example: "", description: "Keterangan/catatan untuk transaksi ini." },
  { column: "PO Number", required: false, example: "", description: "Nomor referensi Purchase Order dari customer (BUKAN field yang ada di Sales Quotation)." },
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Cash Discount", required: false, example: "", description: "Diskon tunai nominal." },
  { column: "Cash Disc Percent", required: false, example: "", description: "Diskon tunai persen." },
  { column: "Currency Code", required: false, example: "", description: "Kode mata uang, kosongkan untuk mata uang dasar perusahaan." },
  { column: "Rate", required: false, example: "", description: "Kurs mata uang asing ke mata uang dasar." },
  { column: "FOB Name", required: false, example: "", description: "Free On Board — titik serah tanggung jawab pengiriman." },
  { column: "Shipment Date", required: false, format: DATE_FORMAT, example: "", description: "Tanggal pengiriman." },
  { column: "Shipment Name", required: false, example: "", description: "Nama jasa pengiriman/ekspedisi." },
  { column: "Include Tax", required: false, format: BOOLEAN_FORMAT, example: "", description: "Harga sudah termasuk pajak atau belum." },
  { column: "Taxable", required: false, format: BOOLEAN_FORMAT, example: "", description: "Transaksi ini kena pajak atau tidak." },
  { column: "Item No", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti di Accurate — dibuatkan otomatis kalau belum ada." },
  { column: "Item Name", required: false, example: "", description: "Nama/deskripsi barang — kosongkan untuk pakai nama dari data master barang." },
  { column: "Item Price", required: true, example: "50000", description: "Harga satuan barang." },
  { column: "Qty", required: true, example: "5", description: "Jumlah barang yang dipesan." },
  { column: "Unit Name", required: true, example: "Unit", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Note", required: false, example: "", description: "Catatan untuk baris barang ini." },
  { column: "Sales Quot No", required: false, example: "", description: "Nomor Sales Quotation terkait baris barang ini, kalau ada (referensi saja, tidak divalidasi)." },
  { column: "Item Cash Discount", required: false, example: "", description: "Diskon nominal untuk baris barang ini." },
  { column: "Item Disc Percent", required: false, example: "", description: "Diskon persen untuk baris barang ini." },
  { column: "Item Dept", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Sales List No (separate with comma)", required: false, example: "", description: "Daftar kode tenaga penjual untuk baris ini — BOLEH lebih dari 1, pisahkan dengan koma (contoh: SLS-01,SLS-02)." },
  { column: "PPN", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPN atau tidak." },
  { column: "PPnBM", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPnBM atau tidak." },
  { column: "PPh", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPh atau tidak." },
  { column: "Item CLS1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "Item CLS2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "Item CLS3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "Expense Acc No", required: false, example: "", description: "Kode Akun (COA) beban tambahan level dokumen — WAJIB diisi bersama \"Expense Amount\"." },
  { column: "Expense Name", required: false, example: "", description: "Nama/keterangan beban tambahan." },
  { column: "Expense Amount", required: false, example: "", description: "Nominal beban tambahan — WAJIB diisi bersama \"Expense Acc No\"." },
  { column: "Expense Note", required: false, example: "", description: "Catatan beban tambahan." },
  { column: "Expense Sales Quot No", required: false, example: "", description: "Nomor Sales Quotation terkait baris beban ini, kalau ada." },
  { column: "Expense Dept", required: false, example: "", description: "Nama departemen untuk baris beban ini." },
  { column: "Expense CLS1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris beban ini." },
  { column: "Expense CLS2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "Expense CLS3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
];

// § Fase 124, architecture-sales-return.md — retur terhadap transaksi
// yang sudah ada (Sales Invoice/Delivery Order/tanpa acuan). TIDAK
// auto-create customer/item.
export const salesReturnTemplateGuide: TemplateFieldGuide[] = [
  { column: "Transaction Date", required: true, format: DATE_FORMAT, example: "15/09/2026", description: "Tanggal transaksi Sales Return." },
  { column: "Invoice No", required: false, example: "", description: "Nomor Faktur Penjualan yang diretur — WAJIB diisi kalau \"Return Type\" = INVOICE atau INVOICE_DP." },
  { column: "Retur No", required: false, example: "", description: "Nomor transaksi INTERNAL Accurate — opsional, sekaligus kunci penggabungan baris kalau diisi. Kosongkan untuk auto-number." },
  { column: "Customer No", required: true, example: "C.0001", description: "Nomor/kode customer PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Return Type", required: true, example: "NO_INVOICE", description: "Jenis retur — isi salah satu: DELIVERY (retur ke Delivery Order), INVOICE (retur ke Faktur Penjualan), INVOICE_DP (retur ke Faktur Penjualan Uang Muka), atau NO_INVOICE (retur tanpa acuan dokumen)." },
  { column: "To Address", required: false, example: "", description: "Alamat pengembalian barang." },
  { column: "Transaction Description", required: false, example: "", description: "Keterangan/catatan untuk transaksi ini." },
  { column: "Delivery Order No", required: false, example: "", description: "Nomor Delivery Order yang diretur — WAJIB diisi kalau \"Return Type\" = DELIVERY." },
  { column: "Currency Code", required: false, example: "", description: "Kode mata uang, kosongkan untuk mata uang dasar perusahaan." },
  { column: "Rate", required: false, example: "", description: "Kurs mata uang asing ke mata uang dasar." },
  { column: "Cash Disc", required: false, example: "", description: "Diskon tunai nominal." },
  { column: "Cash Disc Percent", required: false, example: "", description: "Diskon tunai persen." },
  { column: "Return Status Type", required: false, example: "", description: "Status retur keseluruhan dokumen: NOT_RETURNED, PARTIALLY_RETURNED, atau RETURNED." },
  { column: "Payment Term Name", required: false, example: "", description: "Nama syarat pembayaran, harus PERSIS terdaftar di Accurate." },
  { column: "Taxable", required: false, format: BOOLEAN_FORMAT, example: "", description: "Transaksi ini kena pajak atau tidak." },
  { column: "Inclusive Tax", required: false, format: BOOLEAN_FORMAT, example: "", description: "Harga sudah termasuk pajak atau belum." },
  { column: "Tax Date", required: true, format: DATE_FORMAT, example: "15/09/2026", description: "Tanggal Faktur Pajak — WAJIB diisi (retur selalu melibatkan Faktur Pajak)." },
  { column: "Tax Number", required: true, example: "", description: "Nomor Faktur Pajak — WAJIB diisi." },
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Fiscal Rate", required: false, example: "", description: "Kurs pajak (fiskal)." },
  { column: "FOB Name", required: false, example: "", description: "Free On Board — titik serah tanggung jawab pengiriman." },
  { column: "Shipment Name", required: false, example: "", description: "Nama jasa pengiriman/ekspedisi." },
  { column: "Header - CF1", required: false, example: "", description: "Atribut tambahan teks 1 level dokumen (dikonfirmasi resmi Accurate Support)." },
  { column: "Header - CF2", required: false, example: "", description: "Atribut tambahan teks 2, sama catatan di atas." },
  { column: "Header - CF3", required: false, example: "", description: "Atribut tambahan teks 3, sama catatan di atas." },
  { column: "Header - DF1", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 1 level dokumen." },
  { column: "Header - DF2", required: false, format: DATE_FORMAT, example: "", description: "Atribut tambahan tanggal 2, sama catatan di atas." },
  { column: "Item No", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Item Name", required: false, example: "", description: "Nama/deskripsi barang — kosongkan untuk pakai nama dari data master barang." },
  { column: "Item Unit Price", required: true, example: "50000", description: "Harga satuan barang." },
  { column: "Item Qty", required: true, example: "5", description: "Jumlah barang yang diretur." },
  { column: "Item Unit Name", required: true, example: "Unit", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Note", required: false, example: "", description: "Catatan untuk baris barang ini." },
  { column: "Item Return Status Type", required: false, example: "", description: "Status retur untuk baris ini: NOT_RETURNED atau RETURNED — bisa beda dari status dokumen keseluruhan (retur sebagian)." },
  { column: "Item Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Department", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Warehouse", required: false, example: "", description: "Nama gudang tujuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Cash Discount", required: false, example: "", description: "Diskon nominal untuk baris barang ini." },
  { column: "Item Cash Disc Percent", required: false, example: "", description: "Diskon persen untuk baris barang ini." },
  { column: "Item PPN (VAT)", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPN atau tidak." },
  { column: "Item PPNMB", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPnBM atau tidak." },
  { column: "Item PPH", required: false, format: BOOLEAN_FORMAT, example: "", description: "Baris ini kena PPh atau tidak." },
  { column: "Item CLS1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "Item CLS2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "Item CLS3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "Item Serial No", required: false, example: "", description: "Nomor seri barang (tracking barang bernomor seri, mis. elektronik) — WAJIB diisi bersama \"Item Serial Number Qty\" kalau dipakai." },
  { column: "Item Serial Number Qty", required: false, example: "", description: "Jumlah barang untuk nomor seri ini — WAJIB diisi bersama \"Item Serial No\"." },
  { column: "Item Serial Number Exp Date", required: false, format: DATE_FORMAT, example: "", description: "Tanggal kedaluwarsa untuk nomor seri ini, kalau ada." },
  { column: "Expense Account No", required: false, example: "", description: "Kode Akun (COA) beban tambahan level dokumen — WAJIB diisi bersama \"Expense Amount\"." },
  { column: "Expense Name", required: false, example: "", description: "Nama/keterangan beban tambahan." },
  { column: "Expense Amount", required: false, example: "", description: "Nominal beban tambahan — WAJIB diisi bersama \"Expense Account No\"." },
  { column: "Expense Note", required: false, example: "", description: "Catatan beban tambahan." },
  { column: "Expense Department", required: false, example: "", description: "Nama departemen untuk baris beban ini." },
  { column: "Expense Sales Order No", required: false, example: "", description: "Nomor Sales Order terkait baris beban ini, kalau ada." },
  { column: "Expense Sales Quotation No", required: false, example: "", description: "Nomor Sales Quotation terkait baris beban ini, kalau ada." },
  { column: "Expense CLS1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris beban ini." },
  { column: "Expense CLS2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "Expense CLS3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
];

// § Fase 134, architecture-item-transfer.md — Item Transfer = Pindah
// Gudang, panggil `/api/item-transfer/save.do`. TIDAK auto-create item
// (itemNo dikirim apa adanya). "Item Requisition No"/"Note Penting"
// TIDAK PUNYA field API sendiri — digabung ke "Keterangan" (§ mapping).
export const itemTransferTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "17/09/2026", description: "Tanggal transaksi Item Transfer." },
  { column: "No. Item Transfer", required: true, example: "IT-2026-0001", description: "Nomor transaksi — WAJIB DIISI, sekaligus kunci penggabungan baris jadi 1 Item Transfer (isi SAMA di beberapa baris untuk 1 transfer berisi banyak barang)." },
  { column: "Tipe Transfer", required: true, example: "TRANSFER_OUT", description: "WAJIB diisi PERSIS salah satu: TRANSFER_IN atau TRANSFER_OUT." },
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Keterangan", required: false, example: "", description: "Catatan/keterangan untuk transaksi ini." },
  { column: "Difference Item Transfer Acc No", required: false, example: "", description: "Kode Akun (COA) untuk mencatat selisih nilai barang saat pemindahan, kalau ada." },
  { column: "From Item Transfer No", required: false, example: "", description: "Nomor transaksi pemindahan barang ASAL (dipakai untuk alur Terima Barang), kalau ada." },
  { column: "Save As Status", required: false, example: "", description: "APPROVED, DRAFT, NEXTUSER_TOAPPROVED, REJECTED, atau UNAPPROVED — kosongkan untuk status default." },
  { column: "Gudang Asal", required: false, example: "", description: "Nama gudang sumber, harus PERSIS terdaftar di Accurate." },
  { column: "Gudang Tujuan", required: false, example: "", description: "Nama gudang tujuan, harus PERSIS terdaftar di Accurate." },
  { column: "Item No", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Item Name", required: false, example: "", description: "Nama/deskripsi barang — kosongkan untuk pakai nama dari data master barang." },
  { column: "Qty", required: true, example: "10", description: "Jumlah barang yang dipindahkan." },
  { column: "Unit", required: true, example: "PCS", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Notes", required: false, example: "", description: "Catatan tambahan untuk baris barang ini." },
  { column: "Item Dept", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Sales Order No", required: false, example: "", description: "Nomor Sales Order terkait baris ini, kalau ada." },
  { column: "Item Requisition No", required: false, example: "", description: "Nomor referensi Permintaan Barang terkait — TIDAK PUNYA field khusus di Accurate, digabung otomatis ke \"Keterangan\" transaksi." },
  { column: "Item Cls1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "Item Cls2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "Item Cls3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "Serial No", required: false, example: "", description: "Nomor seri barang (tracking barang bernomor seri) — WAJIB diisi bersama \"Serial Qty\" kalau dipakai." },
  { column: "Serial Qty", required: false, example: "", description: "Jumlah barang untuk nomor seri ini — WAJIB diisi bersama \"Serial No\"." },
  { column: "Serial ExpDate", required: false, format: DATE_FORMAT, example: "", description: "Tanggal kedaluwarsa untuk nomor seri ini, kalau ada." },
  { column: "Note Penting", required: false, example: "", description: "Catatan penting internal — TIDAK PUNYA field khusus di Accurate, digabung otomatis ke \"Keterangan\" transaksi." },
];

// § Fase 135, architecture-item-requisition.md — kembaran
// `itemTransferTemplateGuide` di atas (SAMA endpoint API), MINUS kolom
// "Item Requisition No" (sheet ini tidak punya kolom itu).
export const itemRequisitionTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "17/09/2026", description: "Tanggal transaksi Item Requisition." },
  { column: "No. Item Transfer", required: true, example: "IR-2026-0001", description: "Nomor transaksi — WAJIB DIISI, sekaligus kunci penggabungan baris jadi 1 Item Requisition (isi SAMA di beberapa baris untuk 1 permintaan berisi banyak barang)." },
  { column: "Tipe Transfer", required: true, example: "TRANSFER_OUT", description: "WAJIB diisi PERSIS salah satu: TRANSFER_IN atau TRANSFER_OUT." },
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Keterangan", required: false, example: "", description: "Catatan/keterangan untuk transaksi ini." },
  { column: "Difference Item Transfer Acc No", required: false, example: "", description: "Kode Akun (COA) untuk mencatat selisih nilai barang saat pemindahan, kalau ada." },
  { column: "From Item Transfer No", required: false, example: "", description: "Nomor transaksi pemindahan barang ASAL (dipakai untuk alur Terima Barang), kalau ada." },
  { column: "Save As Status", required: false, example: "", description: "APPROVED, DRAFT, NEXTUSER_TOAPPROVED, REJECTED, atau UNAPPROVED — kosongkan untuk status default." },
  { column: "Gudang Asal", required: false, example: "", description: "Nama gudang sumber, harus PERSIS terdaftar di Accurate." },
  { column: "Gudang Tujuan", required: false, example: "", description: "Nama gudang tujuan, harus PERSIS terdaftar di Accurate." },
  { column: "Item No", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Item Name", required: false, example: "", description: "Nama/deskripsi barang — kosongkan untuk pakai nama dari data master barang." },
  { column: "Qty", required: true, example: "10", description: "Jumlah barang yang diminta." },
  { column: "Unit", required: true, example: "PCS", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Item Notes", required: false, example: "", description: "Catatan tambahan untuk baris barang ini." },
  { column: "Item Dept", required: false, example: "", description: "Nama departemen untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Project No", required: false, example: "", description: "Kode proyek untuk baris ini, harus PERSIS terdaftar di Accurate." },
  { column: "Item Sales Order No", required: false, example: "", description: "Nomor Sales Order terkait baris ini, kalau ada." },
  { column: "Item Cls1", required: false, example: "", description: "Kategori Keuangan 1 untuk baris ini, harus PERSIS terdaftar di Accurate — dibuat otomatis kalau belum ada." },
  { column: "Item Cls2", required: false, example: "", description: "Kategori Keuangan 2, sama catatan di atas." },
  { column: "Item Cls3", required: false, example: "", description: "Kategori Keuangan 3, sama catatan di atas." },
  { column: "Serial No", required: false, example: "", description: "Nomor seri barang (tracking barang bernomor seri) — WAJIB diisi bersama \"Serial Qty\" kalau dipakai." },
  { column: "Serial Qty", required: false, example: "", description: "Jumlah barang untuk nomor seri ini — WAJIB diisi bersama \"Serial No\"." },
  { column: "Serial ExpDate", required: false, format: DATE_FORMAT, example: "", description: "Tanggal kedaluwarsa untuk nomor seri ini, kalau ada." },
  { column: "Note Penting", required: false, example: "", description: "Catatan penting internal — TIDAK PUNYA field khusus di Accurate, digabung otomatis ke \"Keterangan\" transaksi." },
];

// § Fase 138, architecture-inventory-adjustment.md. TIDAK auto-create
// item (mirror Item Transfer) — "Item No" WAJIB sudah terdaftar di
// Accurate. "Tipe Adj" nilai literal client BELUM diverifikasi, contoh
// yang ditulis pakai istilah Indonesia dari dictionary
// (`ITEM_ADJUSTMENT_TYPE_DICTIONARY`, § inventory-adjustment.mapping.ts).
export const inventoryAdjustmentTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "17/09/2026", description: "Tanggal transaksi Inventory Adjustment." },
  { column: "No. Item Adjustment", required: false, example: "IA-2026-0001", description: "Nomor transaksi — kunci penggabungan baris jadi 1 Item Adjustment (isi SAMA di beberapa baris untuk 1 penyesuaian berisi banyak barang). Kosongkan untuk penomoran otomatis Accurate." },
  { column: "Adj Account No", required: false, example: "", description: "Kode akun (COA) penyesuaian persediaan — kosongkan untuk pakai default preferensi Accurate." },
  { column: "Keterangan", required: false, example: "", description: "Catatan/keterangan untuk transaksi ini." },
  { column: "Cabang", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "Item No", required: true, example: "BRG-001", description: "Kode barang PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "Qty", required: true, example: "10", description: "Jumlah barang yang disesuaikan." },
  { column: "Unit", required: false, example: "PCS", description: "Satuan barang, harus PERSIS terdaftar di Accurate." },
  { column: "Unit Price", required: false, example: "", description: "Nilai biaya persediaan per satuan — relevan kalau Tipe Adj menambah kuantitas, kosongkan kalau tidak (default 0)." },
  { column: "Gudang", required: false, example: "", description: "Nama gudang tempat barang disesuaikan, harus PERSIS terdaftar di Accurate." },
  { column: "Tipe Adj", required: true, example: "Tambah", description: "WAJIB diisi salah satu: Tambah/Masuk (barang masuk), Kurang/Keluar (barang keluar), atau Stok/Stok Opname/Penyesuaian Stok (penyesuaian langsung ke jumlah stok)." },
  { column: "Note Penting", required: false, example: "", description: "Catatan tambahan untuk baris barang ini." },
  { column: "Serial No", required: false, example: "", description: "Nomor seri barang (tracking barang bernomor seri) — WAJIB diisi bersama \"Serial Qty\" kalau dipakai." },
  { column: "Serial Qty", required: false, example: "", description: "Jumlah barang untuk nomor seri ini — WAJIB diisi bersama \"Serial No\"." },
  { column: "Serial ExpDate", required: false, format: DATE_FORMAT, example: "", description: "Tanggal kedaluwarsa untuk nomor seri ini, kalau ada." },
  { column: "Atribut Tambahan 1", required: false, example: "", description: "Atribut Tambahan karakter 1 (charField1) — field custom Accurate, isi sesuai konfigurasi perusahaan." },
  { column: "Atribut Tambahan 2", required: false, example: "", description: "Atribut Tambahan karakter 2." },
  { column: "Atribut Tambahan 3", required: false, example: "", description: "Atribut Tambahan karakter 3." },
  { column: "Atribut Tambahan 4", required: false, example: "", description: "Atribut Tambahan karakter 4." },
  { column: "Atribut Tambahan 5", required: false, example: "", description: "Atribut Tambahan karakter 5." },
  { column: "Atribut Tambahan 6", required: false, example: "", description: "Atribut Tambahan karakter 6." },
  { column: "Atribut Tambahan 7", required: false, example: "", description: "Atribut Tambahan karakter 7." },
  { column: "Atribut Tambahan 8", required: false, example: "", description: "Atribut Tambahan karakter 8." },
  { column: "Atribut Tambahan 9", required: false, example: "", description: "Atribut Tambahan karakter 9." },
  { column: "Atribut Tambahan 10", required: false, example: "", description: "Atribut Tambahan karakter 10." },
  { column: "Atribut Number 1", required: false, example: "", description: "Atribut Tambahan angka 1 (numericField1)." },
  { column: "Atribut Number 2", required: false, example: "", description: "Atribut Tambahan angka 2." },
  { column: "Atribut Number 3", required: false, example: "", description: "Atribut Tambahan angka 3." },
  { column: "Atribut Number 4", required: false, example: "", description: "Atribut Tambahan angka 4." },
  { column: "Atribut Number 5", required: false, example: "", description: "Atribut Tambahan angka 5." },
  { column: "Atribut Number 6", required: false, example: "", description: "Atribut Tambahan angka 6." },
  { column: "Atribut Number 7", required: false, example: "", description: "Atribut Tambahan angka 7." },
  { column: "Atribut Number 8", required: false, example: "", description: "Atribut Tambahan angka 8." },
  { column: "Atribut Number 9", required: false, example: "", description: "Atribut Tambahan angka 9." },
  { column: "Atribut Number 10", required: false, example: "", description: "Atribut Tambahan angka 10." },
  { column: "Atribut Date 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut Tambahan tanggal 1 (dateField1)." },
  { column: "Atribut Date 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut Tambahan tanggal 2 (dateField2)." },
];

// § Fase 139, architecture-job-costing.md. Modul PERTAMA kategori
// "Manufacture". 2 PANGGILAN API berurutan (job-order/save.do lalu
// material-adjustment/save.do) — TIDAK terlihat dari sisi Excel client
// (1 template, 1 upload), murni detail implementasi backend. TIDAK
// auto-create item (Excel tidak punya kolom "RM Item Name").
export const jobCostingTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "17/09/2026", description: "Tanggal transaksi Job Costing." },
  { column: "No. Job Order", required: false, example: "JO-2026-0001", description: "Nomor transaksi — kunci penggabungan baris jadi 1 Job Order (isi SAMA di beberapa baris untuk 1 pekerjaan berisi banyak bahan baku/biaya). Kosongkan untuk penomoran otomatis Accurate." },
  { column: "Job Account No", required: true, example: "", description: "Kode akun (COA) pekerjaan — DIPAKAI ULANG juga sebagai akun penyesuaian bahan baku (materialAdjustmentAccountNo), § Known Limitations." },
  { column: "Difference Account No", required: false, example: "", description: "Kode akun (COA) selisih biaya pekerjaan." },
  { column: "Keterangan", required: false, example: "", description: "Catatan/keterangan untuk transaksi ini." },
  { column: "Nama Cabang", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "RM_Item No", required: true, example: "BRG-001", description: "Kode bahan baku PERSIS seperti terdaftar di Accurate — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "RM_Qty", required: true, example: "10", description: "Jumlah bahan baku yang dipakai." },
  { column: "RM_Unit", required: false, example: "PCS", description: "Satuan bahan baku, harus PERSIS terdaftar di Accurate." },
  { column: "SN - Qty", required: false, example: "", description: "Jumlah barang untuk nomor seri ini — WAJIB diisi bersama \"Serial No\"." },
  { column: "Serial No", required: false, example: "", description: "Nomor seri bahan baku (tracking barang bernomor seri) — WAJIB diisi bersama \"SN - Qty\" kalau dipakai." },
  { column: "SN - Exp Date", required: false, format: DATE_FORMAT, example: "", description: "Tanggal kedaluwarsa untuk nomor seri ini, kalau ada." },
  { column: "Project No", required: false, example: "", description: "Nomor proyek untuk pencatatan cost/profit center." },
  { column: "Dept Name", required: false, example: "", description: "Nama departemen untuk pencatatan cost/profit center." },
  { column: "Warehouse", required: false, example: "", description: "Nama gudang tempat bahan baku diambil, harus PERSIS terdaftar di Accurate." },
  { column: "RM_CLS1", required: false, example: "", description: "Kategori Keuangan 1 untuk bahan baku ini — dibuat otomatis kalau belum ada." },
  { column: "RM_CLS2", required: false, example: "", description: "Kategori Keuangan 2." },
  { column: "RM_CLS3", required: false, example: "", description: "Kategori Keuangan 3." },
  { column: "Note Penting", required: false, example: "", description: "Catatan tambahan untuk baris bahan baku ini." },
  { column: "Expense No", required: false, example: "", description: "Kode akun (COA) biaya tambahan untuk pekerjaan ini, kalau ada." },
  { column: "Expense Name", required: false, example: "", description: "Nama biaya tambahan." },
  { column: "Expense Amount", required: false, example: "", description: "Nilai biaya tambahan." },
  { column: "Note", required: false, example: "", description: "Catatan untuk baris biaya tambahan ini." },
];

// § Fase 146, architecture-roll-over.md. Penutup Job Costing. `Tipe Penyesuaian` menentukan array yang dipakai per DOKUMEN: Barang → baris jadi
// Finished Good; Akun → baris jadi alokasi biaya ke akun (kolom "Expense ..." perluasan Facport, bukan dari Excel client). TIDAK auto-create item.
export const rollOverTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "17/09/2026", description: "Tanggal transaksi Roll Over." },
  { column: "No Trans", required: false, example: "RO-2026-0001", description: "Nomor transaksi — kunci penggabungan baris jadi 1 Roll Over (isi SAMA di beberapa baris untuk 1 dokumen berisi banyak barang jadi). Kosongkan untuk penomoran otomatis Accurate." },
  { column: "Job Order No", required: true, example: "JO-2026-0001", description: "Nomor Job Order (dari Job Costing) yang diselesaikan — harus SUDAH ADA di Accurate. Satu Roll Over hanya untuk satu Job Order." },
  { column: "Tipe Penyesuaian", required: true, example: "Barang", description: "WAJIB diisi: Barang (biaya jadi barang jadi/Finished Good) atau Akun (biaya dialokasikan ke akun). Semua baris dalam 1 No Trans harus bertipe sama." },
  { column: "Keterangan", required: false, example: "", description: "Catatan/keterangan untuk transaksi ini." },
  { column: "Nama Cabang", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti terdaftar di Accurate — WAJIB DIISI (perusahaan multi-cabang ditolak Accurate kalau kosong)." },
  { column: "FG_Item No", required: false, example: "FG-001", description: "Kode barang jadi PERSIS seperti terdaftar di Accurate (WAJIB kalau Tipe = Barang) — TIDAK dibuatkan otomatis kalau belum ada." },
  { column: "FG_Qty", required: false, example: "10", description: "Jumlah barang jadi (WAJIB kalau Tipe = Barang)." },
  { column: "FG_Unit", required: false, example: "PCS", description: "Satuan barang jadi, harus PERSIS terdaftar di Accurate." },
  { column: "SN - Qty", required: false, example: "", description: "Jumlah barang untuk nomor seri ini — WAJIB diisi bersama \"Serial No\" kalau dipakai." },
  { column: "Serial No", required: false, example: "", description: "Nomor seri barang jadi (tracking barang bernomor seri)." },
  { column: "SN - Exp Date", required: false, format: DATE_FORMAT, example: "", description: "Tanggal kedaluwarsa untuk nomor seri ini, kalau ada." },
  { column: "Project No", required: false, example: "", description: "Nomor proyek (untuk baris Barang)." },
  { column: "Dept Name", required: false, example: "", description: "Nama departemen, harus PERSIS terdaftar di Accurate." },
  { column: "Portion", required: false, example: "100", description: "Persentase alokasi biaya (angka, mis. 100 untuk 100%)." },
  { column: "Warehouse", required: false, example: "", description: "Nama gudang penerima barang jadi, harus PERSIS terdaftar di Accurate." },
  { column: "Expense Acc No", required: false, example: "", description: "Khusus Tipe = Akun: kode akun (COA) tujuan alokasi biaya (WAJIB untuk Tipe Akun)." },
  { column: "Expense Amount", required: false, example: "", description: "Khusus Tipe = Akun: nominal biaya yang dialokasikan (WAJIB untuk Tipe Akun)." },
  { column: "Expense Name", required: false, example: "", description: "Khusus Tipe = Akun: nama biaya." },
  { column: "Expense Note", required: false, example: "", description: "Khusus Tipe = Akun: catatan biaya." },
  ...Array.from({ length: 10 }, (_, i) => ({ column: `Atribut Tambahan ${i + 1}`, required: false, example: "", description: `Atribut Tambahan karakter ${i + 1} (charField${i + 1}) — field custom Accurate, untuk baris Barang.` })),
  ...Array.from({ length: 10 }, (_, i) => ({ column: `Atribut Number ${i + 1}`, required: false, example: "", description: `Atribut Tambahan angka ${i + 1} (numericField${i + 1}), untuk baris Barang.` })),
  { column: "Atribut Date 1", required: false, format: DATE_FORMAT, example: "", description: "Atribut Tambahan tanggal 1 (dateField1), untuk baris Barang." },
  { column: "Atribut Date 2", required: false, format: DATE_FORMAT, example: "", description: "Atribut Tambahan tanggal 2 (dateField2), untuk baris Barang." },
  ...Array.from({ length: 10 }, (_, i) => ({ column: `Financial Category ${i + 1}`, required: false, example: "", description: `Kategori Keuangan ${i + 1} — dibuatkan otomatis di Accurate kalau belum ada.` })),
];

// § Fase 147 — Work Order. Header kolom mengikuti PERSIS sheet client (nama berulang antar-section SENGAJA dipertahankan: "Project No" x3,
// "Process Category Name" x3, "CLS1-3" x3 — `parseExcelBuffer` mendedupe saat upload, § work-order.mapping.ts). Keterangan menyebut section.
// 1 baris = header dokumen + maks. 1 entri per section; dokumen berisi banyak entri = banyak baris dengan Trans No SAMA (header cukup di baris pertama).
const WO_DOC = "[Header dokumen] ";
const WO_MAT = "[Bahan Baku] ";
const WO_EXP = "[Biaya Produksi] ";
const WO_PROC = "[Proses] ";
const WO_FG = "[Produk Sampingan] ";
const WO_FIRST_ROW = " Cukup diisi di baris PERTAMA dokumen.";

export const workOrderTemplateGuide: TemplateFieldGuide[] = [
  { column: "Transaction Date", required: true, format: DATE_FORMAT, example: "17/09/2026", description: `${WO_DOC}Tanggal Work Order.${WO_FIRST_ROW}` },
  { column: "Trans No", required: false, example: "WO-2026-0001", description: `${WO_DOC}Nomor transaksi — kunci penggabungan baris jadi 1 Work Order (isi SAMA di semua baris dokumen yang sama). Kosongkan untuk penomoran otomatis Accurate (1 baris = 1 Work Order).` },
  { column: "Work Acc No", required: true, example: "1-1500", description: `${WO_DOC}Nomor akun barang dalam proses (Work in Process) PERSIS seperti di Accurate.${WO_FIRST_ROW}` },
  { column: "Work Order Type", required: true, example: "Nomor Formula", description: `${WO_DOC}Sumber referensi: Kode Produk, Nomor Formula, atau Nomor Rencana Produksi.${WO_FIRST_ROW}` },
  { column: "Bill Material no", required: true, example: "BOM-001", description: `${WO_DOC}Nomor formula produksi (Bill of Material) yang sudah ada di Accurate.${WO_FIRST_ROW}` },
  { column: "Save As Status Type", required: false, example: "", description: "TIDAK diproses (fitur persetujuan otomatis ditunda) — boleh dikosongkan." },
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: `${WO_DOC}Nama cabang PERSIS seperti di Accurate — harus sudah ada (tidak dibuatkan otomatis).${WO_FIRST_ROW}` },
  { column: "Description", required: false, example: "Produksi batch September", description: `${WO_DOC}Keterangan Work Order.` },
  { column: "Product: Item No", required: true, example: "FG-001", description: `${WO_DOC}Kode produk utama yang dihasilkan, PERSIS seperti di Accurate (tidak dibuatkan otomatis).${WO_FIRST_ROW}` },
  { column: "Product: Qty", required: true, example: "100", description: `${WO_DOC}Jumlah produk utama.${WO_FIRST_ROW}` },
  { column: "Product: Unit Name", required: false, example: "PCS", description: `${WO_DOC}Satuan produk utama, harus PERSIS terdaftar di Accurate.` },
  { column: "Second Quality Product No", required: false, example: "", description: `${WO_DOC}Kode produk kualitas kedua (afkir), kalau ada.` },
  { column: "Variance Acc No", required: true, example: "5-9000", description: `${WO_DOC}Nomor akun selisih produksi PERSIS seperti di Accurate.${WO_FIRST_ROW}` },
  { column: "Manual Closed", required: false, format: BOOLEAN_FORMAT, example: "", description: `${WO_DOC}Isi TRUE (atau Y) untuk menutup Work Order secara manual.` },
  { column: "Manual Final Date", required: false, format: DATE_FORMAT, example: "", description: `${WO_DOC}Tanggal penutupan manual, kalau Manual Closed diisi.` },
  { column: "PIC ID", required: false, example: "Budi", description: `${WO_DOC}Nama penanggung jawab (Person In Charge) — dibuatkan otomatis di Accurate kalau belum ada. Angka murni dianggap ID PIC yang sudah ada.${WO_FIRST_ROW}` },
  { column: "Start Date", required: true, format: DATE_FORMAT, example: "18/09/2026", description: `${WO_DOC}Tanggal mulai produksi.${WO_FIRST_ROW}` },
  { column: "End Date", required: true, format: DATE_FORMAT, example: "25/09/2026", description: `${WO_DOC}Tanggal selesai produksi.${WO_FIRST_ROW}` },
  { column: "Item No", required: false, example: "RM-001", description: `${WO_MAT}Kode bahan baku PERSIS seperti di Accurate (WAJIB bila baris ini berisi bahan baku, bersama Qty).` },
  { column: "Item Name", required: false, example: "Tepung", description: `${WO_MAT}Nama/keterangan bahan baku pada baris ini.` },
  { column: "Qty", required: false, example: "50", description: `${WO_MAT}Jumlah bahan baku (WAJIB bila Item No diisi).` },
  { column: "Unit Name", required: false, example: "KG", description: `${WO_MAT}Satuan bahan baku, harus PERSIS terdaftar di Accurate.` },
  { column: "Item Notes", required: false, example: "", description: `${WO_MAT}Catatan bahan baku.` },
  { column: "Process Category Name", required: false, example: "Pencampuran", description: `${WO_MAT}Kategori proses tempat bahan baku dipakai.` },
  { column: "Standard Cost", required: false, example: "", description: `${WO_MAT}Biaya standar per satuan.` },
  { column: "Standard Cost Date", required: false, format: DATE_FORMAT, example: "", description: `${WO_MAT}Tanggal biaya standar.` },
  { column: "Total Standard Cost", required: false, example: "", description: `${WO_MAT}Total biaya standar.` },
  { column: "Project No", required: false, example: "", description: `${WO_MAT}Nomor proyek (harus sudah ada di Accurate).` },
  { column: "Department Name", required: false, example: "", description: `${WO_MAT}Nama departemen (harus sudah ada di Accurate).` },
  { column: "CLS1", required: false, example: "", description: `${WO_MAT}Kategori Keuangan slot 1 — dibuatkan otomatis di Accurate kalau belum ada.` },
  { column: "CLS2", required: false, example: "", description: `${WO_MAT}Kategori Keuangan slot 2.` },
  { column: "CLS3", required: false, example: "", description: `${WO_MAT}Kategori Keuangan slot 3.` },
  { column: "Expense No", required: false, example: "JS-001", description: `${WO_EXP}Kode ITEM/jasa biaya produksi (BUKAN nomor akun) PERSIS seperti di Accurate (WAJIB bila baris ini berisi biaya produksi, bersama Expense Qty).` },
  { column: "Expense Name", required: false, example: "Jasa giling", description: `${WO_EXP}Nama/keterangan biaya produksi.` },
  { column: "Expense Qty", required: false, example: "1", description: `${WO_EXP}Jumlah (WAJIB bila Expense No diisi).` },
  { column: "Expense Unit Name", required: false, example: "JAM", description: `${WO_EXP}Satuan.` },
  { column: "Expense Notes", required: false, example: "", description: `${WO_EXP}Catatan.` },
  { column: "Process Category Name", required: false, example: "", description: `${WO_EXP}Kategori proses biaya produksi.` },
  { column: "Standard Cost", required: false, example: "", description: `${WO_EXP}Biaya standar per satuan.` },
  { column: "Standard Cost Date", required: false, format: DATE_FORMAT, example: "", description: `${WO_EXP}Tanggal biaya standar.` },
  { column: "Total Standard Cost", required: false, example: "", description: `${WO_EXP}Total biaya standar.` },
  { column: "Project No", required: false, example: "", description: `${WO_EXP}Nomor proyek.` },
  { column: "Department Name", required: false, example: "", description: `${WO_EXP}Nama departemen.` },
  { column: "CLS1", required: false, example: "", description: `${WO_EXP}Kategori Keuangan slot 1.` },
  { column: "CLS2", required: false, example: "", description: `${WO_EXP}Kategori Keuangan slot 2.` },
  { column: "CLS3", required: false, example: "", description: `${WO_EXP}Kategori Keuangan slot 3.` },
  { column: "Process Category Name", required: false, example: "Pencampuran", description: `${WO_PROC}Nama tahapan proses produksi.` },
  { column: "Sort No", required: false, example: "1", description: `${WO_PROC}Nomor urut tahapan.` },
  { column: "Instruction", required: false, example: "Campur 15 menit", description: `${WO_PROC}Instruksi kerja tahapan.` },
  { column: "subCon", required: false, format: BOOLEAN_FORMAT, example: "", description: `${WO_PROC}TRUE (atau Y) bila tahapan dikerjakan subkontraktor.` },
  { column: "Extra FG: Item No", required: false, example: "FG-002", description: `${WO_FG}Kode produk sampingan PERSIS seperti di Accurate (WAJIB bila baris ini berisi produk sampingan, bersama Qty dan Portion).` },
  { column: "Extra FG: Item Name", required: false, example: "", description: `${WO_FG}Nama/keterangan produk sampingan.` },
  { column: "Extra FG: Qty", required: false, example: "5", description: `${WO_FG}Jumlah (WAJIB bila Extra FG: Item No diisi).` },
  { column: "Extra FG: Unit Name", required: false, example: "PCS", description: `${WO_FG}Satuan.` },
  { column: "Extra FG: Notes", required: false, example: "", description: `${WO_FG}Catatan.` },
  { column: "Extra FG: Portion", required: false, example: "10", description: `${WO_FG}Porsi alokasi biaya dalam persen (WAJIB bila Extra FG: Item No diisi).` },
  { column: "Project No", required: false, example: "", description: `${WO_FG}Nomor proyek.` },
  { column: "Department", required: false, example: "", description: `${WO_FG}Nama departemen.` },
  { column: "CLS1", required: false, example: "", description: `${WO_FG}Kategori Keuangan slot 1.` },
  { column: "CLS2", required: false, example: "", description: `${WO_FG}Kategori Keuangan slot 2.` },
  { column: "CLS3", required: false, example: "", description: `${WO_FG}Kategori Keuangan slot 3.` },
];

// § Fase 148 — Material Slip. "Qty" muncul 2x (barang & serial) — parser dedupe kemunculan ke-2 jadi "Qty_1" (Fase 147).
export const materialSlipTemplateGuide: TemplateFieldGuide[] = [
  { column: "Branch Name", required: false, example: "Jakarta", description: "Nama cabang — opsional, TIDAK di-lookup ID (beda dari Work Order/Finished Good Slip)." },
  { column: "Trans Date", required: true, format: DATE_FORMAT, example: "02/02/2026", description: "Tanggal Material Slip." },
  { column: "Trans No", required: false, example: "MS-2026-0001", description: "Nomor transaksi — kunci penggabungan baris jadi 1 dokumen (isi SAMA di semua baris dokumen yang sama, termasuk baris lanjutan nomor seri). Kosongkan untuk penomoran otomatis." },
  { column: "Material Slip Type", required: true, example: "ITEM_PICK", description: "WAJIB diisi: Pengambilan (ITEM_PICK) atau Pengembalian (ITEM_RETURN) bahan baku. Cukup diisi di baris pertama dokumen." },
  { column: "Work Order No", required: true, example: "WO-001", description: "Nomor Work Order (dari modul Work Order) yang diambil bahan bakunya — harus SUDAH ADA di Accurate. Cukup diisi di baris pertama dokumen." },
  { column: "Description", required: false, example: "", description: "Catatan/keterangan untuk transaksi ini." },
  { column: "Item No", required: true, example: "10001", description: "Kode bahan baku PERSIS seperti di Accurate — TIDAK dibuatkan otomatis kalau belum ada. WAJIB kecuali baris ini hanya lanjutan nomor seri barang di atasnya (baris kosong pada kolom Qty)." },
  { column: "Item Name", required: false, example: "", description: "Nama/keterangan bahan baku." },
  { column: "Qty", required: false, example: "10", description: "Jumlah bahan baku. Kosongkan pada baris lanjutan nomor seri (lihat Serial No)." },
  { column: "Unit Name", required: false, example: "PCS", description: "Satuan bahan baku, harus PERSIS terdaftar di Accurate." },
  { column: "Item Note", required: false, example: "", description: "Catatan bahan baku." },
  { column: "Project No", required: false, example: "", description: "Nomor proyek (harus sudah ada di Accurate)." },
  { column: "Dept Name", required: false, example: "", description: "Nama departemen (harus sudah ada di Accurate)." },
  { column: "Warehouse Name", required: false, example: "GD. JAKARTA", description: "Nama gudang — opsional, TIDAK di-lookup ID." },
  { column: "CLS1", required: false, example: "", description: "Kategori Keuangan slot 1 — dibuatkan otomatis kalau belum ada." },
  { column: "CLS2", required: false, example: "", description: "Kategori Keuangan slot 2." },
  { column: "CLS3", required: false, example: "", description: "Kategori Keuangan slot 3." },
  { column: "CLS4", required: false, example: "", description: "Kategori Keuangan slot 4." },
  { column: "CLS5", required: false, example: "", description: "Kategori Keuangan slot 5." },
  { column: "Serial No", required: false, example: "XX1", description: "Nomor seri bahan baku. Boleh diisi di baris item ITU SENDIRI, atau di baris TAMBAHAN sesudahnya (Trans No & Item No sama, kolom Qty barang dikosongkan) kalau 1 barang punya banyak nomor seri." },
  { column: "Qty_1", required: false, example: "10", description: "Jumlah barang untuk nomor seri ini (kolom \"Qty\" kedua)." },
  { column: "Expired Date", required: false, format: DATE_FORMAT, example: "", description: "Tanggal kedaluwarsa untuk nomor seri ini, kalau ada." },
];

// § Fase 149 — Finished Good Slip. "Qty" muncul 2x (barang & serial) — parser dedupe kemunculan ke-2 jadi "Qty_1" (Fase 147).
export const finishedGoodSlipTemplateGuide: TemplateFieldGuide[] = [
  { column: "Branch Name", required: true, example: "Kantor Pusat", description: "Nama cabang PERSIS seperti di Accurate — WAJIB DIISI (di-lookup ID, harus sudah ada)." },
  { column: "Trans Date", required: true, format: DATE_FORMAT, example: "03/11/2025", description: "Tanggal Finished Good Slip." },
  { column: "Trans No", required: false, example: "FGS-2026-0001", description: "Nomor transaksi — kunci penggabungan baris jadi 1 dokumen (isi SAMA di semua baris dokumen yang sama, termasuk baris lanjutan nomor seri). Kosongkan untuk penomoran otomatis." },
  { column: "Work Order No", required: true, example: "6682", description: "Nomor Work Order (dari modul Work Order) yang diselesaikan — harus SUDAH ADA di Accurate. Cukup diisi di baris pertama dokumen." },
  { column: "Description", required: false, example: "Production Result", description: "Catatan/keterangan untuk transaksi ini." },
  { column: "Item No", required: true, example: "3300500719", description: "Kode barang jadi PERSIS seperti di Accurate — TIDAK dibuatkan otomatis kalau belum ada. WAJIB kecuali baris ini hanya lanjutan nomor seri barang di atasnya." },
  { column: "Item Name", required: false, example: "", description: "Nama/keterangan barang jadi." },
  { column: "Qty", required: true, example: "101", description: "Jumlah barang jadi yang diselesaikan. WAJIB diisi bersama Item No dan Portion." },
  { column: "Portion", required: true, example: "100", description: "Porsi penyelesaian dalam persen (0-100) dari total perintah kerja. WAJIB diisi bersama Item No dan Qty." },
  { column: "Unit Name", required: false, example: "CTN", description: "Satuan barang jadi, harus PERSIS terdaftar di Accurate." },
  { column: "Item Note", required: false, example: "", description: "Catatan barang jadi." },
  { column: "Project No", required: false, example: "", description: "Nomor proyek (harus sudah ada di Accurate)." },
  { column: "Dept Name", required: false, example: "", description: "Nama departemen (harus sudah ada di Accurate)." },
  { column: "Warehouse Name", required: true, example: "WH FG", description: "Nama gudang PERSIS seperti di Accurate — WAJIB DIISI (di-lookup ID, harus sudah ada)." },
  { column: "CLS1", required: false, example: "", description: "Kategori Keuangan slot 1 — dibuatkan otomatis kalau belum ada." },
  { column: "CLS2", required: false, example: "", description: "Kategori Keuangan slot 2." },
  { column: "CLS3", required: false, example: "", description: "Kategori Keuangan slot 3." },
  { column: "CLS4", required: false, example: "", description: "Kategori Keuangan slot 4." },
  { column: "CLS5", required: false, example: "", description: "Kategori Keuangan slot 5." },
  { column: "Serial No", required: false, example: "28/10/2025", description: "Nomor seri barang jadi (client biasa memakai tanggal produksi sebagai kode lot). Boleh diisi di baris item ITU SENDIRI, atau di baris TAMBAHAN sesudahnya (Trans No & Item No sama, kolom Qty/Portion dikosongkan) kalau 1 barang punya banyak nomor seri." },
  { column: "Qty_1", required: false, example: "15", description: "Jumlah barang untuk nomor seri ini (kolom \"Qty\" kedua)." },
  { column: "Expired Date", required: false, format: DATE_FORMAT, example: "", description: "Tanggal kedaluwarsa untuk nomor seri ini, kalau ada." },
];
