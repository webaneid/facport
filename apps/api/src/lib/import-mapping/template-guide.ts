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

export const purchaseInvoiceTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "19/08/2026", description: "Tanggal transaksi Faktur Pembelian." },
  { column: "Bill No", required: false, example: "INV-VENDOR-001", description: "Nomor referensi tagihan dari vendor (beda dari nomor transaksi Accurate). PENTING: isi SAMA di beberapa baris untuk menggabungkannya jadi 1 faktur dengan banyak barang (multi-item) — baris dengan Bill No kosong tetap dianggap 1 faktur sendiri." },
  { column: "Vendor No", required: true, example: "V-0001", description: "Nomor/kode vendor PERSIS seperti terdaftar di Accurate Online." },
  { column: "Trans No", required: false, example: "", description: "Nomor transaksi Accurate — kosongkan supaya nomor otomatis (disarankan)." },
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
  // `fieldToAccuratePath`), murni rename judul kolom Excel. Sinonim
  // lama "PO Number"/"PURCHASE ORDER NO" TETAP didukung di
  // `defaultColumnMap`.
  { column: "Bill No", required: false, example: "PO-CUST-001", description: "Nomor PO/referensi dari customer (field API poNumber). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 faktur multi-item — dipakai HANYA kalau kolom Trans No di bawah tidak diisi." },
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
  { column: "Akun Beban", required: false, example: "6-10100", description: "Kode Akun Perkiraan (COA) untuk baris Beban ini — WAJIB diisi bersama \"Jumlah Beban\" supaya baris ini dianggap punya data Beban." },
  { column: "Nama Beban", required: false, example: "Ongkos Kirim", description: "Nama/keterangan Beban." },
  { column: "Jumlah Beban", required: false, example: "50000", description: "Nominal Beban. Angka polos, TANPA titik/koma pemisah ribuan — WAJIB diisi bersama \"Akun Beban\"." },
  { column: "Catatan Beban", required: false, example: "", description: "Catatan tambahan untuk Beban ini." },
  { column: "Beban - Department", required: false, example: "", description: "Nama departemen untuk Beban ini (kalau akun Accurate pakai tracking departemen)." },
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
export const purchasePaymentTemplateGuide: TemplateFieldGuide[] = [
  { column: "Date", required: true, format: DATE_FORMAT, example: "05/09/2026", description: "Tanggal transaksi pembayaran (header alternatif: \"Tanggal\")." },
  { column: "Purchase Payment No", required: false, example: "PP-2026-0001", description: "Nomor pembayaran (opsional). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 pembayaran yang bayar BANYAK faktur sekaligus — baris dengan kolom ini kosong tetap dianggap 1 pembayaran sendiri." },
  { column: "No. Supplier", required: true, example: "V-0001", description: "Nomor/kode vendor PERSIS seperti terdaftar di Accurate Online — WAJIB SUDAH ADA (header alternatif: \"No Pemasok\", \"Nomor Vendor\")." },
  { column: "Invoice No", required: true, example: "PI-2026-001", description: "Nomor Faktur Pembelian yang dibayar, PERSIS seperti di Accurate — WAJIB SUDAH ADA. Isi faktur BEDA di tiap baris kalau 1 pembayaran (Purchase Payment No sama) bayar banyak faktur sekaligus (header alternatif: \"No Faktur\", \"Nomor Faktur\")." },
  { column: "No. Bank Account", required: true, example: "1-10200", description: "Kode Akun (COA) bank/kas yang dipakai bayar, BUKAN nama bank literal (header alternatif: \"Akun Bank/Kas\", \"Kode Akun Bank\")." },
  { column: "Payment", required: true, example: "5000000", description: "Nominal pembayaran UNTUK FAKTUR DI BARIS INI (bukan total keseluruhan kalau 1 pembayaran bayar banyak faktur — Facport yang jumlahkan otomatis). BUKAN kolom \"Cheque Amount\" (itu cuma dipakai kalau metode bayar cek fisik). Isi PENUH sesuai sisa tagihan untuk pelunasan, atau LEBIH KECIL untuk pembayaran sebagian. Angka polos, TANPA titik/koma pemisah ribuan (header alternatif: \"Jumlah Bayar\")." },
];

