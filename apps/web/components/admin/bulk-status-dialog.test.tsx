import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189H (bagian 2) — dialog nonaktifkan/aktifkan massal: ringkasan pratinjau, akun terblokir, tombol nonaktif bila tidak ada yang berubah, hasil terapkan.
type Res = { data: unknown; error: unknown };
const base = { requested: 3, found: 3, willChange: 2, notFound: 0, alreadyInState: 1, blockedSelf: 0, blockedLastSuperAdmin: 0 };
const previewPost = mock(async (_b: unknown): Promise<Res> => ({ data: base, error: null }));
const applyPost = mock(async (_b: unknown): Promise<Res> => ({ data: { ...base, changed: 2 }, error: null }));
const toastSuccess = mock((_m: string) => {});
const toastError = mock((_m: string) => {});
mock.module("@/lib/api-client", () => ({ api: { admin: { users: { status: Object.assign({ preview: { post: previewPost } }, { post: applyPost }) } } }, apiBaseUrl: "" }));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
const { BulkStatusDialog } = await import("./bulk-status-dialog");

beforeEach(() => {
  previewPost.mockClear();
  applyPost.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("BulkStatusDialog", () => {
  test("pratinjau → terapkan nonaktifkan: kirim userIds+disabled, toast jumlah, onDone", async () => {
    const onDone = mock(() => {});
    render(<BulkStatusDialog open onOpenChange={() => {}} userIds={["a", "b", "c"]} disabled onDone={onDone} />);
    expect(await screen.findByText(/akan dinonaktifkan/)).toBeTruthy();
    expect(screen.getByText(/1 akun sudah dalam status ini/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Nonaktifkan" }));
    await waitFor(() => expect(applyPost).toHaveBeenCalledTimes(1));
    expect(applyPost.mock.calls[0]?.[0]).toEqual({ userIds: ["a", "b", "c"], disabled: true });
    expect(toastSuccess.mock.calls[0]?.[0]).toBe("2 akun dinonaktifkan.");
    expect(onDone).toHaveBeenCalled();
  });
  test("akun terblokir ditampilkan; tidak ada yang berubah → tombol terapkan nonaktif", async () => {
    previewPost.mockImplementationOnce(async () => ({ data: { ...base, willChange: 0, blockedSelf: 1, blockedLastSuperAdmin: 1 }, error: null }));
    render(<BulkStatusDialog open onOpenChange={() => {}} userIds={["a"]} disabled onDone={() => {}} />);
    expect(await screen.findByText(/Akun Anda sendiri/)).toBeTruthy();
    expect(screen.getByText(/Super Admin aktif terakhir/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Nonaktifkan" }) as HTMLButtonElement).disabled).toBe(true);
  });
  test("galat terapkan → toast galat, onDone tidak dipanggil", async () => {
    applyPost.mockImplementationOnce(async () => ({ data: null, error: { status: 500 } }));
    const onDone = mock(() => {});
    render(<BulkStatusDialog open onOpenChange={() => {}} userIds={["a"]} disabled={false} onDone={onDone} />);
    await userEvent.click(await screen.findByRole("button", { name: "Aktifkan" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });
});
