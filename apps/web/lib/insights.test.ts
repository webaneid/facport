import { describe, test, expect } from "bun:test";
import { INSIGHT_TABS, parseTab, formatDelta, formatPercent, exportQuery, defaultRange, renewalLabel, kindLabel, typeLabel, downloadCsv, exportErrorMessage } from "./insights";

// § Fase 189D — bagian murni halaman Insight: tab dari URL (tidak dipercaya), format selisih/persen, kueri ekspor, rentang default, label, dan unduhan CSV berkredensial.
describe("parseTab", () => {
  test("tab sah dikenali; tak dikenal/kosong/injeksi → ringkasan", () => {
    expect(INSIGHT_TABS.map((t) => t.key)).toEqual(["ringkasan", "pelanggan", "fitur", "akses", "langganan", "tren", "koneksi"]);
    expect(parseTab("tren")).toBe("tren");
    for (const bad of [null, undefined, "", "semua", "__proto__", "TREN", "tren ", "<script>"]) expect(parseTab(bad as string | null)).toBe("ringkasan");
  });
});

describe("formatDelta / formatPercent", () => {
  test("selisih bertanda; nol tanpa tanda; null → em dash", () => {
    expect(formatDelta(5)).toBe("+5");
    expect(formatDelta(-3)).toBe("-3");
    expect(formatDelta(0)).toBe("0");
    expect(formatDelta(1234567)).toBe("+1.234.567");
    expect(formatDelta(null)).toBe("—");
  });
  test("persen id-ID satu desimal, bertanda; null → em dash", () => {
    expect(formatPercent(50)).toBe("+50%");
    expect(formatPercent(-12.5)).toBe("-12,5%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(87.5)).toBe("+87,5%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("exportQuery", () => {
  test("hanya parameter yang terisi; urut stabil; nilai di-encode", () => {
    expect(exportQuery({ q: "PT Maju & Jaya", type: "internal", moduleKey: undefined, from: "", to: null })).toBe("q=PT+Maju+%26+Jaya&type=internal");
    expect(exportQuery({})).toBe("");
    expect(exportQuery({ year: 2026, metric: "money" })).toBe("year=2026&metric=money");
  });
});

describe("defaultRange", () => {
  test("30 hari terakhir (inklusif) menurut zona waktu perusahaan, format YYYY-MM-DD", () => {
    const r = defaultRange(30, new Date("2026-10-12T18:00:00.000Z"), "Asia/Jakarta"); // 13 Okt 01:00 WIB
    expect(r).toEqual({ from: "2026-09-14", to: "2026-10-13" });
    expect(defaultRange(1, new Date("2026-01-01T00:00:00.000Z"), "Asia/Jakarta")).toEqual({ from: "2026-01-01", to: "2026-01-01" });
  });
});

describe("label", () => {
  test("tagihan perpanjangan, jenis akun, tipe", () => {
    expect(renewalLabel("terbit")).toMatchObject({ text: "Tagihan sudah terbit" });
    expect(renewalLabel("terjadwal").text).toContain("Terjadwal");
    expect(renewalLabel("tidak_terjadwal").text).toBe("Belum terjadwal");
    expect(kindLabel("pemilik")).toBe("Pemilik");
    expect(kindLabel("tambahan")).toBe("Tambahan");
    expect(kindLabel("belum")).toBe("Belum punya Data Usaha");
    expect(typeLabel(null)).toBe("Komersil");
    expect(typeLabel("flag")).toBe("Internal");
    expect(typeLabel("role")).toBe("Internal (admin)");
  });
});

describe("downloadCsv", () => {
  const make = (init: ResponseInit & { body?: string }) => async () => new Response(init.body ?? "x", init);

  test("sukses: memanggil fetch BERKREDENSIAL, menyimpan blob dengan nama dari Content-Disposition, melaporkan jumlah baris & terpotong", async () => {
    let saved: { name: string; size: number } | null = null;
    let called: { url: string; credentials?: string } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      called = { url, credentials: init?.credentials as string | undefined };
      return new Response("﻿Nama\r\nBudi\r\n", { status: 200, headers: { "content-disposition": 'attachment; filename="facport-customers-20261012.csv"', "x-export-rows": "1", "x-export-truncated": "false" } });
    }) as unknown as typeof fetch;
    const res = await downloadCsv("https://api.test/admin/insights/export/customers", { fetchImpl, save: (blob, name) => { saved = { name, size: blob.size }; } });
    expect(res).toEqual({ ok: true, rows: 1, truncated: false, filename: "facport-customers-20261012.csv" });
    expect(called!.credentials).toBe("include");
    expect(saved!.name).toBe("facport-customers-20261012.csv");
    expect(saved!.size).toBeGreaterThan(0);
  });

  test("terpotong (X-Export-Truncated: true) dilaporkan; tanpa Content-Disposition memakai nama cadangan", async () => {
    const fetchImpl = (async () => new Response("a", { status: 200, headers: { "x-export-rows": "10000", "x-export-truncated": "true" } })) as unknown as typeof fetch;
    const res = await downloadCsv("https://api.test/x", { fetchImpl, save: () => {} });
    expect(res).toMatchObject({ ok: true, rows: 10000, truncated: true, filename: "facport-export.csv" });
  });

  test("galat server: kode dibaca dari JSON; blob TIDAK disimpan; jaringan putus → NETWORK", async () => {
    let saved = 0;
    const save = () => { saved += 1; };
    const quota = (async () => new Response(JSON.stringify({ code: "EXPORT_QUOTA_EXCEEDED" }), { status: 429 })) as unknown as typeof fetch;
    expect(await downloadCsv("u", { fetchImpl: quota, save })).toEqual({ ok: false, status: 429, code: "EXPORT_QUOTA_EXCEEDED" });
    const html = (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
    expect(await downloadCsv("u", { fetchImpl: html, save })).toEqual({ ok: false, status: 502, code: "UNKNOWN" });
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await downloadCsv("u", { fetchImpl: down, save })).toEqual({ ok: false, status: 0, code: "NETWORK" });
    expect(saved).toBe(0);
    void make;
  });

  test("pesan galat ramah per kode", () => {
    expect(exportErrorMessage("EXPORT_QUOTA_EXCEEDED")).toContain("batas ekspor");
    expect(exportErrorMessage("RANGE_TOO_LONG")).toContain("24 bulan");
    expect(exportErrorMessage("NETWORK")).toContain("koneksi");
    expect(exportErrorMessage("APA_SAJA")).toContain("Gagal");
    expect(exportErrorMessage("TOO_MANY_REQUESTS", 429)).toContain("Terlalu banyak");
    expect(exportErrorMessage("X", 429)).toContain("Terlalu banyak");
    expect(exportErrorMessage("X", 403)).toContain("izin");
  });
});