// § architecture-sales-receipt.md — bayangan cermin PERSIS Purchase
// Payment di atas (Customer ganti peran Vendor, Faktur Penjualan ganti
// Faktur Pembelian). Customer DAN faktur WAJIB SUDAH ADA di Accurate
// (TIDAK auto-create).
export const salesReceiptTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "05/09/2026", description: "Tanggal transaksi penerimaan." },
  { column: "No. Sales Receipt", required: false, example: "11010101.2026.01.00001", description: "Nomor struk penerimaan (opsional). Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 penerimaan yang bayar BANYAK faktur sekaligus — baris dengan kolom ini kosong tetap dianggap 1 penerimaan sendiri (header alternatif: \"Nomor Penerimaan\", \"No Penerimaan\")." },
  { column: "No Pelanggan", required: true, example: "C-0001", description: "Nomor/kode customer PERSIS seperti terdaftar di Accurate Online — WAJIB SUDAH ADA (header alternatif: \"Nomor Customer\", \"Customer No\")." },
  { column: "No Faktur", required: true, example: "SI-2026-001", description: "Nomor Faktur Penjualan yang dibayar, PERSIS seperti di Accurate — WAJIB SUDAH ADA. Isi faktur BEDA di tiap baris kalau 1 penerimaan (No. Sales Receipt sama) bayar banyak faktur sekaligus (header alternatif: \"Nomor Faktur\")." },
  { column: "Akun Bank/Kas", required: true, example: "1-10200", description: "Kode Akun (COA) bank/kas yang dipakai terima pembayaran, BUKAN nama bank literal (header alternatif: \"Kode Akun Bank\")." },
  { column: "Jumlah Bayar", required: true, example: "5000000", description: "Nominal penerimaan UNTUK FAKTUR DI BARIS INI (bukan total keseluruhan kalau 1 penerimaan bayar banyak faktur — Facport yang jumlahkan otomatis). Isi PENUH sesuai sisa piutang faktur untuk pelunasan, atau LEBIH KECIL untuk penerimaan sebagian. Angka polos, TANPA titik/koma pemisah ribuan." },
];

// § architecture-journal-voucher.md — DUA FORMAT didukung (§ Fase 50),
// PILIH SALAH SATU, jangan campur kolom dari dua-duanya di 1 file:
//
// FORMAT LEBAR (Opsi A, cocok jurnal SEDERHANA 2 akun) — kolom
// "Tanggal"/"Akun Debit"/"Nominal Debit"/"Akun Kredit"/"Nominal
// Kredit"/"Keterangan" di bawah. 1 baris Excel = 1 jurnal LENGKAP.
//
// FORMAT PANJANG (Opsi B, ala kompetitor — cocok jurnal N-akun,
// client sudah familiar dengan istilah ini) — kolom "Transaction
// Number"/"JV No"/"JV Amount"/"JV Amount Type"/"Trans Date"/"Trans
// Description" di bawah. 1 baris Excel = 1 akun; baris dengan
// "Transaction Number" SAMA digabung jadi 1 jurnal (bisa N akun).
//
// Akun COA WAJIB SUDAH ADA di Accurate (TIDAK auto-create), untuk
// KEDUA format. Total DEBIT WAJIB SAMA PERSIS dengan total CREDIT
// dalam 1 jurnal (aturan double-entry), divalidasi Facport SEBELUM
// kirim ke Accurate — untuk format panjang, ini SUM semua baris
// bertipe DEBIT vs SUM semua baris bertipe CREDIT dalam 1 grup.
export const journalVoucherTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: false, format: DATE_FORMAT, example: "05/09/2026", description: "[FORMAT LEBAR] Tanggal transaksi jurnal (header alternatif format panjang: \"Trans Date\")." },
  { column: "Akun Debit", required: false, example: "6-20500", description: "[FORMAT LEBAR] Kode Akun (COA) yang di-debit, PERSIS seperti terdaftar di Accurate Online — WAJIB SUDAH ADA." },
  { column: "Nominal Debit", required: false, example: "500000", description: "[FORMAT LEBAR] Nominal debit. WAJIB SAMA PERSIS dengan Nominal Kredit — Facport menolak baris kalau tidak seimbang. Angka polos, TANPA titik/koma pemisah ribuan." },
  { column: "Akun Kredit", required: false, example: "1-10200", description: "[FORMAT LEBAR] Kode Akun (COA) yang di-kredit, PERSIS seperti terdaftar di Accurate Online — WAJIB SUDAH ADA." },
  { column: "Nominal Kredit", required: false, example: "500000", description: "[FORMAT LEBAR] Nominal kredit. WAJIB SAMA PERSIS dengan Nominal Debit. Angka polos, TANPA titik/koma pemisah ribuan." },
  { column: "Keterangan", required: false, example: "Penyesuaian beban dibayar dimuka", description: "[FORMAT LEBAR] Catatan/keterangan bebas untuk transaksi jurnal ini (header alternatif format panjang: \"Trans Description\")." },
  { column: "Transaction Number", required: false, example: "JV.2026.01.00001", description: "[FORMAT PANJANG] Nomor transaksi jurnal — isi SAMA di beberapa baris untuk menggabungkannya jadi 1 jurnal dengan BANYAK akun (N akun, tidak terbatas 2)." },
  { column: "JV No", required: false, example: "6-20500", description: "[FORMAT PANJANG] Kode Akun (COA) untuk BARIS INI — nama kolom \"JV No\" ikut istilah kompetitor, isinya KODE AKUN (bukan nomor jurnal — itu di kolom Transaction Number)." },
  { column: "JV Amount", required: false, example: "500000", description: "[FORMAT PANJANG] Nominal untuk baris/akun ini. Total semua baris DEBIT dalam 1 Transaction Number WAJIB SAMA PERSIS dengan total semua baris CREDIT." },
  { column: "JV Amount Type", required: false, example: "DEBIT", description: "[FORMAT PANJANG] Tipe baris — isi \"DEBIT\" atau \"CREDIT\" (boleh singkatan \"D\"/\"K\")." },
];
