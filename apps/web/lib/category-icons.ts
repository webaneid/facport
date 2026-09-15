import { PiggyBank, NotebookText, ShoppingBag, TrendingUp, Warehouse, Factory, Package, type LucideIcon } from "lucide-react";

// § Fase 126 lanjutan — diekstrak dari `components/app-shell/sidebar.tsx`
// (tadinya private ke file itu) supaya bisa dipakai bareng oleh halaman
// katalog langganan (`components/subscribe/*`) — 1 mapping icon per
// Kategori, dipakai KONSISTEN lintas sidebar dan halaman katalog, bukan
// 2 definisi terpisah yang bisa divergen.
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  "Cash & Bank": PiggyBank,
  "General Ledger": NotebookText,
  Purchase: ShoppingBag,
  Sales: TrendingUp,
  Inventory: Warehouse,
  Manufacture: Factory,
};

// § fallback kalau ada Kategori yang belum kemasukan mapping icon di atas.
export const CATEGORY_ICON_FALLBACK: LucideIcon = Package;
