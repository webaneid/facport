import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189B, D7 — dialog cabut/pindahkan akses: alasan WAJIB (≥3 karakter), saran cepat hanya mengisi kolom, "pindahkan" butuh email sah; pesan galat server dipetakan.
type PostResult = { data: unknown; error: { value?: { code?: string } } | null };
const revokePost = mock(async (_b: unknown): Promise<PostResult> => ({ data: { ok: true, invited: false }, error: null }));
const toastSuccess = mock((_m: string) => {});

mock.module("@/lib/api-client", () => ({
  api: { admin: { "data-usaha": () => ({ seats: () => ({ revoke: { post: revokePost } }) }) } },
  apiBaseUrl: "",
  markActiveDataUsahaSeen: () => {},
}));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: () => {} } }));

const { RevokeSeatDialog } = await import("./revoke-seat-dialog");

beforeEach(() => {
  revokePost.mockClear();
  toastSuccess.mockClear();
});

async function openDialog() {
  const onDone = mock(() => {});
  const user = userEvent.setup();
  render(<RevokeSeatDialog dataUsahaId="du-1" seatId="seat-1" holderLabel="staf@test.local" onDone={onDone} />);
  await user.click(screen.getByRole("button", { name: "Cabut akses staf@test.local" }));
  await screen.findByRole("dialog");
  return { user, onDone };
}
const submitBtn = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("RevokeSeatDialog", () => {
  test("tombol terkunci sampai alasan ≥ 3 karakter (spasi saja tidak cukup)", async () => {
    const { user } = await openDialog();
    expect(submitBtn(/^Cabut akses$/).disabled).toBe(true);
    await user.type(screen.getByLabelText(/Alasan \(wajib\)/), "     ");
    expect(submitBtn(/^Cabut akses$/).disabled).toBe(true);
    await user.clear(screen.getByLabelText(/Alasan \(wajib\)/));
    await user.type(screen.getByLabelText(/Alasan \(wajib\)/), "ab");
    expect(submitBtn(/^Cabut akses$/).disabled).toBe(true);
    await user.type(screen.getByLabelText(/Alasan \(wajib\)/), "c");
    expect(submitBtn(/^Cabut akses$/).disabled).toBe(false);
  });

  test("saran cepat mengisi kolom alasan (tetap bisa diedit); kirim → alasan ter-trim, tanpa newEmail; sukses → toast + onDone", async () => {
    const { user, onDone } = await openDialog();
    await user.click(screen.getByRole("button", { name: "Karyawan resign" }));
    const textarea = screen.getByLabelText(/Alasan \(wajib\)/) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Karyawan resign tanpa serah terima akun");
    await user.type(textarea, " (dikonfirmasi WA)");
    await user.click(submitBtn(/^Cabut akses$/));

    await waitFor(() => expect(revokePost).toHaveBeenCalledTimes(1));
    expect(revokePost.mock.calls[0]![0]).toEqual({ reason: "Karyawan resign tanpa serah terima akun (dikonfirmasi WA)" });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(toastSuccess.mock.calls[0]![0]).toContain("Akses staf@test.local dicabut");
  });

  test("pindahkan ke email baru: wajib email sah; dikirim sebagai newEmail", async () => {
    const { user } = await openDialog();
    await user.type(screen.getByLabelText(/Alasan \(wajib\)/), "Pindah ke pengganti");
    await user.click(screen.getByRole("checkbox", { name: "Pindahkan ke email baru" }));
    const btn = () => submitBtn(/Cabut & undang pengganti/);
    expect(btn().disabled).toBe(true); // email pengganti belum diisi
    await user.type(screen.getByLabelText("Email pengganti"), "bukan-email");
    expect(btn().disabled).toBe(true);
    await user.clear(screen.getByLabelText("Email pengganti"));
    await user.type(screen.getByLabelText("Email pengganti"), "pengganti@test.local");
    expect(btn().disabled).toBe(false);
    await user.click(btn());
    await waitFor(() => expect(revokePost).toHaveBeenCalledTimes(1));
    expect(revokePost.mock.calls[0]![0]).toEqual({ reason: "Pindah ke pengganti", newEmail: "pengganti@test.local" });
    expect(toastSuccess.mock.calls[0]![0]).toContain("undangan dikirim ke pengganti@test.local");
  });

  test("galat server dipetakan ke pesan jelas; dialog tetap terbuka dan onDone tidak dipanggil", async () => {
    revokePost.mockResolvedValueOnce({ data: null, error: { value: { code: "SEAT_ALREADY_AVAILABLE" } } });
    const { user, onDone } = await openDialog();
    await user.type(screen.getByLabelText(/Alasan \(wajib\)/), "Resign");
    await user.click(submitBtn(/^Cabut akses$/));
    expect(await screen.findByRole("alert")).toHaveTextContent("sudah tersedia");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
