import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189D — halaman Insight: tab dari URL (tak dipercaya), Ringkasan, Pelanggan (kontak + WhatsApp hanya dari nomor sah), dialog Lihat, tab Akses, ekspor berkredensial.
let search = "";
const replace = mock((_url: string) => {});
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
const cust = (over: Record<string, unknown>) => ({
  id: "u", name: "User", email: "u@test.local", companyName: null, phone: null, whatsapp: null, disabled: false, internalReason: null, kind: "pemilik",
  ownedDataUsaha: 1, connectedDataUsaha: 1, seats: { active: 1, invited: 1, available: 3 }, activeFeatures: ["a", "b"], nearestEndAt: "2026-11-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", ...over,
});
const customersGet = mock(async (_arg: unknown): Promise<{ data: unknown; error: unknown }> => ({
  data: {
    items: [
      cust({ id: "budi", name: "Budi", email: "budi@test.local", companyName: "PT Budi", phone: "+6281234567890", whatsapp: "+6281234567890" }),
      cust({ id: "sari", name: "Sari", email: "sari@test.local", phone: "bukan-nomor", whatsapp: null, internalReason: "flag", kind: "belum" }),
    ],
    total: 2, page: 1, pageSize: 20,
  },
  error: null,
}));
const accessGet = mock(async (): Promise<{ data: unknown; error: unknown }> => ({
  data: {
    owner: { id: "budi", name: "Budi", email: "budi@test.local", companyName: "PT Budi" },
    dataUsaha: [{ id: "du1", name: "Toko Budi", seats: [{ id: "s1", status: "active", invitedEmail: null, memberUserId: "m", memberName: "Andi", memberEmail: "andi@test.local", seatEndAt: "2026-12-01T00:00:00.000Z", seatExpired: false }] }],
  },
  error: null,
}));
const owner = (over: Record<string, unknown>) => ({ id: "o", name: "Owner", email: "o@test.local", companyName: null, phone: null, whatsapp: null, ...over });
const featuresGet = mock(async (): Promise<{ data: unknown; error: unknown }> => ({ data: { features: [{ moduleKey: "purchase_invoice", label: "Faktur Pembelian", dataUsaha: 3, customers: 2, subscriptions: 4 }] }, error: null }));
const featureCustomersGet = mock(async (_a: unknown): Promise<{ data: unknown; error: unknown }> => ({
  data: { moduleKey: "purchase_invoice", label: "Faktur Pembelian", total: 1, page: 0, pageSize: 20, items: [{ owner: owner({ id: "o1", name: "Citra", phone: "+6285711112222" }), dataUsahaId: "d1", dataUsahaName: "CV Citra", planName: "Paket Pro", startAt: "2026-01-01T00:00:00.000Z", endAt: null, renewalInterval: null }] },
  error: null,
}));
const newGet = mock(async (_a: unknown): Promise<{ data: unknown; error: unknown }> => ({
  data: { range: { from: "a", to: "b" }, summary: { customers: 1, newCustomers: 1, subscriptions: 2 }, total: 1, page: 0, pageSize: 20, items: [{ owner: owner({ id: "o2", name: "Dedi" }), firstStartAt: "2026-10-05T00:00:00.000Z", isNewCustomer: true, features: [{ moduleKey: "x", label: "Faktur Penjualan", dataUsahaName: "Toko Dedi", startAt: "2026-10-05T00:00:00.000Z", endAt: null }] }] },
  error: null,
}));
const expiringGet = mock(async (_a: unknown): Promise<{ data: unknown; error: unknown }> => ({
  data: { window: 30, summary: { owners: 1, subscriptions: 2 }, total: 1, page: 0, pageSize: 20, items: [{ owner: owner({ id: "o3", name: "Eka" }), nearestEndAt: "2026-10-20T00:00:00.000Z", subscriptions: [
    { id: "s1", moduleKey: "x", label: "Jurnal Umum", dataUsahaId: "d", dataUsahaName: "PT Eka", endAt: "2026-10-20T00:00:00.000Z", daysLeft: 8, renewal: { status: "terbit", invoiceNumber: "INV-1", amountDue: 150000 } },
    { id: "s2", moduleKey: "y", label: "Retur Penjualan", dataUsahaId: "d", dataUsahaName: "PT Eka", endAt: "2026-10-25T00:00:00.000Z", daysLeft: 13, renewal: { status: "tidak_terjadwal" } },
  ] }] },
  error: null,
}));
const point = (month: string, value: number | null, previous: number | null, future = false) => ({ month, value, previous, delta: value === null || previous === null ? null : value - previous, percent: value === null || !previous ? null : ((value - previous) / previous) * 100, future });
const trendGet = mock(async (_a: unknown): Promise<{ data: unknown; error: unknown }> => ({
  data: { year: 2026, metric: "active", summary: { kind: "stock", value: 8 }, points: [point("2026-09", 6, 4), point("2026-10", 8, 6), point("2026-11", null, null, true)] },
  error: null,
}));
const tenureGet = mock(async (_a: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: { month: "2026-10", aktif: 8, baru: 2, lanjutanTahun1: 4, byYear: [{ year: 2, count: 2 }], berhenti: 1, kembali: 1 }, error: null }));
const connectionGet = mock(async (_a: unknown): Promise<{ data: unknown; error: unknown }> => ({
  data: {
    total: 2, page: 0, pageSize: 20, summary: { byAction: {}, dataUsahaWithCorrection: 1, ownersWithCorrection: 1, repeatedCorrection: 1 },
    items: [
      { id: "e1", action: "disconnect_accurate", changes: { reason: { code: "salah_database" } }, createdAt: "2026-10-10T03:00:00.000Z", actor: { id: "a", name: "Admin Satu" }, dataUsaha: { id: "d", name: "Toko Fani" }, owner: owner({ id: "o4", name: "Fani", companyName: "PT Fani", phone: "+6281300000000" }) },
      { id: "e2", action: "reset_database", changes: { previousAlias: "DB Lama" }, createdAt: "2026-10-09T03:00:00.000Z", actor: null, dataUsaha: { id: "d", name: "Toko Fani" }, owner: owner({ id: "o4", name: "Fani", companyName: "PT Fani" }) },
    ],
  },
  error: null,
}));
const download = mock(async (..._a: unknown[]) => ({ ok: true as const, rows: 2, truncated: false, filename: "x.csv" }));
const toastError = mock((_m: string) => {});

