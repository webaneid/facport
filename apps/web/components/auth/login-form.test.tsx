import { describe, test, expect, mock } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 32 — mock WAJIB didaftarkan SEBELUM import komponen yang
// memakainya (`mock.module` Bun mengganti modul di module registry,
// tapi import statis di file INI sendiri di-hoist ke atas juga — taruh
// `mock.module(...)` SEBELUM baris `import { LoginForm }` di bawah,
// bukan setelahnya, supaya komponen yang di-import belakangan
// benar-benar dapat versi mock-nya, bukan modul asli yang keburu
// ter-resolve).
const signInEmail = mock(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
const routerPush = mock(() => {});
const routerRefresh = mock(() => {});

mock.module("@/lib/auth-client", () => ({
  authClient: { signIn: { email: signInEmail } },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const { LoginForm } = await import("./login-form");

describe("LoginForm", () => {
  test("submit dengan email/password valid — panggil authClient.signIn.email lalu redirect ke /", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Email"), "user@test.local");
    await user.type(screen.getByPlaceholderText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => expect(signInEmail).toHaveBeenCalledWith({ email: "user@test.local", password: "password123" }));
    expect(routerPush).toHaveBeenCalledWith("/");
  });

  test("email kosong — validasi client-side, TIDAK panggil authClient sama sekali", async () => {
    // § SENGAJA email dikosongkan (bukan diisi string acak seperti
    // "bukan-email") — `<input type="email">` punya constraint
    // validation BAWAAN BROWSER (happy-dom ikut mengimplementasikan):
    // value non-kosong yang gagal format email MEMBLOKIR event "submit"
    // TOTAL sebelum sempat sampai ke react-hook-form sama sekali (beda
    // dari native validation utk field KOSONG tanpa atribut `required`,
    // yang tetap lolos ke JS lalu baru ditolak Zod) — ketemu 2026-09-05,
    // dicatat di sini biar tidak terulang salah diagnosis lain kali.
    const user = userEvent.setup();
    render(<LoginForm />);
    signInEmail.mockClear();

    await user.type(screen.getByPlaceholderText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Email tidak valid")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  test("authClient balas error — tampilkan pesan generik, TIDAK redirect", async () => {
    signInEmail.mockImplementationOnce(async () => ({ error: { message: "invalid" } }));
    const user = userEvent.setup();
    render(<LoginForm />);
    routerPush.mockClear();

    await user.type(screen.getByPlaceholderText("Email"), "user@test.local");
    await user.type(screen.getByPlaceholderText("Password"), "salah");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Email atau password salah.")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  test("link 'Lupa password?' mengarah ke /forgot-password", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "Lupa password?" })).toHaveAttribute("href", "/forgot-password");
  });
});
