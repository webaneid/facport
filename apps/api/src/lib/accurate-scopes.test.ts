import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_ACCURATE_SCOPES, MODULE_ACCURATE_SCOPES, scopesForEndpoint, scopesForModules } from "./accurate-scopes";
import { ACCURATE_ENDPOINT_REGISTRY, BASELINE_ENDPOINTS } from "./accurate-endpoint-registry";
import snapshot from "./accurate-scope-snapshot.json";
import { MODULE_CATALOG } from "./module-catalog";

// § Fase 78 (2026-09-09) — BUG ditemukan lewat retest client (import
// Purchase Invoice 403 di baris pertama SETIAP grup): ADR-0026 (commit
// `1bc9256`) memindahkan `vendor_view`/`vendor_save` SEPENUHNYA ke scope
// `vendor_payable_account`, dengan asumsi cuma dipakai fitur "Import Akun
// Hutang Pemasok" — TAPI `findOrCreateVendor` (Fase 05, dipanggil
// UNCONDITIONAL di setiap import Purchase Invoice untuk cek/bikin vendor,
// fitur INTI yang TIDAK ADA hubungannya dengan Akun Hutang Pemasok) JUGA
// butuh scope ini. Akibatnya subscriber Purchase Invoice TANPA subscribe
// Akun Hutang Pemasok selalu 403 sejak commit itu deploy. Test ini
// mengunci regresi supaya scope ini tidak "kepindah" lagi tanpa sadar.
describe("MODULE_ACCURATE_SCOPES — Fase 78 fix", () => {
  test("purchase_invoice PUNYA vendor_view & vendor_save (dibutuhkan findOrCreateVendor)", () => {
    expect(MODULE_ACCURATE_SCOPES.purchase_invoice).toContain("vendor_view");
    expect(MODULE_ACCURATE_SCOPES.purchase_invoice).toContain("vendor_save");
  });

  test("vendor_payable_account TETAP punya vendor_view & vendor_save (2 modul sama-sama butuh, alasan beda)", () => {
    expect(MODULE_ACCURATE_SCOPES.vendor_payable_account).toContain("vendor_view");
    expect(MODULE_ACCURATE_SCOPES.vendor_payable_account).toContain("vendor_save");
  });

  test("subscriber Purchase Invoice SAJA (tanpa Akun Hutang Pemasok) tetap dapat scope vendor", () => {
    const scopes = scopesForModules(["purchase_invoice"]);
    expect(scopes).toContain("vendor_view");
    expect(scopes).toContain("vendor_save");
  });
});

// § Fase 98 (2026-09-10) — BUG ditemukan (client retest Journal Voucher,
// error Accurate "Kategori Keuangan 1 tidak ditemukan atau sudah
// dihapus"): field `attribut1`-`attribut10` ditambahkan Fase 95 TANPA
// scope `data_classification_view`/`_save` yang dibutuhkan
// `findOrCreateDataClassification` — mirror bug class yang sama dengan
// Fase 78 (field/fungsi ditambahkan, scope-nya lupa diikutkan). Test ini
// mengunci regresi supaya scope ini tidak lupa lagi di masa depan.
describe("MODULE_ACCURATE_SCOPES — Fase 98 fix", () => {
  test("journal_voucher PUNYA data_classification_view & data_classification_save (dibutuhkan findOrCreateDataClassification)", () => {
    expect(MODULE_ACCURATE_SCOPES.journal_voucher).toContain("data_classification_view");
    expect(MODULE_ACCURATE_SCOPES.journal_voucher).toContain("data_classification_save");
  });

  test("subscriber Journal Voucher dapat scope data_classification lewat scopesForModules", () => {
    const scopes = scopesForModules(["journal_voucher"]);
    expect(scopes).toContain("data_classification_view");
    expect(scopes).toContain("data_classification_save");
  });
});

