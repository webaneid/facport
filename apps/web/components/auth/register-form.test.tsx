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

// § Fase 189A, ADR-0044 — Nama Perusahaan + Telepon (+ WhatsApp, ikut telepon lewat kotak centang) wajib saat daftar email.
async function fillAndSubmit({ withContact = true }: { withContact?: boolean } = {}) {
  const user = userEvent.setup();
  render(<RegisterForm />);
  await user.type(screen.getByPlaceholderText("Nama"), "Budi");
  await user.type(screen.getByPlaceholderText("Email"), "budi@test.local");
  await user.type(screen.getByPlaceholderText("Password"), "password123");
  if (withContact) {
    await user.type(screen.getByPlaceholderText("Nama Perusahaan"), "PT Budi Jaya");
    await user.type(screen.getByLabelText("Nomor telepon"), "081234567890");
  }
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

describe("RegisterForm — kontak akun (Fase 189A)", () => {
  test("kontak ikut dikirim ke signUp.email dalam E.164, WhatsApp = telepon (kotak centang bawaan)", async () => {
    signUpEmail.mockClear();
    await fillAndSubmit();
    await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
    expect((signUpEmail.mock.calls[0] as unknown[])[0]).toMatchObject({
      name: "Budi",
      email: "budi@test.local",
      companyName: "PT Budi Jaya",
      phone: "+6281234567890",
      whatsapp: "+6281234567890",
    });
    expect(await screen.findByText(/Pendaftaran berhasil/)).toBeTruthy();
  });

  test("kontak kosong → signUp TIDAK dipanggil dan galat tampil per isian", async () => {
    signUpEmail.mockClear();
    await fillAndSubmit({ withContact: false });
    expect(await screen.findByText("Nama perusahaan wajib diisi")).toBeTruthy();
    expect(screen.getByText(/Nomor telepon wajib/)).toBeTruthy();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  test("server menolak kontak (422 INVALID_CONTACT, field phone) → pesan di isian, bukan layar berhasil", async () => {
    signUpEmail.mockResolvedValueOnce({ error: { status: 422, code: "INVALID_CONTACT", field: "phone" } as { status: number; code: string } });
    await fillAndSubmit();
    expect(await screen.findByText("Data ini tidak valid, periksa kembali.")).toBeTruthy();
    expect(screen.queryByText(/Pendaftaran berhasil/)).toBeNull();
  });
});
