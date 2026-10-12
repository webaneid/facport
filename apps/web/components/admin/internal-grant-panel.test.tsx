import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 191 — panel Akses Internal: daftar Data Usaha dengan jumlah hibah, dialog pratinjau → hibah, cabut, galat NOT_INTERNAL.
type Res = { data: unknown; error: unknown };
const previewPost = mock(async (_b: unknown): Promise<Res> => ({
  data: { internal: true, modules: [{ key: "purchase_invoice", label: "Faktur Pembelian", status: "will_grant", replaces: 1 }, { key: "sales_invoice", label: "Faktur Penjualan", status: "will_grant", replaces: 0 }, { key: "other_deposit", label: "Penerimaan Bank/Kas", status: "already", replaces: 0 }, { key: "x", label: "X", status: "no_plan", replaces: 0 }] },
  error: null,
}));
const grantPost = mock(async (_b: unknown): Promise<Res> => ({ data: { ok: true, granted: ["purchase_invoice", "sales_invoice"] }, error: null }));
const revokePost = mock(async (_b: unknown): Promise<Res> => ({ data: { ok: true, revoked: 2 }, error: null }));
const toastSuccess = mock((_m: string) => {});
const toastError = mock((_m: string) => {});
mock.module("@/lib/api-client", () => ({ api: { admin: { users: () => ({ "internal-grant": Object.assign({ preview: { post: previewPost }, revoke: { post: revokePost } }, { post: grantPost }) }) } }, apiBaseUrl: "" }));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
const { InternalGrantPanel } = await import("./internal-grant-panel");

beforeEach(() => {
  previewPost.mockClear();
  grantPost.mockClear();
  revokePost.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});
const du = [{ id: "d1", name: "Toko A" }, { id: "d2", name: "Toko B" }];
const subs = [
  { subscriptionId: "s1", status: "active", internalGrant: true, dataUsahaId: "d1" },
  { subscriptionId: "s2", status: "active", internalGrant: true, dataUsahaId: "d1" },
  { subscriptionId: "s3", status: "cancelled", internalGrant: true, dataUsahaId: "d2" },
  { subscriptionId: "s4", status: "active", internalGrant: false, dataUsahaId: "d2" },
];

describe("InternalGrantPanel", () => {
  test("menghitung hibah aktif per Data Usaha; tombol Cabut hanya bila ada hibah aktif", () => {
    render(<InternalGrantPanel userId="u" dataUsaha={du} subscriptions={subs} onChanged={() => {}} />);
    expect(screen.getByText("2 fitur dihibahkan")).toBeTruthy();
    expect(screen.getByText("Belum ada hibah")).toBeTruthy(); // d2: hibah yang dibatalkan & langganan biasa tidak dihitung
    expect(screen.getAllByRole("button", { name: "Cabut hibah" })).toHaveLength(1);
  });

  test("Beri semua fitur → pratinjau (jumlah, digantikan) → Beri hibah memanggil API dan memuat ulang", async () => {
    const onChanged = mock(() => {});
    render(<InternalGrantPanel userId="u" dataUsaha={du} subscriptions={[]} onChanged={onChanged} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Beri semua fitur" })[0]!);
    expect(await screen.findByText(/akan dihibahkan; 1 sudah dihibahkan; 1 dilewati/)).toBeTruthy();
    expect(screen.getByText(/1 langganan aktif lain/)).toBeTruthy();
    expect(previewPost.mock.calls[0]?.[0]).toEqual({ dataUsahaId: "d1", moduleKeys: "all" });
    await userEvent.click(screen.getByRole("button", { name: "Beri hibah" }));
    await waitFor(() => expect(grantPost).toHaveBeenCalledTimes(1));
    expect(grantPost.mock.calls[0]?.[0]).toEqual({ dataUsahaId: "d1", moduleKeys: "all" });
    expect(toastSuccess.mock.calls[0]?.[0]).toBe("2 fitur dihibahkan tanpa tanggal akhir.");
    expect(onChanged).toHaveBeenCalled();
  });

  test("akun bukan internal (NOT_INTERNAL) → pesan ramah, tidak ada tombol hibah aktif", async () => {
    previewPost.mockImplementationOnce(async () => ({ data: null, error: { value: { code: "NOT_INTERNAL" } } }));
    render(<InternalGrantPanel userId="u" dataUsaha={du} subscriptions={[]} onChanged={() => {}} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Beri semua fitur" })[0]!);
    expect(await screen.findByText(/bukan akun internal/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Beri hibah" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("Cabut hibah memanggil API per Data Usaha dan memuat ulang", async () => {
    const onChanged = mock(() => {});
    render(<InternalGrantPanel userId="u" dataUsaha={du} subscriptions={subs} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "Cabut hibah" }));
    await waitFor(() => expect(revokePost).toHaveBeenCalledTimes(1));
    expect(revokePost.mock.calls[0]?.[0]).toEqual({ dataUsahaId: "d1" });
    expect(onChanged).toHaveBeenCalled();
  });
});