// § Fase 117, ADR-0033 — guard konsolidasi: `MODULE_ACCURATE_SCOPES` HARUS
// subset dari Varian Produk "facport" di `module-catalog.ts` (satu-satunya
// Produk yang integrasi Accurate Online). Kalau ada modul non-Accurate
// (Konverter/AutoProduksi) ke-wire keliru ke sini, test ini gagal —
// mencegah modul yang TIDAK PERNAH call Accurate diberi OAuth scope.
describe("MODULE_ACCURATE_SCOPES — konsolidasi katalog (Fase 117)", () => {
  test("semua key MODULE_ACCURATE_SCOPES adalah Varian Produk facport di module-catalog.ts", () => {
    const facportKeys = new Set<string>(MODULE_CATALOG.filter((m) => m.productLine === "facport").map((m) => m.key));
    for (const key of Object.keys(MODULE_ACCURATE_SCOPES)) {
      expect(facportKeys.has(key)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § Fase 142 — mesin scope (architecture-accurate-scope-engine.md). Pengaman CI.
// ─────────────────────────────────────────────────────────────────────────────

// Daftar TULIS-TANGAN lama (pra-Fase 142), dibekukan sebagai fixture regresi: scope turunan
// registri BOLEH menambah, TIDAK BOLEH menghilangkan scope yang sudah diminta production.
const LEGACY_SCOPES: Record<string, string[]> = {
  purchase_invoice: ["purchase_invoice_view", "purchase_invoice_save", "item_save", "data_classification_view", "data_classification_save", "vendor_view", "vendor_save"],
  vendor_payable_account: ["vendor_view", "vendor_save"],
  sales_invoice: ["sales_invoice_view", "sales_invoice_save", "customer_view", "customer_save", "item_save", "data_classification_view", "data_classification_save"],
  sales_receipt: ["sales_receipt_view", "sales_receipt_save", "tax_view"],
  purchase_payment: ["purchase_payment_view", "purchase_payment_save", "glaccount_view", "tax_view"],
  journal_voucher: ["journal_voucher_view", "journal_voucher_save", "glaccount_view", "data_classification_view", "data_classification_save"],
  other_payment: ["other_payment_view", "other_payment_save", "glaccount_view", "data_classification_view", "data_classification_save"],
  other_deposit: ["other_deposit_view", "other_deposit_save", "glaccount_view", "data_classification_view", "data_classification_save"],
  purchase_order: ["purchase_order_save", "vendor_view", "vendor_save", "item_save", "data_classification_view", "data_classification_save"],
  receive_item: ["receive_item_save", "data_classification_view", "data_classification_save"],
  purchase_return: ["purchase_return_save", "data_classification_view", "data_classification_save"],
  sales_quotation: ["sales_quotation_save", "customer_view", "customer_save", "item_save", "data_classification_view", "data_classification_save"],
  sales_order: ["sales_order_save", "customer_view", "customer_save", "item_save", "data_classification_view", "data_classification_save"],
  sales_return: ["sales_return_save", "data_classification_view", "data_classification_save"],
  item_transfer: ["item_transfer_save", "glaccount_view", "data_classification_view", "data_classification_save"],
  item_requisition: ["item_transfer_save", "glaccount_view", "data_classification_view", "data_classification_save"],
  inventory_adjustment: ["item_adjustment_save", "glaccount_view"],
  job_costing: ["job_order_save", "material_adjustment_save", "item_save", "glaccount_view", "data_classification_view", "data_classification_save"],
};

describe("mesin scope — regresi terhadap daftar tulis-tangan lama", () => {
  // § ⊇ (bukan ==): modul baru pasca-Fase 142 (mis. roll_over) hanya ada di registri, tidak punya daftar lama.
  test("registri mencakup semua modul di daftar lama", () => {
    const registered = new Set(Object.keys(ACCURATE_ENDPOINT_REGISTRY));
    for (const moduleKey of Object.keys(LEGACY_SCOPES)) expect(registered.has(moduleKey)).toBe(true);
  });

  for (const [moduleKey, legacy] of Object.entries(LEGACY_SCOPES)) {
    test(`${moduleKey}: scope turunan ⊇ daftar lama`, () => {
      const derived = new Set(MODULE_ACCURATE_SCOPES[moduleKey]);
      for (const scope of legacy) expect(derived.has(scope)).toBe(true);
    });
  }

  test("scopesForModules tetap menyertakan baseline item_view", () => {
    expect(scopesForModules(["receive_item"])).toContain("item_view");
  });

  // § Fase 141 E8 — spec mencatat purchase_invoice_delete untuk DELETE purchase-invoice/delete.do
  // (runtime belum menegakkan, tapi dimasukkan demi aman kalau Accurate mengetatkan).
  test("purchase_invoice meminta purchase_invoice_delete (Batal Import)", () => {
    expect(MODULE_ACCURATE_SCOPES.purchase_invoice).toContain("purchase_invoice_delete");
  });

  test("ALL_ACCURATE_SCOPES = gabungan semua modul + baseline, tanpa duplikat", () => {
    expect(new Set(ALL_ACCURATE_SCOPES).size).toBe(ALL_ACCURATE_SCOPES.length);
    for (const scopes of Object.values(MODULE_ACCURATE_SCOPES)) {
      for (const scope of scopes) expect(ALL_ACCURATE_SCOPES).toContain(scope);
    }
    expect(ALL_ACCURATE_SCOPES).toContain("item_view");
  });
});

describe("mesin scope — registri vs snapshot spec", () => {
  const allScopesInSnapshot = new Set(Object.values(snapshot as Record<string, string[]>).flat());

  test("setiap endpoint registri ada di snapshot", () => {
    const all = [...BASELINE_ENDPOINTS, ...Object.values(ACCURATE_ENDPOINT_REGISTRY).flatMap((m) => m.endpoints)];
    for (const endpoint of all) expect(() => scopesForEndpoint(endpoint)).not.toThrow();
  });

  test("setiap scope turunan & extraScopes adalah scope valid menurut spec resmi", () => {
    for (const scope of ALL_ACCURATE_SCOPES) expect(allScopesInSnapshot.has(scope)).toBe(true);
  });

  test("setiap extraScopes punya alasan tertulis", () => {
    for (const entry of Object.values(ACCURATE_ENDPOINT_REGISTRY)) {
      for (const extra of entry.extraScopes ?? []) expect(extra.reason.trim().length).toBeGreaterThan(10);
    }
  });

  test("scopesForEndpoint melempar galat jelas untuk endpoint yang tidak ada", () => {
    expect(() => scopesForEndpoint("POST tidak-ada/save.do")).toThrow(/scopes:sync/);
  });
});

// Pemindai sumber: kelas bug Fase 78/98 — endpoint dipanggil, scope tidak diminta. Setiap literal
// `/accurate/api/<resource>/<aksi>.do` di kode non-tes HARUS terdaftar di ≥1 modul registri.
describe("mesin scope — semua endpoint yang dipanggil kode terdaftar di registri", () => {
  const srcRoot = join(import.meta.dir, "..");
  const dirs = ["lib", "routes", "workers"].map((d) => join(srcRoot, d));

  function listFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return listFiles(full);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
    });
  }

  const registered = new Set(
    [...BASELINE_ENDPOINTS, ...Object.values(ACCURATE_ENDPOINT_REGISTRY).flatMap((m) => m.endpoints)].map((e) => e.replace(/^[A-Z]+ /, "")),
  );

  test("tidak ada endpoint /accurate/api/*.do di kode yang belum terdaftar", () => {
    const found = new Map<string, string>();
    for (const file of dirs.flatMap(listFiles)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\/accurate\/api\/([a-z-]+\/[a-z-]+\.do)/g)) found.set(m[1]!, file);
    }
    expect(found.size).toBeGreaterThan(20); // pemindai benar-benar menemukan sesuatu
    const missing = [...found].filter(([endpoint]) => !registered.has(endpoint)).map(([e, f]) => `${e} (${f})`);
    expect(missing).toEqual([]);
  });
});
