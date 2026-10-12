import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189H, ADR-0045 — dialog hapus/anonimisasi massal: akun yang dilewati beserta alasan, tombol aktif hanya setelah alasan + kata konfirmasi benar, galat server → toast.
type Res = { data: unknown; error: unknown };
const preview = {
  requested: 3, eligible: 2, missing: 0, confirmWord: "HAPUS",
  blocked: [{ id: "x", name: "Budi Berinvoice", email: "b@test.local", reasons: [{ code: "HAS_RECORDS", tables: ["invoices", "subscriptions"] }] }],
};
const previewPost = mock(async (_b: unknown): Promise<Res> => ({ data: preview, error: null }));
const erasePost = mock(async (_b: unknown): Promise<Res> => ({ data: { done: 2, skipped: [], missing: 0 }, error: null }));
const toastSuccess = mock((_m: string) => {});
const toastError = mock((_m: string) => {});
mock.module("@/lib/api-client", () => ({ api: { admin: { users: { erase: Object.assign({ preview: { post: previewPost } }, { post: erasePost }) } } }, apiBaseUrl: "" }));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
const { BulkEraseDialog } = await import("./bulk-erase-dialog");

beforeEach(() => {
  previewPost.mockClear();
  erasePost.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("BulkEraseDialog", () => {
  test("pratinjau: jumlah layak + akun dilewati dengan alasan; tombol nonaktif sampai alasan & kata benar; terapkan mengirim kind/confirm/reason", async () => {
    const onDone = mock(() => {});
    render(<BulkEraseDialog open onOpenChange={() => {}} userIds={["a", "b", "x"]} kind="delete" onDone={onDone} />);
    expect(await screen.findByText(/akan dihapus permanen/)).toBeTruthy();
    expect(screen.getByText(/Budi Berinvoice/)).toBeTruthy();
    expect(screen.getByText(/punya catatan bisnis: invoice, langganan/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Hapus permanen" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Konfirmasi kata"), "hapus"); // huruf kecil → belum cocok
    await userEvent.type(screen.getByLabelText("Alasan"), "akun uji");
    expect(button.disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText("Konfirmasi kata"));
    await userEvent.type(screen.getByLabelText("Konfirmasi kata"), "HAPUS");
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() => expect(erasePost).toHaveBeenCalledTimes(1));
    expect(erasePost.mock.calls[0]?.[0]).toEqual({ kind: "delete", userIds: ["a", "b", "x"], confirm: "HAPUS", reason: "akun uji" });
    expect(toastSuccess.mock.calls[0]?.[0]).toBe("2 akun dihapus permanen.");
    expect(onDone).toHaveBeenCalled();
  });

  test("anonimisasi memakai kata ANONIMKAN; tidak ada akun layak → tombol tetap nonaktif", async () => {
    previewPost.mockImplementationOnce(async () => ({ data: { ...preview, eligible: 0, confirmWord: "ANONIMKAN" }, error: null }));
    render(<BulkEraseDialog open onOpenChange={() => {}} userIds={["x"]} kind="anonymize" onDone={() => {}} />);
    await screen.findByText(/akan dianonimkan/);
    await userEvent.type(screen.getByLabelText("Konfirmasi kata"), "ANONIMKAN");
    await userEvent.type(screen.getByLabelText("Alasan"), "permintaan pelanggan");
    expect((screen.getByRole("button", { name: "Anonimkan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("galat server → toast galat dan onDone tidak dipanggil", async () => {
    erasePost.mockImplementationOnce(async () => ({ data: null, error: { status: 400 } }));
    const onDone = mock(() => {});
    render(<BulkEraseDialog open onOpenChange={() => {}} userIds={["a"]} kind="delete" onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText("Konfirmasi kata"), "HAPUS");
    await userEvent.type(screen.getByLabelText("Alasan"), "uji");
    await userEvent.click(screen.getByRole("button", { name: "Hapus permanen" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });
});
