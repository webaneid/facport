// § Fase 117, ADR-0033 — file ini SEKARANG re-export dari
// `apps/api/src/lib/module-catalog.ts` (source of truth tunggal lintas
// apps/api↔apps/web, pola relative-import yang sama seperti
// `lib/api-client.ts`, bedanya di sini BUKAN type-only karena web butuh
// nilai runtime katalog-nya juga). JANGAN duplikasi/hardcode daftar
// modul lagi di file ini — edit `module-catalog.ts`.
//
// Field `group` (lama) sekarang bernama `category` (§ ADR-0033, promosi
// jadi tingkat resmi "Kategori" dalam struktur Brand→Produk→Kategori→
// Varian) — konsumen yang masih baca `.group` perlu diupdate ke
// `.category` (cek `admin/plans/page.tsx`).
import { MODULE_CATALOG, moduleLabel as moduleLabelSource, PRODUCT_LINES, type ModuleKey, type ProductLineKey } from "../../api/src/lib/module-catalog";

export { PRODUCT_LINES };
export type { ModuleKey, ProductLineKey };

export const MODULE_OPTIONS = MODULE_CATALOG;

export const MODULE_GROUPS = [...new Set(MODULE_OPTIONS.map((m) => m.category))];

export const moduleLabel = moduleLabelSource;
