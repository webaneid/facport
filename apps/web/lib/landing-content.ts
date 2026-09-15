import { FileSpreadsheet, Landmark, Wallet, HandCoins, BookOpenCheck, Banknote, ShoppingCart, PackageCheck, Undo2, FileSignature, type LucideIcon } from "lucide-react";
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
  purchase_order: ShoppingCart,
  receive_item: PackageCheck,
  purchase_return: Undo2,
  sales_quotation: FileSignature,
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
  purchase_order: "Import pesanan pembelian ke Accurate dari Excel, otomatis buat Pemasok & Barang baru kalau belum ada.",
  receive_item: "Catat penerimaan barang dari vendor ke Accurate dari Excel, langsung ter-link ke pesanan pembelian terkait.",
  purchase_return: "Catat retur barang ke vendor dari Excel, terhubung otomatis ke faktur pembelian atau penerimaan barang terkait.",
  sales_quotation: "Import penawaran harga ke Accurate dari Excel, otomatis buat Customer & Barang baru kalau belum ada.",
};
