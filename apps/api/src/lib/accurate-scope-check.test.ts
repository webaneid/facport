import { describe, test, expect } from "bun:test";
import { checkConnectionScopes, missingScopes } from "./accurate-scope-check";
import { ALL_ACCURATE_SCOPES, scopesForModules } from "./accurate-scopes";
import type { accurateConnections } from "../db/schema";

// § Fase 142 — `missingScopes`/`checkConnectionScopes`, satu-satunya jalur verifikasi scope koneksi.
type Connection = typeof accurateConnections.$inferSelect;
const baseConnection = (grantedScopes: string[] | null): Connection => ({
  id: "00000000-0000-0000-0000-000000000000",
  userId: "u",
  accessTokenEncrypted: "dummy",
  refreshTokenEncrypted: "dummy",
  expiresAt: new Date(),
  accurateDbId: "1",
  accurateDbAlias: null,
  status: "active",
  grantedScopes,
  accurateUserId: null,
  accurateUserEmail: null,
  connectedAt: new Date(),
  updatedAt: new Date(),
});

describe("missingScopes", () => {
  test("kosong kalau semua scope modul sudah diberikan", () => {
    expect(missingScopes(scopesForModules(["purchase_invoice"]), ["purchase_invoice"])).toEqual([]);
  });

  test("melaporkan scope modul yang belum diberikan (koneksi purchase_invoice dipakai sales_invoice)", () => {
    const missing = missingScopes(scopesForModules(["purchase_invoice"]), ["sales_invoice"]);
    expect(missing).toContain("sales_invoice_save");
    expect(missing).toContain("customer_save");
    expect(missing).not.toContain("item_save"); // dimiliki bersama, sudah ada
  });

  test("baseline item_view ikut dihitung sebagai kebutuhan", () => {
    expect(missingScopes([], ["receive_item"])).toContain("item_view");
  });

  test("koneksi dengan SEMUA scope katalog lolos untuk setiap modul", () => {
    for (const mod of ["purchase_invoice", "job_costing", "vendor_payable_account", "sales_return"]) {
      expect(missingScopes(ALL_ACCURATE_SCOPES, [mod])).toEqual([]);
    }
  });
});

describe("checkConnectionScopes (tanpa jaringan: grantedScopes sudah tersimpan)", () => {
  test("ok:true kalau lengkap", async () => {
    const res = await checkConnectionScopes(baseConnection(ALL_ACCURATE_SCOPES), ["job_costing"]);
    expect(res).toEqual({ ok: true });
  });

  test("ok:false + daftar missing kalau kurang", async () => {
    const res = await checkConnectionScopes(baseConnection(scopesForModules(["sales_invoice"])), ["purchase_invoice"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toContain("purchase_invoice_save");
  });

  test("grantedScopes [] (diketahui, kosong) TETAP dihitung kurang — beda dari NULL (tidak diketahui)", async () => {
    const res = await checkConnectionScopes(baseConnection([]), ["receive_item"]);
    expect(res.ok).toBe(false);
  });
});
