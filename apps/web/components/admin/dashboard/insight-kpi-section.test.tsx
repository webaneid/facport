import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen } from "@testing-library/react";

// § Fase 189E — KPI Insight di dashboard: hanya untuk insights.view (tanpa izin tidak ada panggilan API), angka komersil/internal & uang, galat → pesan.
let permissions = ["insights.view"];
const summaryGet = mock(async (): Promise<{ data: unknown; error: unknown }> => ({
  data: {
    accounts: { commercial: 12, internal: 3, disabled: 1 },
    dataUsaha: { total: 20, connected: 15 },
    customers: { active: 9, activeFeatures: 14 },
    expiring: { owners14: 2, subscriptions14: 3, owners30: 4, subscriptions30: 6 },
    money: { thisMonth: { verified: 1_000_000, adminSettled: 500_000, total: 1_500_000 }, thisYear: { verified: 9_000_000, adminSettled: 1_000_000, total: 10_000_000 } },
  },
  error: null,
}));
const trendGet = mock(async (_a: unknown): Promise<{ data: unknown; error: unknown }> => ({
  data: { year: 2026, metric: "active", summary: { kind: "stock", value: 3 }, points: [{ month: "2026-09", value: 1, previous: 0, delta: 1, percent: 100, future: false }, { month: "2026-10", value: 3, previous: 1, delta: 2, percent: 200, future: false }, { month: "2026-11", value: null, previous: null, delta: null, percent: null, future: true }] },
  error: null,
}));
mock.module("@/lib/api-client", () => ({ api: { admin: { insights: { summary: { get: summaryGet }, trend: { get: trendGet } } } }, apiBaseUrl: "" }));
mock.module("@/lib/use-permissions", () => ({ usePermissions: () => permissions, usePermission: (k: string) => permissions.includes(k), PermissionsProvider: ({ children }: { children: React.ReactNode }) => children }));

const { InsightKpiSection } = await import("./insight-kpi-section");

beforeEach(() => {
  permissions = ["insights.view"];
  summaryGet.mockClear();
});

describe("InsightKpiSection", () => {
  test("dengan izin: KPI komersil/internal, uang, tautan ke Insight", async () => {
    render(<InsightKpiSection />);
    expect(await screen.findByText("Akun komersil")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText(/3 akun internal/)).toBeTruthy();
    expect(screen.getByText("Uang bulan ini")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Buka Insight/ }).getAttribute("href")).toBe("/insight");
  });
  test("kartu KPI menjadi tautan ke tab Insight terkait (klik-tembus)", async () => {
    render(<InsightKpiSection />);
    await screen.findByText("Akun komersil");
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/insight?tab=pelanggan", "/insight?tab=koneksi", "/insight?tab=tren&metric=active", "/insight?tab=langganan", "/insight?tab=tren&metric=money"]));
  });
  test("kegagalan tren tidak merusak kartu (hanya sparkline yang hilang)", async () => {
    trendGet.mockImplementation(async () => ({ data: null, error: { status: 500 } }));
    render(<InsightKpiSection />);
    expect(await screen.findByText("Akun komersil")).toBeTruthy();
    trendGet.mockImplementation(async () => ({ data: null, error: null }));
  });
  test("tanpa insights.view: tidak ada bagian dan tidak memanggil API", () => {
    permissions = ["users.manage"];
    const { container } = render(<InsightKpiSection />);
    expect(container.innerHTML).toBe("");
    expect(summaryGet).not.toHaveBeenCalled();
  });
  test("galat API → pesan, bukan kosong", async () => {
    summaryGet.mockImplementationOnce(async () => ({ data: null, error: { status: 500 } }));
    render(<InsightKpiSection />);
    expect(await screen.findByText("Gagal memuat KPI pelanggan.")).toBeTruthy();
  });
});
