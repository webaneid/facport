import { describe, test, expect, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const resetPassword = mock(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
const routerPush = mock(() => {});
let mockSearchParams = new URLSearchParams();

mock.module("@/lib/auth-client", () => ({
  authClient: { resetPassword },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => mockSearchParams,
}));

const { ResetPasswordForm } = await import("./reset-password-form");

describe("ResetPasswordForm", () => {
  test("tanpa token di query string — tampilkan pesan link tidak valid, form TIDAK dirender", () => {
    mockSearchParams = new URLSearchParams();
    render(<ResetPasswordForm />);

    expect(screen.getByText(/Link reset password tidak valid/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Password Baru")).not.toBeInTheDocument();
  });

  test("dengan token — submit password valid & cocok, panggil resetPassword lalu redirect ke /login", async () => {
    mockSearchParams = new URLSearchParams({ token: "abc123" });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    routerPush.mockClear();

    await user.type(screen.getByPlaceholderText("Password Baru"), "password123");
    await user.type(screen.getByPlaceholderText("Konfirmasi Password Baru"), "password123");
    await user.click(screen.getByRole("button", { name: "Simpan Password Baru" }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ newPassword: "password123", token: "abc123" }));
    expect(routerPush).toHaveBeenCalledWith("/login");
  });

  test("konfirmasi password tidak cocok — validasi client-side, TIDAK panggil resetPassword", async () => {
    mockSearchParams = new URLSearchParams({ token: "abc123" });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    resetPassword.mockClear();

    await user.type(screen.getByPlaceholderText("Password Baru"), "password123");
    await user.type(screen.getByPlaceholderText("Konfirmasi Password Baru"), "beda-sekali");
    await user.click(screen.getByRole("button", { name: "Simpan Password Baru" }));

    expect(await screen.findByText("Konfirmasi password tidak cocok")).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  test("resetPassword balas error (token kadaluarsa) — tampilkan pesan, TIDAK redirect", async () => {
    mockSearchParams = new URLSearchParams({ token: "expired-token" });
    resetPassword.mockImplementationOnce(async () => ({ error: { message: "invalid" } }));
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    routerPush.mockClear();

    await user.type(screen.getByPlaceholderText("Password Baru"), "password123");
    await user.type(screen.getByPlaceholderText("Konfirmasi Password Baru"), "password123");
    await user.click(screen.getByRole("button", { name: "Simpan Password Baru" }));

    expect(await screen.findByText("Link sudah kadaluarsa atau tidak valid — minta link baru.")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
