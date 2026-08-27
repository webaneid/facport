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
  { column: "Bill No", required: false, example: "INV-VENDOR-001", description: "Nomor referensi tagihan dari vendor (beda dari nomor transaksi Accurate)." },
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

export const vendorPayableAccountTemplateGuide: TemplateFieldGuide[] = [
  { column: "Nomor Vendor", required: true, example: "V-0001", description: "Nomor/kode vendor PERSIS seperti terdaftar di Accurate Online (header alternatif yang juga diterima: \"Vendor No\")." },
  { column: "Akun Hutang", required: true, example: "2-10100", description: "Kode Akun Hutang (COA) yang mau di-assign ke vendor ini (header alternatif yang juga diterima: \"Kode Akun Hutang\")." },
];
