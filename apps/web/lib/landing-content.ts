import { FileSpreadsheet, Landmark, Wallet, HandCoins, BookOpenCheck, Banknote, ShoppingCart, PackageCheck, Undo2, FileSignature, RotateCcw, Coins, ArrowLeftRight, ClipboardList, ClipboardCheck, Boxes, Factory, CheckCheck, Cog, PackageOpen, PackageSearch, type LucideIcon } from "lucide-react";
import type { ModuleKey } from "./module-options";

// § Fase 47 — icon per modul di kartu Fitur landing page. REUSE PERSIS
// mapping `components/app-shell/sidebar.tsx` (nav Import Data) supaya
// identitas visual modul konsisten lintas surface. WAJIB tambah entri
// baru di sini kalau ada sub-modul baru (pola sama `MODULE_IMPORT_BASE_PATH`).
export const LANDING_MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  purchase_invoice: FileSpreadsheet,
  sales_invoice: FileSpreadsheet,
  vendor_payable_account: Landmark,
  purchase_payment: Wallet,
  sales_receipt: HandCoins,
  journal_voucher: BookOpenCheck,
  other_payment: Banknote,
  other_deposit: Coins,
  purchase_order: ShoppingCart,
  receive_item: PackageCheck,
  purchase_return: Undo2,
  sales_quotation: FileSignature,
  sales_order: ClipboardCheck,
  sales_return: RotateCcw,
  // § Fase 134-135 — kategori "Inventory" pertama.
  item_transfer: ArrowLeftRight,
  item_requisition: ClipboardList,
  // § Fase 138.
  inventory_adjustment: Boxes,
  // § Fase 139 — kategori "Manufacture" pertama.
  job_costing: Factory,
  // § Fase 146 — penutup Job Costing.
  roll_over: CheckCheck,
  // § Fase 147 — produksi berbasis BOM.
  work_order: Cog,
  // § Fase 148 — realisasi bahan baku dari Work Order.
  material_slip: PackageOpen,
  // § Fase 149 — realisasi barang jadi dari Work Order.
  finished_good_slip: PackageSearch,
};

// § 1 baris tagline singkat per modul — konten MARKETING murni (bukan
// data dari admin), sengaja statis (§ phase-47 doc, "static kecuali
// fitur & tombol berlangganan" — teksnya statis, yang dinamis cuma
// MODUL MANA yang tampil, sesuai paket aktif admin).
export const LANDING_MODULE_TAGLINE: Record<ModuleKey, string> = {
  purchase_invoice: "Import faktur pembelian dari Excel, otomatis buat Pemasok & Barang baru kalau belum ada.",
  sales_invoice: "Import faktur penjualan ke Accurate, hitung pajak & diskon otomatis sesuai data Excel kamu.",
  vendor_payable_account: "Kelola akun hutang pemasok lintas banyak vendor sekaligus, tanpa input satu-satu.",
  purchase_payment: "Catat pembayaran pembelian ke Accurate langsung dari Excel, cocokkan ke faktur terkait.",
  sales_receipt: "Catat penerimaan pembayaran penjualan dari Excel, langsung ter-link ke faktur customer.",
  journal_voucher: "Import jurnal umum multi-baris, validasi debit-kredit seimbang sebelum masuk ke Accurate.",
  other_payment: "Catat pengeluaran kas/bank untuk beban langsung (listrik, gaji, dll) dari Excel, tanpa faktur atau vendor.",
  other_deposit: "Catat penerimaan kas/bank di luar penjualan (setoran modal, pendapatan lain-lain, dll) dari Excel, tanpa faktur atau customer.",
  purchase_order: "Import pesanan pembelian ke Accurate dari Excel, otomatis buat Pemasok & Barang baru kalau belum ada.",
  receive_item: "Catat penerimaan barang dari vendor ke Accurate dari Excel, langsung ter-link ke pesanan pembelian terkait.",
  purchase_return: "Catat retur barang ke vendor dari Excel, terhubung otomatis ke faktur pembelian atau penerimaan barang terkait.",
  sales_quotation: "Import penawaran harga ke Accurate dari Excel, otomatis buat Customer & Barang baru kalau belum ada.",
  sales_order: "Import pesanan penjualan ke Accurate dari Excel, kelanjutan penawaran harga, otomatis buat Customer & Barang baru kalau belum ada.",
  sales_return: "Catat retur barang dari customer ke Accurate dari Excel, terhubung otomatis ke faktur penjualan terkait.",
  item_transfer: "Pindahkan barang antar gudang ke Accurate dari Excel, lengkap dengan nomor seri dan Kategori Keuangan per barang.",
  item_requisition: "Catat permintaan barang antar gudang ke Accurate dari Excel, sesuai format Permintaan Barang yang kamu pakai sehari-hari.",
  inventory_adjustment: "Catat penyesuaian stok (stok opname, barang rusak/hilang) ke Accurate dari Excel, lengkap dengan nomor seri per barang.",
  job_costing: "Catat pekerjaan pesanan (Job Order) dan realisasi pemakaian bahan baku ke Accurate dari Excel, lengkap dengan gudang dan nomor seri.",
  work_order: "Buat perintah kerja produksi berbasis formula (BOM) lengkap dengan bahan baku, biaya, proses, dan produk sampingan, langsung dari Excel ke Accurate.",
  material_slip: "Catat realisasi pengambilan atau pengembalian bahan baku dari Work Order, langsung dari Excel ke Accurate.",
  finished_good_slip: "Catat realisasi barang jadi yang diselesaikan dari Work Order, langsung dari Excel ke Accurate.",
  roll_over: "Selesaikan pesanan produksi: ubah biaya Job Order jadi barang jadi atau alokasi biaya ke akun, langsung dari Excel ke Accurate.",
};