mock.module("@/lib/api-client", () => ({
  api: {
    admin: {
      insights: {
        summary: { get: summaryGet },
        customers: Object.assign(() => ({ access: { get: accessGet } }), { get: customersGet }),
        features: Object.assign(() => ({ customers: { get: featureCustomersGet } }), { get: featuresGet }),
        new: { get: newGet },
        expiring: { get: expiringGet },
        trend: { get: trendGet },
        tenure: { get: tenureGet },
        "connection-history": { get: connectionGet },
      },
    },
  },
  apiBaseUrl: "https://api.test",
}));
let permissions = ["insights.view"];
mock.module("@/lib/use-permissions", () => ({ usePermissions: () => permissions, usePermission: (k: string) => permissions.includes(k), PermissionsProvider: ({ children }: { children: React.ReactNode }) => children }));
mock.module("next/navigation", () => ({ useRouter: () => ({ replace, push: () => {} }), useSearchParams: () => new URLSearchParams(search) }));
mock.module("@/components/company-timezone-provider", () => ({ useCompanyTimezone: () => "Asia/Jakarta" }));
mock.module("sonner", () => ({ toast: { success: () => {}, error: toastError } }));

const real = await import("@/lib/insights");
mock.module("@/lib/insights", () => ({ ...real, downloadCsv: download }));

const { default: AdminInsightPage } = await import("./page");

beforeEach(() => {
  search = "";
  permissions = ["insights.view"];
  replace.mockClear();
  summaryGet.mockClear();
  customersGet.mockClear();
  download.mockClear();
  toastError.mockClear();
});

