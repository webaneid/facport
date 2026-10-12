import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189I — kartu Data Diri di /profile: Nama + Email (baca saja) + Perusahaan/Telepon/WhatsApp. Mock didaftarkan SEBELUM import komponen dan memuat
// ekspor yang dipakai tes lain (mock.module bocor lintas file di bun).
type Me = { name: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null };
type PatchResult = { data: unknown; error: { value?: { field?: string } } | null };

let me: Me;
const getMe = mock(async () => ({ data: me, error: null }));
const patchContact = mock(async (_body: unknown): Promise<PatchResult> => ({ data: { profileComplete: true }, error: null }));
const updateUser = mock(async (_body: unknown): Promise<{ error: { message?: string } | null }> => ({ error: null }));
const changePassword = mock(async () => ({ error: null }));

mock.module("@/lib/api-client", () => ({ api: { me: { get: getMe, contact: { patch: patchContact } } }, apiBaseUrl: "", markActiveDataUsahaSeen: () => {} }));
mock.module("@/lib/auth-client", () => ({
  authClient: {
    updateUser,
    changePassword,
    signOut: mock(async () => {}),
    signUp: { email: mock(async () => ({ error: null })) },
    signIn: { social: mock(async () => ({ error: null })) },
    sendVerificationEmail: mock(async () => ({ error: null })),
  },
}));

const { ProfileSettings } = await import("./profile-settings");

const filled: Me = { name: "Wawan Sugianto", email: "wasugi@gmail.com", companyName: "Webane Indonesia", phone: "+6285210626455", whatsapp: "+6285210626455" };

beforeEach(() => {
  cleanup();
  me = { ...filled };
  getMe.mockClear();
  patchContact.mockClear();
  updateUser.mockClear();
});

describe("ProfileSettings — Data Diri", () => {
  test("memuat nama, email (baca saja), perusahaan, dan telepon dari /me", async () => {
    render(<ProfileSettings />);
    expect(((await screen.findByLabelText("Nama")) as HTMLInputElement).value).toBe("Wawan Sugianto");
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("wasugi@gmail.com");
    expect(email.readOnly || email.disabled).toBe(true);
    expect((screen.getByLabelText("Nama Perusahaan") as HTMLInputElement).value).toBe("Webane Indonesia");
    expect((screen.getByLabelText("Nomor telepon") as HTMLInputElement).value).toContain("85210626455");
  });

  test("hanya nama berubah → updateUser dipanggil, kontak TIDAK dikirim", async () => {
    const user = userEvent.setup();
    render(<ProfileSettings />);
    const name = await screen.findByLabelText("Nama");
    await user.clear(name);
    await user.type(name, "Wawan S");
    await user.click(screen.getByRole("button", { name: "Simpan Data Diri" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ name: "Wawan S" }));
    expect(patchContact).not.toHaveBeenCalled();
    expect(await screen.findByText("Data diri tersimpan.")).toBeTruthy();
  });

  test("perusahaan berubah → PATCH /me/contact dengan tiga isian, nama tidak dikirim", async () => {
    const user = userEvent.setup();
    render(<ProfileSettings />);
    const company = await screen.findByLabelText("Nama Perusahaan");
    await user.clear(company);
    await user.type(company, "PT Baru");
    await user.click(screen.getByRole("button", { name: "Simpan Data Diri" }));
    await waitFor(() => expect(patchContact).toHaveBeenCalledWith({ companyName: "PT Baru", phone: "+6285210626455", whatsapp: "+6285210626455" }));
    expect(updateUser).not.toHaveBeenCalled();
  });

  test("perusahaan dikosongkan → galat validasi, tidak ada yang dikirim", async () => {
    const user = userEvent.setup();
    render(<ProfileSettings />);
    await user.clear(await screen.findByLabelText("Nama Perusahaan"));
    await user.click(screen.getByRole("button", { name: "Simpan Data Diri" }));
    expect(await screen.findByText("Nama perusahaan wajib diisi")).toBeTruthy();
    expect(patchContact).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  test("nama dikosongkan → galat 'Nama wajib diisi'", async () => {
    const user = userEvent.setup();
    render(<ProfileSettings />);
    await user.clear(await screen.findByLabelText("Nama"));
    await user.click(screen.getByRole("button", { name: "Simpan Data Diri" }));
    expect(await screen.findByText("Nama wajib diisi")).toBeTruthy();
    expect(updateUser).not.toHaveBeenCalled();
  });

  test("galat per-field dari server ditampilkan", async () => {
    patchContact.mockImplementationOnce(async () => ({ data: null, error: { value: { field: "phone" } } }));
    const user = userEvent.setup();
    render(<ProfileSettings />);
    const company = await screen.findByLabelText("Nama Perusahaan");
    await user.type(company, " X");
    await user.click(screen.getByRole("button", { name: "Simpan Data Diri" }));
    expect(await screen.findByText("Data ini tidak valid, periksa kembali.")).toBeTruthy();
  });

  test("kontak kosong dan tidak disentuh (akun admin) → hanya nama yang disimpan, tanpa galat", async () => {
    me = { ...filled, companyName: null, phone: null, whatsapp: null };
    const user = userEvent.setup();
    render(<ProfileSettings />);
    const name = await screen.findByLabelText("Nama");
    await user.type(name, "x");
    await user.click(screen.getByRole("button", { name: "Simpan Data Diri" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(patchContact).not.toHaveBeenCalled();
    expect(screen.queryByText("Nama perusahaan wajib diisi")).toBeNull();
  });

  test("kegagalan updateUser tidak menyembunyikan hasil kontak", async () => {
    updateUser.mockImplementationOnce(async () => ({ error: { message: "Gagal nama" } }));
    const user = userEvent.setup();
    render(<ProfileSettings />);
    const name = await screen.findByLabelText("Nama");
    await user.type(name, "x");
    const company = screen.getByLabelText("Nama Perusahaan");
    await user.type(company, "y");
    await user.click(screen.getByRole("button", { name: "Simpan Data Diri" }));
    expect(await screen.findByText("Gagal nama")).toBeTruthy();
    await waitFor(() => expect(patchContact).toHaveBeenCalled());
  });
});
