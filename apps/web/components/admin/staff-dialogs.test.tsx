import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 216, ADR-0053 — dialog ubah tingkat staf & reset kata sandi: pratinjau dulu, tombol aktif hanya setelah email target diketik benar, sandi sementara tampil sekali, galat server dipetakan.
type Res = { data: unknown; error: unknown };
const preview = { user: { id: "s1", name: "Sari", email: "sari@test.local", disabled: false }, noop: false, rolesBefore: ["staff"], rolesAfter: ["admin"], promotes: true, demotes: false, activeSuperAdmins: 2, blockedLastSuperAdmin: false };
const previewPost = mock(async (_b: unknown): Promise<Res> => ({ data: preview, error: null }));
const rolePost = mock(async (_b: unknown): Promise<Res> => ({ data: { ok: true, changed: true, roles: ["admin"] }, error: null }));
const resetPost = mock(async (_b: unknown): Promise<Res> => ({ data: { email: "sari@test.local", tempPassword: "Sementara-ABC123" }, error: null }));
const toastSuccess = mock((_m: string) => {});
const toastError = mock((_m: string) => {});
mock.module("@/lib/api-client", () => ({
  api: { admin: { staff: (_a: { id: string }) => ({ role: { preview: { post: previewPost }, post: rolePost }, "reset-password": { post: resetPost } }) } },
  apiBaseUrl: "",
}));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
const { StaffRoleDialog } = await import("./staff-role-dialog");
const { StaffResetPasswordDialog } = await import("./staff-reset-password-dialog");

beforeEach(() => {
  previewPost.mockClear();
  rolePost.mockClear();
  resetPost.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("StaffRoleDialog", () => {
  test("pratinjau → tombol nonaktif sampai email benar → terapkan mengirim role & confirm", async () => {
    const onDone = mock(() => {});
    render(<StaffRoleDialog open onOpenChange={() => {}} staffId="s1" targetRole="admin" onDone={onDone} />);
    expect(await screen.findByText(/Role sekarang/)).toBeTruthy();
    expect(previewPost.mock.calls[0]?.[0]).toEqual({ role: "admin" });
    const button = screen.getByRole("button", { name: "Jadikan Super Admin" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Konfirmasi email akun"), "salah@test.local");
    expect(button.disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText("Konfirmasi email akun"));
    await userEvent.type(screen.getByLabelText("Konfirmasi email akun"), "SARI@test.local");
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() => expect(rolePost).toHaveBeenCalledTimes(1));
    expect(rolePost.mock.calls[0]?.[0]).toEqual({ role: "admin", confirm: "SARI@test.local" });
    expect(toastSuccess.mock.calls[0]?.[0]).toBe("Akun kini berperan Super Admin.");
    expect(onDone).toHaveBeenCalled();
  });

  test("Super Admin terakhir: peringatan tampil dan tidak ada kolom konfirmasi (tombol tetap nonaktif)", async () => {
    previewPost.mockImplementationOnce(async () => ({ data: { ...preview, rolesBefore: ["admin"], rolesAfter: ["staff"], promotes: false, demotes: true, activeSuperAdmins: 1, blockedLastSuperAdmin: true }, error: null }));
    render(<StaffRoleDialog open onOpenChange={() => {}} staffId="s1" targetRole="staff" onDone={() => {}} />);
    expect(await screen.findByText(/Super Admin aktif terakhir/)).toBeTruthy();
    expect(screen.queryByLabelText("Konfirmasi email akun")).toBeNull();
    expect((screen.getByRole("button", { name: "Jadikan Admin" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("galat pratinjau dipetakan ke pesan Indonesia", async () => {
    previewPost.mockImplementationOnce(async () => ({ data: null, error: { value: { code: "CANNOT_CHANGE_OWN_ROLE" } } }));
    render(<StaffRoleDialog open onOpenChange={() => {}} staffId="s1" targetRole="admin" onDone={() => {}} />);
    expect(await screen.findByText(/tidak dapat mengubah role akun Anda sendiri/)).toBeTruthy();
  });

  test("galat saat terapkan → toast galat, dialog tidak ditutup", async () => {
    rolePost.mockImplementationOnce(async () => ({ data: null, error: { value: { code: "CONFIRM_MISMATCH" } } }));
    const onDone = mock(() => {});
    render(<StaffRoleDialog open onOpenChange={() => {}} staffId="s1" targetRole="admin" onDone={onDone} />);
    await screen.findByText(/Role sekarang/);
    await userEvent.type(screen.getByLabelText("Konfirmasi email akun"), "sari@test.local");
    await userEvent.click(screen.getByRole("button", { name: "Jadikan Super Admin" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0]?.[0]).toBe("Email konfirmasi tidak cocok.");
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("StaffResetPasswordDialog", () => {
  test("ketik email → reset → sandi sementara tampil sekali dengan peringatan", async () => {
    render(<StaffResetPasswordDialog open onOpenChange={() => {}} staffId="s1" email="sari@test.local" />);
    const button = screen.getByRole("button", { name: "Reset kata sandi" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Konfirmasi email akun"), "sari@test.local");
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() => expect(resetPost).toHaveBeenCalledTimes(1));
    expect(resetPost.mock.calls[0]?.[0]).toEqual({ confirm: "sari@test.local" });
    expect(await screen.findByText("Sementara-ABC123")).toBeTruthy();
    expect(screen.getByText(/tidak akan ditampilkan lagi/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset kata sandi" })).toBeNull();
  });

  test("akun tanpa kata sandi (Google) → pesan jelas, tidak ada sandi ditampilkan", async () => {
    resetPost.mockImplementationOnce(async () => ({ data: null, error: { value: { code: "NO_PASSWORD_LOGIN" } } }));
    render(<StaffResetPasswordDialog open onOpenChange={() => {}} staffId="s1" email="sari@test.local" />);
    await userEvent.type(screen.getByLabelText("Konfirmasi email akun"), "sari@test.local");
    await userEvent.click(screen.getByRole("button", { name: "Reset kata sandi" }));
    expect(await screen.findByText(/masuk lewat Google/)).toBeTruthy();
    expect(screen.queryByText(/Sementara-/)).toBeNull();
  });
});
