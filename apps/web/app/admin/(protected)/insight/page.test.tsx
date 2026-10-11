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
const download = mock(async (..._a: unknown[]) => ({ ok: true as const, rows: 2, truncated: false, filename: "x.csv" }));
const toastError = mock((_m: string) => {});

mock.module("@/lib/api-client", () => ({
  api: { admin: { insights: { summary: { get: summaryGet }, customers: Object.assign(() => ({ access: { get: accessGet } }), { get: customersGet }) } } },
  apiBaseUrl: "https://api.test",
}));
mock.module("next/navigation", () => ({ useRouter: () => ({ replace, push: () => {} }), useSearchParams: () => new URLSearchParams(search) }));
mock.module("@/components/company-timezone-provider", () => ({ useCompanyTimezone: () => "Asia/Jakarta" }));
mock.module("sonner", () => ({ toast: { success: () => {}, error: toastError } }));

const real = await import("@/lib/insights");
mock.module("@/lib/insights", () => ({ ...real, downloadCsv: download }));

const { default: AdminInsightPage } = await import("./page");

beforeEach(() => {
  search = "";
  replace.mockClear();
  summaryGet.mockClear();
  customersGet.mockClear();
  download.mockClear();
  toastError.mockClear();
});

describe("Halaman Insight", () => {
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
    expect(customersGet.mock.calls[0]?.[0]).toMatchObject({ query: { type: "all", page: 1, pageSize: 20 } });
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
});
