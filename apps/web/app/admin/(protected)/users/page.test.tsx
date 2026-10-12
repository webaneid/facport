import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189G, ADR-0044 — halaman Pengguna admin: lencana internal, filter tipe, pilih baris + bilah aksi massal (hanya `users.manage`), dialog dampak, muat ulang.
type Row = {
  id: string; name: string; email: string; emailVerified: boolean; disabled: boolean; createdAt: string; companyName: string | null; phone: string | null; whatsapp: string | null;
  isInternal: boolean; internalFlag: boolean; internalReason: "role" | "flag" | null; roles: string[]; activeSubscriptions: unknown[];
};
const row = (over: Partial<Row>): Row => ({
  id: "u", name: "User", email: "u@test.local", emailVerified: true, disabled: false, createdAt: "2026-10-01T00:00:00.000Z", companyName: null, phone: null, whatsapp: null,
  isInternal: false, internalFlag: false, internalReason: null, roles: ["customer"], activeSubscriptions: [], ...over,
});
const budi = row({ id: "budi", name: "Budi Komersil", email: "budi@test.local", companyName: "PT Budi" });
const sari = row({ id: "sari", name: "Sari Trainer", email: "sari@test.local", isInternal: true, internalFlag: true, internalReason: "flag" });
const dewi = row({ id: "dewi", name: "Dewi Admin", email: "dewi@test.local", isInternal: true, internalReason: "role", roles: ["customer", "admin"] });

let permissions = ["users.view", "users.manage", "subscriptions.manage"];
const usersGet = mock(async (_arg: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: { users: [budi, sari, dewi], total: 3 }, error: null }));
const previewPost = mock(async (_b: unknown): Promise<{ data: unknown; error: unknown }> => ({
  data: { requested: 1, found: 1, notFound: 0, flagChanges: 1, becomeInternal: 1, becomeCommercial: 0, alreadyInState: 0, internalByRole: 0, impact: { paidInvoiceCount: 0, paidTotal: 0, unpaidInvoices: 0, activePaidSubscriptions: 0, scheduledRenewals: 0 } },
  error: null,
}));
const applyPost = mock(async (_b: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: { changed: 1 }, error: null }));

