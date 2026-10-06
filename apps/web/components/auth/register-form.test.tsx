import { describe, test, expect, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § 2026-10-06 — daftar dengan email yang sudah terdaftar: server membalas 409 USER_ALREADY_EXISTS (dulu 500 "internal server error"); form menampilkan
// pesan jelas + Masuk / Lupa password / Kirim ulang email verifikasi. Mock didaftarkan SEBELUM import komponen (pola login-form.test.tsx).
type SignUpResult = { error: { message?: string; status?: number; code?: string } | null };
const signUpEmail = mock(async (): Promise<SignUpResult> => ({ error: null }));
const sendVerificationEmail = mock(async (_args: { email: string; callbackURL?: string }): Promise<{ error: { message: string } | null }> => ({ error: null }));

mock.module("@/lib/auth-client", () => ({
  authClient: { signUp: { email: signUpEmail }, signIn: { social: mock(async () => ({ error: null })) }, sendVerificationEmail },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { RegisterForm } = await import("./register-form");

async function fillAndSubmit() {
  const user = userEvent.setup();
  render(<RegisterForm />);
  await user.type(screen.getByPlaceholderText("Nama"), "Budi");
  await user.type(screen.getByPlaceholderText("Email"), "budi@test.local");
  await user.type(screen.getByPlaceholderText("Password"), "password123");
  await user.click(screen.getByRole("button", { name: "Daftar" }));
  return user;
}

describe("RegisterForm — email sudah terdaftar", () => {
  test("409 USER_ALREADY_EXISTS → pesan 'sudah terdaftar' + tautan Masuk & Lupa password (bukan 'internal server error'), bukan layar 'berhasil'", async () => {
    signUpEmail.mockResolvedValueOnce({ error: { status: 409, code: "USER_ALREADY_EXISTS", message: "Email ini sudah terdaftar." } });
    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("budi@test.local");
    expect(screen.getByRole("alert")).toHaveTextContent("sudah terdaftar");
    expect(screen.getByRole("link", { name: "Masuk" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Lupa password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByText(/Pendaftaran berhasil/)).toBeNull();
  });

  test("'Kirim ulang email verifikasi' memanggil authClient.sendVerificationEmail untuk email itu dan menampilkan konfirmasi", async () => {
    signUpEmail.mockResolvedValueOnce({ error: { status: 409, code: "USER_ALREADY_EXISTS" } });
    const user = await fillAndSubmit();

    await user.click(await screen.findByRole("button", { name: "Kirim ulang email verifikasi" }));
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalled());
    expect(sendVerificationEmail.mock.calls[0]![0]).toMatchObject({ email: "budi@test.local" });
    expect(await screen.findByText(/link verifikasi baru sudah dikirim/)).toBeTruthy();
  });

  test("error lain tetap tampil sebagai teks error biasa; sukses tetap layar 'Pendaftaran berhasil'", async () => {
    signUpEmail.mockResolvedValueOnce({ error: { status: 400, message: "Password terlalu pendek" } });
    await fillAndSubmit();
    expect(await screen.findByText("Password terlalu pendek")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
