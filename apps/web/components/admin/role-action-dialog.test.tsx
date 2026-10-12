import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189H, D17 — dialog aksi peran: pratinjau dampak, tombol aktif hanya setelah email diketik benar, galat server → toast ramah, noop tanpa konfirmasi.
type Res = { data: unknown; error: unknown };
const previewPost = mock(async (_b: unknown): Promise<Res> => ({
  data: { noop: false, rolesBefore: ["customer"], rolesAfter: ["customer", "staff"], becomesInternal: true, becomesCommercial: false, user: { email: "budi@test.local", name: "Budi" }, impact: { paidInvoiceCount: 2, paidTotal: 500000, unpaidInvoices: 0, activePaidSubscriptions: 1, scheduledRenewals: 0 } },
  error: null,
}));
const applyPost = mock(async (_b: unknown): Promise<Res> => ({ data: { ok: true, changed: true }, error: null }));
const toastError = mock((_m: string) => {});
const toastSuccess = mock((_m: string) => {});
mock.module("@/lib/api-client", () => ({ api: { admin: { users: () => ({ roles: { preview: { post: previewPost }, post: applyPost } }) } }, apiBaseUrl: "" }));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const { RoleActionDialog } = await import("./role-action-dialog");

beforeEach(() => {
  previewPost.mockClear();
  applyPost.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
});

describe("RoleActionDialog", () => {
  test("menampilkan dampak; tombol nonaktif sampai email diketik benar; terapkan memanggil API dengan konfirmasi", async () => {
    const onDone = mock(() => {});
    render(<RoleActionDialog open onOpenChange={() => {}} userId="u1" action="grant_staff" onDone={onDone} />);
    expect(await screen.findByText(/akan dihitung/)).toBeTruthy();
    expect(screen.getByText(/2 invoice lunas/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Jadikan Admin" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Konfirmasi email akun"), "BUDI@test.local");
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() => expect(applyPost).toHaveBeenCalledTimes(1));
    expect(applyPost.mock.calls[0]?.[0]).toEqual({ action: "grant_staff", confirm: "BUDI@test.local" });
    expect(onDone).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
  });

  test("galat server pada terapkan → toast pesan ramah, dialog tidak menutup lewat onDone", async () => {
    applyPost.mockImplementationOnce(async () => ({ data: null, error: { value: { code: "CANNOT_REMOVE_LAST_SUPER_ADMIN" } } }));
    const onDone = mock(() => {});
    render(<RoleActionDialog open onOpenChange={() => {}} userId="u1" action="grant_staff" onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText("Konfirmasi email akun"), "budi@test.local");
    await userEvent.click(screen.getByRole("button", { name: "Jadikan Admin" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0]?.[0]).toContain("Super Admin aktif terakhir");
    expect(onDone).not.toHaveBeenCalled();
  });

  test("pratinjau gagal (diri sendiri) → pesan galat, tanpa kolom konfirmasi", async () => {
    previewPost.mockImplementationOnce(async () => ({ data: null, error: { value: { code: "CANNOT_CHANGE_OWN_ROLE" } } }));
    render(<RoleActionDialog open onOpenChange={() => {}} userId="me" action="revoke_admin" onDone={() => {}} />);
    expect(await screen.findByText(/role akun Anda sendiri/)).toBeTruthy();
    expect(screen.queryByLabelText("Konfirmasi email akun")).toBeNull();
  });

  test("noop: pesan tidak ada perubahan dan tombol terapkan nonaktif", async () => {
    previewPost.mockImplementationOnce(async () => ({ data: { noop: true, rolesBefore: ["customer", "staff"], rolesAfter: ["customer", "staff"], becomesInternal: false, becomesCommercial: false, user: { email: "x@test.local", name: "X" }, impact: { paidInvoiceCount: 0, paidTotal: 0, unpaidInvoices: 0, activePaidSubscriptions: 0, scheduledRenewals: 0 } }, error: null }));
    render(<RoleActionDialog open onOpenChange={() => {}} userId="u" action="grant_staff" onDone={() => {}} />);
    expect(await screen.findByText(/Tidak ada yang berubah/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Jadikan Admin" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("kembali komersil: hibah akses internal yang akan dicabut ditampilkan", async () => {
    previewPost.mockImplementationOnce(async () => ({ data: { noop: false, rolesBefore: ["customer", "staff"], rolesAfter: ["customer"], becomesInternal: false, becomesCommercial: true, user: { email: "b@test.local", name: "B" }, impact: { paidInvoiceCount: 0, paidTotal: 0, unpaidInvoices: 0, activePaidSubscriptions: 0, scheduledRenewals: 0, activeInternalGrants: 3 } }, error: null }));
    render(<RoleActionDialog open onOpenChange={() => {}} userId="u" action="revoke_staff" onDone={() => {}} />);
    expect(await screen.findByText(/3 hibah akses internal/)).toBeTruthy();
  });
});
