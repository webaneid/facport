import { describe, test, expect, mock } from "bun:test";
import { formulaExportUrl, downloadFormulaExport, formulaExportErrorMessage } from "./formula-export";

describe("formulaExportUrl", () => {
  test("default tanpa sertakan nonaktif; includeInactive → query true", () => {
    expect(formulaExportUrl("https://api.test", false)).toBe("https://api.test/autoproduksi/formulas/export?includeInactive=false");
    expect(formulaExportUrl("https://api.test", true)).toBe("https://api.test/autoproduksi/formulas/export?includeInactive=true");
  });
});

describe("downloadFormulaExport", () => {
  const okResponse = () =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-disposition": 'attachment; filename="export-formula-2026-10-13.xlsx"' } });

  test("fetch berkredensial + header Data Usaha; menyimpan blob dengan nama dari server", async () => {
    const fetchImpl = mock(async () => okResponse());
    const save = mock((_blob: Blob, _name: string) => {});
    const res = await downloadFormulaExport("https://api.test/x", { fetchImpl: fetchImpl as unknown as typeof fetch, save, headers: { "x-data-usaha-id": "du-1" } });
    expect(res).toEqual({ ok: true, filename: "export-formula-2026-10-13.xlsx" });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({ "x-data-usaha-id": "du-1" });
    expect(save.mock.calls[0]![1]).toBe("export-formula-2026-10-13.xlsx");
  });

  test("galat server → hasil gagal berisi status & code, tidak menyimpan file", async () => {
    const save = mock(() => {});
    const fetchImpl = async () => new Response(JSON.stringify({ code: "DATA_USAHA_REQUIRED" }), { status: 409 });
    expect(await downloadFormulaExport("u", { fetchImpl: fetchImpl as unknown as typeof fetch, save })).toEqual({ ok: false, status: 409, code: "DATA_USAHA_REQUIRED" });
    expect(save).not.toHaveBeenCalled();
  });

  test("jaringan putus → NETWORK; respons bukan JSON → UNKNOWN", async () => {
    const save = mock(() => {});
    const boom = async () => {
      throw new Error("offline");
    };
    expect(await downloadFormulaExport("u", { fetchImpl: boom as unknown as typeof fetch, save })).toEqual({ ok: false, status: 0, code: "NETWORK" });
    const html = async () => new Response("<html>", { status: 502 });
    expect(await downloadFormulaExport("u", { fetchImpl: html as unknown as typeof fetch, save })).toEqual({ ok: false, status: 502, code: "UNKNOWN" });
  });
});

describe("formulaExportErrorMessage", () => {
  test("pesan ramah per kondisi", () => {
    expect(formulaExportErrorMessage({ ok: false, status: 0, code: "NETWORK" })).toMatch(/koneksi/i);
    expect(formulaExportErrorMessage({ ok: false, status: 409, code: "DATA_USAHA_REQUIRED" })).toMatch(/Data Usaha/);
    expect(formulaExportErrorMessage({ ok: false, status: 401, code: "UNKNOWN" })).toMatch(/masuk/i);
    expect(formulaExportErrorMessage({ ok: false, status: 500, code: "UNKNOWN" })).toMatch(/Gagal mengekspor/);
  });
});