mock.module("@/lib/api-client", () => ({
  api: {
    admin: {
      users: Object.assign(() => ({ subscriptions: { get: async () => ({ data: { subscriptions: [] }, error: null }) } }), { get: usersGet, internal: { post: applyPost, preview: { post: previewPost } } }),
      plans: { get: async () => ({ data: { plans: [] }, error: null }) },
      "data-usaha": { get: async () => ({ data: { dataUsaha: [] }, error: null }) },
    },
  },
  apiBaseUrl: "",
  markActiveDataUsahaSeen: () => {},
}));
mock.module("@/lib/use-permissions", () => ({
  usePermissions: () => permissions,
  usePermission: (key: string) => permissions.includes(key),
  PermissionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
mock.module("@/components/company-timezone-provider", () => ({ useCompanyTimezone: () => "Asia/Jakarta" }));
mock.module("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));
mock.module("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));

const { default: AdminUsersPage } = await import("./page");

beforeEach(() => {
  permissions = ["users.view", "users.manage", "subscriptions.manage"];
  usersGet.mockClear();
  previewPost.mockClear();
  applyPost.mockClear();
});

describe("AdminUsersPage — akun internal", () => {
  test("lencana: flag 'Internal', role 'Internal · admin'; komersil tanpa lencana; perusahaan tampil di bawah nama", async () => {
    render(<AdminUsersPage />);
    expect(await screen.findByText("Budi Komersil")).toBeTruthy();
    // "Internal" juga teks tab filter → lencana dicari lewat title-nya
    expect(screen.getByTitle("Ditandai internal oleh Super Admin").textContent).toBe("Internal");
    expect(screen.getByText("Internal · admin")).toBeTruthy();
    expect(screen.getAllByTitle(/internal|role/i)).toHaveLength(2); // hanya Sari (flag) dan Dewi (role); Budi komersil tanpa lencana
    expect(screen.getByText("PT Budi")).toBeTruthy();
  });

  test("pilih baris → bilah aksi massal muncul; 'Tandai internal' membuka dialog dampak untuk akun terpilih; terapkan → API, pilihan dibersihkan, daftar dimuat ulang", async () => {
    const user = userEvent.setup();
    render(<AdminUsersPage />);
    await screen.findByText("Budi Komersil");
    expect(screen.queryByRole("region", { name: "Aksi massal" })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Pilih Budi Komersil" }));
    const bar = screen.getByRole("region", { name: "Aksi massal" });
    expect(within(bar).getByText("akun dipilih").parentElement?.textContent).toContain("1");

    await user.click(within(bar).getByRole("button", { name: "Tandai internal" }));
    await waitFor(() => expect(previewPost).toHaveBeenCalledTimes(1));
    expect(previewPost.mock.calls[0]![0]).toEqual({ userIds: ["budi"], isInternal: true });

    const dialog = await screen.findByRole("dialog");
    const callsBefore = usersGet.mock.calls.length;
    await waitFor(() => expect((within(dialog).getByRole("button", { name: "Tandai internal" }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(within(dialog).getByRole("button", { name: "Tandai internal" }));
    await waitFor(() => expect(applyPost).toHaveBeenCalledTimes(1));
    expect(applyPost.mock.calls[0]![0]).toEqual({ userIds: ["budi"], isInternal: true });
    await waitFor(() => expect(usersGet.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Aksi massal" })).toBeNull());
  });

  test("centang-semua memilih seluruh baris halaman; 'Batal pilih' membersihkan", async () => {
    const user = userEvent.setup();
    render(<AdminUsersPage />);
    await screen.findByText("Budi Komersil");
    await user.click(screen.getByRole("checkbox", { name: "Pilih semua pengguna di halaman ini" }));
    const bar = screen.getByRole("region", { name: "Aksi massal" });
    expect(bar.textContent).toContain("3");
    await user.click(within(bar).getByRole("button", { name: "Batal pilih" }));
    expect(screen.queryByRole("region", { name: "Aksi massal" })).toBeNull();
  });

  test("filter tipe: tab 'Internal' memuat ulang dengan type=internal", async () => {
    const user = userEvent.setup();
    render(<AdminUsersPage />);
    await screen.findByText("Budi Komersil");
    await user.click(screen.getByRole("tab", { name: "Internal" }));
    await waitFor(() => expect(usersGet.mock.calls.some((c) => (c[0] as { query: { type?: string } }).query.type === "internal")).toBe(true));
  });

  test("tanpa izin users.manage (Admin terbatas): tidak ada kotak centang dan tidak ada bilah aksi massal", async () => {
    permissions = ["users.view"];
    render(<AdminUsersPage />);
    await screen.findByText("Budi Komersil");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("region", { name: "Aksi massal" })).toBeNull();
    expect(screen.getByTitle("Ditandai internal oleh Super Admin")).toBeTruthy(); // lencana tetap terlihat
  });

  test("dialog Kelola Langganan: akun INTERNAL hanya ditawari mode Gratis + keterangan; akun komersil tetap melihat 'Sudah dibayar'", async () => {
    const user = userEvent.setup();
    render(<AdminUsersPage />);
    await screen.findByText("Budi Komersil");

    await user.click(screen.getByRole("button", { name: "Kelola langganan Sari Trainer" }));
    const internalDialog = await screen.findByRole("dialog");
    expect(await within(internalDialog).findByText(/Akun ini internal: tidak ditagih dan tidak ada invoice/)).toBeTruthy();
    expect(within(internalDialog).getByText("Gratis (tanpa invoice)")).toBeTruthy();
    expect(within(internalDialog).queryByText("Sudah dibayar")).toBeNull();
    expect(within(internalDialog).queryByText("Kirim invoice")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Kelola langganan Budi Komersil" }));
    const commercialDialog = await screen.findByRole("dialog");
    expect(await within(commercialDialog).findByText("Sudah dibayar")).toBeTruthy();
    expect(within(commercialDialog).queryByText(/Akun ini internal/)).toBeNull();
  });
});
