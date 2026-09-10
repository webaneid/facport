import { describe, test, expect } from "bun:test";
import { MODULE_ACCURATE_SCOPES, scopesForModules } from "./accurate-scopes";

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
