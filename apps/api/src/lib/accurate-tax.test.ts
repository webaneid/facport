import { describe, test, expect, afterEach } from "bun:test";
import { findTaxByIdentifier } from "./accurate-tax";
import type { AccurateSessionContext } from "./accurate-session";

// § Fase 118+ (2026-09-15) — customer retest nyata: PPh salah/tidak
// terpotong meski payload sudah ikuti struktur resmi Accurate Support.
// Root cause paling mungkin ditemukan lewat baca kode (bukan test call
// baru — tidak ada akses Accurate nyata di sesi ini): `findTaxByIdentifier`
// SEBELUMNYA mencari ke SELURUH Master Data Pajak (PPh15/21/22/23/PS4/
// PPN/PPNBM sekaligus) tanpa filter jenis — kalau `taxCode`/`description`
// yang diisi user kebetulan cocok record BUKAN PPh23, `.find()` diam-diam
// balikin match pertama APAPUN jenisnya. Test ini MENGUNCI fix-nya: hanya
// PPh23 yang boleh cocok, walau ada record non-PPh23 yang taxCode/
// description-nya identik/lebih dulu di list.

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockTaxList(records: { id: number; taxCode: string; description: string; taxType: string }[]) {
  globalThis.fetch = (async (_url: string, _init: RequestInit) =>
    new Response(JSON.stringify({ s: true, d: records }), { status: 200 })) as typeof fetch;
}

const ctx = { host: "https://zeus.accurate.id", accessToken: "at", session: "sess" } as AccurateSessionContext;

describe("findTaxByIdentifier — filter taxType PPH23 (Fase 118+)", () => {
  test("cocok ke record PPh23 walau ada record PPN dengan description IDENTIK duluan di list", async () => {
    mockTaxList([
      { id: 100, taxCode: "PPN", description: "Jasa Kebersihan", taxType: "PPN" }, // sengaja duluan di list & description SAMA
      { id: 350, taxCode: "Pajak Penghasilan Ps.23", description: "Jasa Kebersihan", taxType: "PPH23" },
    ]);
    const found = await findTaxByIdentifier(ctx, "Jasa Kebersihan");
    expect(found?.id).toBe(350);
    expect(found?.taxType).toBe("PPH23");
  });

  test("taxCode ambigu (dipakai banyak jenis jasa PPh23) tetap cocok salah satu PPh23, BUKAN record PPN dengan kode sama", async () => {
    mockTaxList([
      { id: 200, taxCode: "Pajak Penghasilan Ps.23", description: "PPN Keluaran (kode kebetulan sama)", taxType: "PPN" },
      { id: 351, taxCode: "Pajak Penghasilan Ps.23", description: "Jasa Software Komputer", taxType: "PPH23" },
    ]);
    const found = await findTaxByIdentifier(ctx, "Pajak Penghasilan Ps.23");
    expect(found?.taxType).toBe("PPH23");
  });

  test("match numerik (id) juga wajib PPh23 — id yang cocok tapi taxType lain TIDAK ketemu", async () => {
    mockTaxList([{ id: 999, taxCode: "PPN", description: "PPN Masukan", taxType: "PPN" }]);
    const found = await findTaxByIdentifier(ctx, "999");
    expect(found).toBeUndefined();
  });

  test("match numerik (id) ketemu kalau taxType-nya memang PPH23", async () => {
    mockTaxList([{ id: 350, taxCode: "Pajak Penghasilan Ps.23", description: "Jasa Kebersihan", taxType: "PPH23" }]);
    const found = await findTaxByIdentifier(ctx, "350");
    expect(found?.id).toBe(350);
  });

  test("identifier kosong balikin undefined tanpa panggil Accurate", async () => {
    let called = false;
    globalThis.fetch = (async (_url: string, _init: RequestInit) => {
      called = true;
      return new Response(JSON.stringify({ s: true, d: [] }), { status: 200 });
    }) as typeof fetch;
    const found = await findTaxByIdentifier(ctx, "   ");
    expect(found).toBeUndefined();
    expect(called).toBe(false);
  });

  test("identifier tidak ketemu sama sekali (bukan cuma beda jenis) balikin undefined", async () => {
    mockTaxList([{ id: 350, taxCode: "Pajak Penghasilan Ps.23", description: "Jasa Kebersihan", taxType: "PPH23" }]);
    const found = await findTaxByIdentifier(ctx, "Jasa Yang Tidak Ada");
    expect(found).toBeUndefined();
  });
});
