import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189G, ADR-0044 — dialog dampak tandai/cabut internal: pratinjau lebih dulu, persetujuan wajib bila ada uang lunas / perpanjangan terjadwal terdampak, lalu terapkan.
type Impact = { paidInvoiceCount: number; paidTotal: number; unpaidInvoices: number; activePaidSubscriptions: number; scheduledRenewals: number };
const noImpact: Impact = { paidInvoiceCount: 0, paidTotal: 0, unpaidInvoices: 0, activePaidSubscriptions: 0, scheduledRenewals: 0 };
const makePreview = (over: Record<string, unknown> = {}, impact: Impact = noImpact) => ({
  requested: 2, found: 2, notFound: 0, flagChanges: 2, becomeInternal: 2, becomeCommercial: 0, alreadyInState: 0, internalByRole: 0, impact, ...over,
});

const previewPost = mock(async (_b: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: makePreview(), error: null }));
const applyPost = mock(async (_b: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: { changed: 2 }, error: null }));
const toastSuccess = mock((_m: string) => {});
const toastError = mock((_m: string) => {});

mock.module("@/lib/api-client", () => ({
  api: { admin: { users: { internal: { post: applyPost, preview: { post: previewPost } } } } },
  apiBaseUrl: "",
  markActiveDataUsahaSeen: () => {},
}));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const { InternalAccountsDialog } = await import("./internal-accounts-dialog");

beforeEach(() => {
  previewPost.mockClear();
  applyPost.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

function open(props: Partial<{ isInternal: boolean; userIds: string[] }> = {}) {
  const onDone = mock(() => {});
  const onOpenChange = mock((_: boolean) => {});
  render(<InternalAccountsDialog open onOpenChange={onOpenChange} userIds={props.userIds ?? ["a", "b"]} isInternal={props.isInternal ?? true} onDone={onDone} />);
  return { onDone, onOpenChange };
}

describe("InternalAccountsDialog", () => {
  test("memanggil pratinjau dengan akun + arah, menampilkan ringkasan; tanpa dampak uang → tombol langsung aktif, tanpa kotak persetujuan", async () => {
    open();
    await waitFor(() => expect(previewPost).toHaveBeenCalledTimes(1));
    expect(previewPost.mock.calls[0]![0]).toEqual({ userIds: ["a", "b"], isInternal: true });
    expect(await screen.findByText(/akun komersil akan menjadi internal/)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Saya memahami dampak ini" })).toBeNull();
    await waitFor(() => expect((screen.getByRole("button", { name: "Tandai internal" }) as HTMLButtonElement).disabled).toBe(false));
  });

  test("ada invoice lunas / perpanjangan terjadwal → dampak ditampilkan dan tombol terkunci sampai persetujuan dicentang; terapkan → API, toast, onDone", async () => {
    previewPost.mockResolvedValueOnce({ data: makePreview({}, { paidInvoiceCount: 3, paidTotal: 450_000, unpaidInvoices: 1, activePaidSubscriptions: 2, scheduledRenewals: 1 }), error: null });
    const user = userEvent.setup();
    const { onDone, onOpenChange } = open();
    expect(await screen.findByText(/3 invoice lunas/)).toBeTruthy();
    expect(screen.getByText(/akan KELUAR dari/)).toBeTruthy();
    expect(screen.getByText(/1 langganan terjadwal perpanjangan tidak akan ditagih lagi/)).toBeTruthy();
    expect(screen.getByText(/1 invoice belum dibayar tetap ada/)).toBeTruthy();

    const apply = screen.getByRole("button", { name: "Tandai internal" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "Saya memahami dampak ini" }));
    expect(apply.disabled).toBe(false);
    await user.click(apply);

    await waitFor(() => expect(applyPost).toHaveBeenCalledTimes(1));
    expect(applyPost.mock.calls[0]![0]).toEqual({ userIds: ["a", "b"], isInternal: true });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSuccess.mock.calls[0]![0]).toContain("2 akun ditandai internal");
  });

  test("arah cabut tanda: teks komersil, uang MASUK kembali ke laporan, tanpa kotak persetujuan wajib", async () => {
    previewPost.mockResolvedValueOnce({ data: makePreview({ becomeInternal: 0, becomeCommercial: 2 }, { ...noImpact, paidInvoiceCount: 2, paidTotal: 100_000, scheduledRenewals: 1 }), error: null });
    open({ isInternal: false });
    expect(await screen.findByText(/akun internal akan kembali komersil/)).toBeTruthy();
    expect(screen.getByText(/akan MASUK kembali ke/)).toBeTruthy();
    expect(screen.getByText(/akan kembali ditagih otomatis/)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Saya memahami dampak ini" })).toBeNull();
    expect((screen.getByRole("button", { name: "Cabut tanda" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("tidak ada yang berubah (semua sudah di status itu) → tombol terkunci + keterangan; akun role admin dijelaskan", async () => {
    previewPost.mockResolvedValueOnce({ data: makePreview({ flagChanges: 0, becomeInternal: 0, alreadyInState: 1, internalByRole: 1 }), error: null });
    open();
    expect(await screen.findByText("Tidak ada perubahan yang perlu disimpan.")).toBeTruthy();
    expect(screen.getByText(/tetap internal karena memegang role Admin/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Tandai internal" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("pratinjau gagal → pesan galat, tombol terapkan terkunci; terapkan gagal → toast error, dialog tidak ditutup", async () => {
    previewPost.mockResolvedValueOnce({ data: null, error: { status: 500 } });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal memuat pratinjau");
    expect((screen.getByRole("button", { name: "Tandai internal" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("terapkan gagal di server → toast error dan onDone TIDAK dipanggil", async () => {
    applyPost.mockResolvedValueOnce({ data: null, error: { status: 500 } });
    const user = userEvent.setup();
    const { onDone } = open();
    await screen.findByText(/akun komersil akan menjadi internal/);
    await user.click(screen.getByRole("button", { name: "Tandai internal" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });
});
