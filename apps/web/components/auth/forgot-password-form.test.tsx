import { describe, test, expect, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const requestPasswordReset = mock(async () => ({ error: null }));

mock.module("@/lib/auth-client", () => ({
  authClient: { requestPasswordReset },
}));

const { ForgotPasswordForm } = await import("./forgot-password-form");

describe("ForgotPasswordForm", () => {
  test("submit email valid — panggil requestPasswordReset dgn redirectTo ke /reset-password, tampilkan pesan sukses generik", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByPlaceholderText("Email"), "user@test.local");
    await user.click(screen.getByRole("button", { name: "Kirim Link Reset Password" }));

    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith({
        email: "user@test.local",
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    );
    expect(
      await screen.findByText("Kalau email ini terdaftar, link untuk atur password baru sudah dikirim — cek inbox (atau folder spam) kamu."),
    ).toBeInTheDocument();
  });

  test("email kosong — validasi client-side, TIDAK panggil requestPasswordReset (§ gotcha type=email, lihat login-form.test.tsx)", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    requestPasswordReset.mockClear();

    await user.click(screen.getByRole("button", { name: "Kirim Link Reset Password" }));

    expect(await screen.findByText("Email tidak valid")).toBeInTheDocument();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});