describe("Halaman Insight", () => {
  test("tanpa izin insights.view: pesan akses, tidak ada tab dan tidak ada panggilan API", async () => {
    permissions = ["users.view"];
    search = "tab=pelanggan";
    render(<AdminInsightPage />);
    expect(await screen.findByText(/tidak punya izin/)).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(customersGet).not.toHaveBeenCalled();
  });

  test("default = Ringkasan: kartu KPI (komersil/internal, terhubung, uang)", async () => {
    render(<AdminInsightPage />);
    expect(await screen.findByText("Akun komersil")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("15 / 20")).toBeTruthy();
    expect(screen.getByText(/2 pelanggan/)).toBeTruthy();
    expect(summaryGet).toHaveBeenCalledTimes(1);
    expect(customersGet).not.toHaveBeenCalled(); // hanya tab aktif yang memuat data
  });

  test("tab tak dikenal di URL → Ringkasan; mengklik tab mengganti URL", async () => {
    search = "tab=__proto__";
    render(<AdminInsightPage />);
    expect(await screen.findByText("Akun komersil")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Pelanggan" }));
    expect(replace).toHaveBeenCalledWith("/insight?tab=pelanggan");
  });

  test("Pelanggan: kontak, tombol WhatsApp hanya untuk nomor sah, lencana internal", async () => {
    search = "tab=pelanggan";
    render(<AdminInsightPage />);
    expect(await screen.findByText("Budi")).toBeTruthy();
    const wa = screen.getByRole("link", { name: "Chat WhatsApp Budi" });
    expect(wa.getAttribute("href")).toBe("https://wa.me/6281234567890");
    expect(wa.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByRole("link", { name: "Chat WhatsApp Sari" })).toBeNull(); // nomor tak sah → tanpa tombol
    expect(screen.getByText("081234567890")).toBeTruthy();
    expect(within(screen.getByText("Sari").closest("tr")!).getByText("Internal")).toBeTruthy(); // lencana di baris (bukan opsi filter)
    expect(customersGet.mock.calls[0]?.[0]).toMatchObject({ query: { type: "all", page: 0, pageSize: 20 } });
  });

  test("Lihat membuka dialog akses (Data Usaha + slot User Tambahan + tautan detail)", async () => {
    search = "tab=pelanggan";
    render(<AdminInsightPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Lihat Budi" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Toko Budi")).toBeTruthy();
    expect(within(dialog).getByText(/Andi · andi@test.local/)).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "detail pengguna" }).getAttribute("href")).toBe("/users/budi");
  });

  test("Akses: hanya pemilik (kind=pemilik) dengan ringkasan slot", async () => {
    search = "tab=akses";
    render(<AdminInsightPage />);
    expect((await screen.findAllByText("1 aktif · 1 diundang · 3 tersedia")).length).toBe(2);
    expect(customersGet.mock.calls[0]?.[0]).toMatchObject({ query: { kind: "pemilik" } });
  });

  test("Ekspor: unduhan berkredensial; galat kuota tampil sebagai toast", async () => {
    search = "tab=pelanggan";
    render(<AdminInsightPage />);
    await screen.findByText("Budi");
    await userEvent.click(screen.getByRole("button", { name: /Ekspor CSV/ }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(String(download.mock.calls[0]?.[0])).toBe("https://api.test/admin/insights/export/customers?type=all");

    download.mockImplementationOnce(async () => ({ ok: false as never, status: 429, code: "EXPORT_QUOTA_EXCEEDED" }) as never);
    await userEvent.click(screen.getByRole("button", { name: /Ekspor CSV/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0]?.[0]).toContain("batas ekspor");
  });

  test("galat API → pesan, bukan halaman kosong", async () => {
    customersGet.mockImplementationOnce(async () => ({ data: null, error: { status: 500 } }));
    search = "tab=pelanggan";
    render(<AdminInsightPage />);
    expect(await screen.findByText("Gagal memuat daftar pelanggan.")).toBeTruthy();
  });

  test("Fitur: jumlah pemakai per fitur; Lihat → pemakai dengan kontak, ekspor per fitur", async () => {
    search = "tab=fitur";
    render(<AdminInsightPage />);
    expect(await screen.findByText("Faktur Pembelian")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Lihat pemakai Faktur Pembelian" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Citra")).toBeTruthy();
    expect(within(dialog).getByText("CV Citra")).toBeTruthy();
    expect(within(dialog).getByText(/tanpa batas/)).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Chat WhatsApp Citra" }).getAttribute("href")).toBe("https://wa.me/6285711112222");
    await userEvent.click(within(dialog).getByRole("button", { name: /Ekspor CSV/ }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(String(download.mock.calls[0]?.[0])).toBe("https://api.test/admin/insights/export/feature-users?moduleKey=purchase_invoice");
  });

  test("Langganan › Baru: rentang default 30 hari dikirim ke API; ringkasan & lencana pelanggan baru; rentang terbalik tidak memanggil API", async () => {
    search = "tab=langganan";
    render(<AdminInsightPage />);
    expect(await screen.findByText("Dedi")).toBeTruthy();
    expect(screen.getByText("Pelanggan baru")).toBeTruthy();
    expect(screen.getByText(/1 pelanggan baru · 1 pelanggan memulai langganan · 2 langganan/)).toBeTruthy();
    const q = (newGet.mock.calls[0]?.[0] as { query: { from: string; to: string; page: number } }).query;
    expect(q.from <= q.to).toBe(true);
    expect(q.page).toBe(0);
    const callsBefore = newGet.mock.calls.length;
    const from = screen.getByLabelText("Dari tanggal");
    const to = screen.getByLabelText("Sampai tanggal");
    await userEvent.clear(to);
    await userEvent.type(to, "2020-01-01");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-01-01");
    expect(await screen.findByText(/tanggal akhir harus sama atau setelah tanggal awal/i)).toBeTruthy();
    expect(newGet.mock.calls.slice(callsBefore).every((c) => (c[0] as { query: { from: string; to: string } }).query.from <= (c[0] as { query: { from: string; to: string } }).query.to)).toBe(true);
  });

  test("Langganan › Akan berakhir: 30 hari default, ganti 14, status tagihan perpanjangan", async () => {
    search = "tab=langganan";
    render(<AdminInsightPage />);
    await userEvent.click(screen.getByRole("tab", { name: "Akan berakhir" }));
    expect(await screen.findByText("Eka")).toBeTruthy();
    expect(screen.getByText(/Tagihan sudah terbit/)).toBeTruthy();
    expect(screen.getByText("Belum terjadwal")).toBeTruthy();
    expect(expiringGet.mock.calls[0]?.[0]).toMatchObject({ query: { window: "30", page: 0 } });
    await userEvent.click(screen.getByRole("button", { name: "14 hari" }));
    await waitFor(() => expect(expiringGet.mock.calls.at(-1)?.[0]).toMatchObject({ query: { window: "14" } }));
  });

  test("Tren: tabel selisih/%, bulan depan '—' (bukan 0), rincian usia langganan bulan terakhir", async () => {
    search = "tab=tren";
    render(<AdminInsightPage />);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    const oct = rows.find((r) => within(r).queryByText("Okt 26"))!;
    expect(within(oct).getByText("+2")).toBeTruthy();
    expect(within(oct).getByText("+33,3%")).toBeTruthy();
    const nov = rows.find((r) => within(r).queryByText("Nov 26"))!;
    expect(within(nov).getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(within(nov).queryByRole("button", { name: /Rincian/ })).toBeNull(); // bulan depan tak punya rincian
    expect(await screen.findByText("Lanjutan tahun ke-1")).toBeTruthy();
    expect(screen.getByText("Tahun ke-2")).toBeTruthy();
    expect(tenureGet.mock.calls[0]?.[0]).toMatchObject({ query: { month: "2026-10" } });
    await userEvent.click(within(rows.find((r) => within(r).queryByText("Sep 26"))!).getByRole("button", { name: /Rincian/ }));
    await waitFor(() => expect(tenureGet.mock.calls.at(-1)?.[0]).toMatchObject({ query: { month: "2026-09" } }));
  });

  test("Tren: ?metric= dari tautan KPI dipakai sebagai metrik awal; nilai tak dikenal → aktif", async () => {
    search = "tab=tren&metric=money";
    render(<AdminInsightPage />);
    await screen.findByRole("table");
    expect(trendGet.mock.calls.at(-1)?.[0]).toMatchObject({ query: { metric: "money" } });
    expect((screen.getByLabelText("Metrik") as HTMLSelectElement).value).toBe("money");
  });
  test("Riwayat Koneksi: kalimat peristiwa, ringkasan koreksi; rentang separuh terisi tidak memanggil API", async () => {
    search = "tab=koneksi";
    render(<AdminInsightPage />);
    expect(await screen.findByText("Koneksi diputus admin")).toBeTruthy();
    expect(screen.getByText(/Alasan: Salah database/)).toBeTruthy();
    expect(screen.getByText("Memilih database yang lain")).toBeTruthy();
    expect(screen.getByText(/1 Data Usaha pernah dikoreksi/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chat WhatsApp Fani" }).getAttribute("href")).toBe("https://wa.me/6281300000000");
    const calls = connectionGet.mock.calls.length;
    await userEvent.type(screen.getByLabelText("Dari tanggal"), "2026-10-01");
    expect(await screen.findByText(/Isi tanggal awal dan akhir sekaligus/)).toBeTruthy();
    expect(connectionGet.mock.calls.length).toBe(calls);
  });
});
