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
import {
  MODULE_CATALOG,
  MODULE_CATEGORIES,
  moduleLabel as moduleLabelSource,
  productLineLabel as productLineLabelSource,
  moduleCategory as moduleCategorySource,
  moduleProductLine as moduleProductLineSource,
  modulesForProductLine as modulesForProductLineSource,
  PRODUCT_LINES,
  type ModuleKey,
  type ModuleKeyForProductLine,
  type ProductLineKey,
} from "../../api/src/lib/module-catalog";

export { PRODUCT_LINES, MODULE_CATEGORIES };
export type { ModuleKey, ModuleKeyForProductLine, ProductLineKey };

export const MODULE_OPTIONS = MODULE_CATALOG;

export const MODULE_GROUPS = [...new Set(MODULE_OPTIONS.map((m) => m.category))];

export const moduleLabel = moduleLabelSource;

// § Fase 118 — dipakai keterangan invoice (admin: tabel/dialog Detail
// Invoice), resolve label Produk & Kategori dari moduleKey/productLine
// yang di-snapshot ke `invoiceItems`.
export const productLineLabel = productLineLabelSource;
export const moduleCategory = moduleCategorySource;
// § Fase 127 — dipakai `/subscribe` split grup modul per Produk sebelum render per section.
export const moduleProductLine = moduleProductLineSource;
// § Fase 150 — dipakai sidebar buat gerbang "punya subscription apa pun di Produk ini" (§ komentar sumber).
export const modulesForProductLine = modulesForProductLineSource;
