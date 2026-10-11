import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189A, ADR-0044 — modal Lengkapi Profil: TIDAK bisa ditutup (tanpa X/ESC/klik luar), validasi sisi klien, simpan lewat PATCH /me/contact, refresh layout,
// dan Keluar. Mock didaftarkan SEBELUM import komponen; sertakan ekspor yang dipakai tes lain (mock.module bocor lintas file di bun).
type PatchResult = { data: unknown; error: { value?: { field?: string } } | null };
const patchContact = mock(async (_body: unknown): Promise<PatchResult> => ({ data: { profileComplete: true }, error: null }));
const signOut = mock(async () => {});
const push = mock((_: string) => {});
const refresh = mock(() => {});

mock.module("@/lib/api-client", () => ({ api: { me: { contact: { patch: patchContact } } }, apiBaseUrl: "", markActiveDataUsahaSeen: () => {} }));
mock.module("@/lib/auth-client", () => ({
  authClient: { signOut, signUp: { email: mock(async () => ({ error: null })) }, signIn: { social: mock(async () => ({ error: null })) }, sendVerificationEmail: mock(async () => ({ error: null })) },
}));
mock.module("next/navigation", () => ({ useRouter: () => ({ push, refresh }), useSearchParams: () => new URLSearchParams() }));

const { ProfileCompletionGate } = await import("./profile-completion-gate");

const empty = { companyName: "", phone: "", whatsapp: "" };

beforeEach(() => {
  patchContact.mockClear();
  signOut.mockClear();
  push.mockClear();
  refresh.mockClear();
});

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nama Perusahaan"), "PT Maju Jaya");
  await user.type(screen.getByLabelText("Nomor telepon"), "081234567890");
}

describe("ProfileCompletionGate", () => {
  test("tampil sebagai dialog tanpa tombol tutup; ESC dan klik di luar TIDAK menutupnya", async () => {
    const user = userEvent.setup();
    render(<ProfileCompletionGate initial={empty} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Lengkapi Profil Anda")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /tutup|close/i })).toBeNull();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Radix menonaktifkan pointer-events di body saat modal terbuka (userEvent menolak klik di sana) — kirim pointerdown di luar secara langsung.
    await new Promise((r) => setTimeout(r, 20)); // DismissableLayer memasang listener dokumen setelah satu tick
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.focusIn(document.body);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  test("kirim kosong → galat per isian, API TIDAK dipanggil", async () => {
    const user = userEvent.setup();
    render(<ProfileCompletionGate initial={empty} />);
    await user.click(await screen.findByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Nama perusahaan wajib diisi")).toBeTruthy();
    expect(screen.getByText(/Nomor telepon wajib/)).toBeTruthy();
    expect(patchContact).not.toHaveBeenCalled();
  });

  test("isian sah → PATCH /me/contact dengan E.164 (WhatsApp ikut telepon), layout di-refresh, modal hilang", async () => {
    const user = userEvent.setup();
    render(<ProfileCompletionGate initial={empty} />);
    await screen.findByRole("dialog");
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(patchContact).toHaveBeenCalledTimes(1));
    expect(patchContact.mock.calls[0]![0]).toEqual({ companyName: "PT Maju Jaya", phone: "+6281234567890", whatsapp: "+6281234567890" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("server menolak (422 INVALID_CONTACT, field phone) → pesan di isian itu, modal tetap terbuka", async () => {
    patchContact.mockResolvedValueOnce({ data: null, error: { value: { field: "phone" } } });
    const user = userEvent.setup();
    render(<ProfileCompletionGate initial={empty} />);
    await screen.findByRole("dialog");
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Data ini tidak valid, periksa kembali.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  test("galat umum server → pesan umum, modal tetap terbuka", async () => {
    patchContact.mockResolvedValueOnce({ data: null, error: {} });
    const user = userEvent.setup();
    render(<ProfileCompletionGate initial={empty} />);
    await screen.findByRole("dialog");
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal menyimpan");
  });

  test("data awal sebagian terisi ditampilkan; 'Keluar' memanggil signOut lalu ke /login", async () => {
    const user = userEvent.setup();
    render(<ProfileCompletionGate initial={{ companyName: "PT Lama", phone: "+628111111111", whatsapp: "" }} />);
    await screen.findByRole("dialog");
    expect((screen.getByLabelText("Nama Perusahaan") as HTMLInputElement).value).toBe("PT Lama");
    await user.click(screen.getByRole("button", { name: "Keluar" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});
