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

// § Fase 13 — mirror `purchaseInvoiceTemplateGuide`, "PO Number" pengganti
// peran "Bill No" (pengelompokan multi-item), "Customer" pengganti "Vendor".
export const salesInvoiceTemplateGuide: TemplateFieldGuide[] = [
  { column: "Tanggal", required: true, format: DATE_FORMAT, example: "19/08/2026", description: "Tanggal transaksi Faktur Penjualan." },
  { column: "PO Number", required: false, example: "PO-CUST-001", description: "Nomor PO referensi dari customer. Isi SAMA di beberapa baris untuk menggabungkannya jadi 1 faktur multi-item — dipakai HANYA kalau kolom Trans No di bawah tidak diisi." },
  { column: "Customer No", required: true, example: "C-0001", description: "Nomor/kode customer PERSIS seperti terdaftar di Accurate Online." },
  { column: "Trans No", required: false, example: "", description: "Nomor transaksi Accurate — kosongkan supaya nomor otomatis, ATAU isi SAMA di beberapa baris untuk menggabungkannya jadi 1 faktur multi-item (kalau diisi, LEBIH DIUTAMAKAN dari PO Number untuk penggabungan)." },
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
  { column: "Item Unit Name", required: true, example: "PCS", description: "Satuan barang PERSIS seperti di Accurate (mis. PCS, KG, BOX)." },
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
  { column: "Nama Customer", required: false, example: "PT Pembeli Jaya", description: "Nama customer — WAJIB diisi HANYA kalau Customer No di atas BELUM terdaftar di Accurate (dipakai untuk bikin customer baru otomatis)." },
  { column: "Kategori Customer", required: false, example: "Umum", description: "Kategori customer baru — kosongkan untuk pakai default \"Umum\"." },
  { column: "Telepon Bisnis", required: false, example: "0211234567", description: "Nomor telepon kantor customer baru." },
  { column: "Handphone", required: false, example: "081234567890", description: "Nomor HP customer baru." },
  { column: "Email Customer", required: false, example: "customer@contoh.com", description: "Alamat email customer baru." },
  { column: "Alamat Customer", required: false, example: "Jl. Contoh No. 1, Jakarta", description: "Alamat customer baru." },
  { column: "Negara Customer", required: false, example: "Indonesia", description: "Negara customer baru." },
  { column: "Akun Piutang", required: false, example: "1-10500", description: "Kode Akun Piutang (COA) — kalau diisi, akan meng-update akun piutang customer (berlaku untuk customer baru MAUPUN yang sudah ada)." },
  { column: "Kategori Barang", required: false, example: "Umum", description: "Kategori barang baru — dipakai HANYA kalau Item No belum terdaftar di Accurate, kosongkan untuk pakai default \"Umum\"." },
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
