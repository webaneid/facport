import { env } from "./env";
import { configuredGroupParallelism } from "./group-concurrency";
import { salesInvoiceMapping } from "./import-mapping/sales-invoice.mapping";
import { purchaseInvoiceMapping } from "./import-mapping/purchase-invoice.mapping";
import { salesReceiptMapping } from "./import-mapping/sales-receipt.mapping";
import { purchasePaymentMapping } from "./import-mapping/purchase-payment.mapping";

// § Fase 215 (architecture-import-speed-lab.md § 20–21) — dua penjaga sebelum pengiriman PARALEL dinyalakan untuk sebuah batch. Hanya CARA PENGIRIMAN yang dipilih; isi/nomor
// dokumen tidak pernah diubah ([[feedback-never-alter-customer-documents]]).
//
// 1. DAFTAR MODUL: paralel hanya untuk modul yang SUDAH terbukti di Accurate asli (lab § 14–20). Modul lain tetap berurutan sampai diuji satu per satu. Dapat diubah tanpa
//    rilis lewat env `IMPORT_PARALLEL_MODULES` (daftar dipisah koma; `*` = semua modul — hanya setelah diuji).
// 2. NOMOR OTOMATIS: dokumen dikirim paralel DISELESAIKAN tidak berurutan; bila kolom nomor dokumen kosong, Accurate memberi nomor sesuai urutan TIBA, sehingga nomor otomatis
//    bisa tidak mengikuti urutan baris Excel (terukur: paralel 4 → 7 dari 30 pasangan terbalik, geser maks 2 posisi). Karena itu paralel HANYA dipakai bila SEMUA baris yang
//    diproses punya nomor dokumen eksplisit; selain itu seluruh batch berurutan seperti dulu (pilihan "aman"; versi campuran sengaja tidak dibuat).

/** Modul yang sudah terbukti paralel di Accurate asli (Sales/Purchase Invoice, Sales Receipt, Purchase Payment). */
export const DEFAULT_PARALLEL_MODULES: readonly string[] = ["sales_invoice", "purchase_invoice", "sales_receipt", "purchase_payment"];

type PathMapping = { fieldToAccuratePath: Record<string, string> };

// Pemetaan modul → field internal yang menjadi nomor dokumen Accurate (`number`). Modul yang tidak ada di sini TIDAK pernah paralel.
const NUMBER_MAPPINGS: Record<string, PathMapping> = {
  sales_invoice: salesInvoiceMapping,
  purchase_invoice: purchaseInvoiceMapping,
  sales_receipt: salesReceiptMapping,
  purchase_payment: purchasePaymentMapping,
};

/** Nilai env `IMPORT_PARALLEL_MODULES` → himpunan modul, atau `"all"`; kosong/tidak diisi → daftar default (modul terbukti). */
export function parseParallelModules(raw: string | undefined): ReadonlySet<string> | "all" {
  const items = (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (items.length === 0) return new Set(DEFAULT_PARALLEL_MODULES);
  if (items.includes("*")) return "all";
  return new Set(items);
}

export function configuredParallelModules(): ReadonlySet<string> | "all" {
  return parseParallelModules((env as unknown as Record<string, string | undefined>).IMPORT_PARALLEL_MODULES);
}

/** Kolom Excel yang dipetakan ke field yang menjadi `number` Accurate untuk modul ini (kosong = tidak ada kolom nomor yang dipetakan). */
export function numberColumnsOf(module: string, columnMapping: Record<string, string>): string[] {
  const mapping = NUMBER_MAPPINGS[module];
  if (!mapping) return [];
  return Object.entries(columnMapping).filter(([, field]) => mapping.fieldToAccuratePath[field] === "number").map(([column]) => column);
}

export type ParallelReason = "ok" | "off" | "module_not_enabled" | "no_number_column" | "blank_numbers";
export type ParallelDecision = { parallelism: number; reason: ParallelReason };

/**
 * Paralelisme efektif untuk satu batch. `configured` = `IMPORT_GROUP_PARALLELISM` (1 = mati). Hasil > 1 hanya bila: paralel dinyalakan, modul diizinkan, kolom nomor dokumen
 * dipetakan, dan SETIAP baris yang diproses punya nomor (tidak kosong setelah trim). Selain itu 1 (berurutan = perilaku lama persis) dan `reason` menjelaskan kenapa.
 */
export function decideGroupParallelism(args: {
  module: string;
  rows: readonly { rawData: Record<string, unknown> }[];
  columnMapping: Record<string, string>;
  configured?: number;
  allowedModules?: ReadonlySet<string> | "all";
}): ParallelDecision {
  const configured = args.configured ?? configuredGroupParallelism();
  if (configured <= 1) return { parallelism: 1, reason: "off" };
  const allowed = args.allowedModules ?? configuredParallelModules();
  if (allowed !== "all" && !allowed.has(args.module)) return { parallelism: 1, reason: "module_not_enabled" };
  const columns = numberColumnsOf(args.module, args.columnMapping);
  if (columns.length === 0) return { parallelism: 1, reason: "no_number_column" };
  const hasNumber = (row: { rawData: Record<string, unknown> }) =>
    columns.some((column) => {
      const value = row.rawData[column];
      return value !== undefined && value !== null && String(value).trim() !== "";
    });
  if (!args.rows.every(hasNumber)) return { parallelism: 1, reason: "blank_numbers" };
  return { parallelism: configured, reason: "ok" };
}
