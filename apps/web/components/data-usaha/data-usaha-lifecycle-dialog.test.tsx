import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 218, ADR-0055 — dialog hapus/arsip Data Usaha (pemilik) + bagian Diarsipkan (pulihkan).
type Res = { data: unknown; error: unknown };
let lifecycleRes: Res = { data: { mode: "archive", blockers: [] }, error: null };
const lifecycleGet = mock(async (): Promise<Res> => lifecycleRes);
const archivePost = mock(async (_b: unknown): Promise<Res> => ({ data: { archived: true }, error: null }));
const deletePost = mock(async (_b: unknown): Promise<Res> => ({ data: { deleted: true }, error: null }));
const restorePost = mock(async (): Promise<Res> => ({ data: { restored: true }, error: null }));
const toastSuccess = mock((_m: string) => {});
const toastError = mock((_m: string) => {});
const dataUsahaFn = Object.assign((_a: { id: string }) => ({ lifecycle: { get: lifecycleGet }, archive: { post: archivePost }, delete: { post: deletePost }, restore: { post: restorePost } }), {
  archived: { get: mock(async (): Promise<Res> => ({ data: { archived: [], retentionDays: 30 }, error: null })) },
});
mock.module("@/lib/api-client", () => ({ api: { me: { "data-usaha": dataUsahaFn } }, apiBaseUrl: "" }));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
const { DataUsahaLifecycleDialog } = await import("./data-usaha-lifecycle-dialog");
const { ArchivedDataUsahaSection } = await import("./archived-data-usaha-section");

beforeEach(() => {
  lifecycleRes = { data: { mode: "archive", blockers: [] }, error: null };
  for (const m of [lifecycleGet, archivePost, deletePost, restorePost, toastSuccess, toastError]) m.mockClear();
});

describe("DataUsahaLifecycleDialog", () => {
  test("mode arsip: tombol nonaktif sampai nama diketik; terapkan mengirim konfirmasi lalu onDone('archived')", async () => {
    const onDone = mock((_a: string) => {});
    render(<DataUsahaLifecycleDialog open onOpenChange={() => {}} dataUsahaId="d1" name="PT Maju" onDone={onDone} />);
    const button = (await screen.findByRole("button", { name: "Arsipkan" })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Konfirmasi nama Data Usaha"), "pt MAJU");
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() => expect(archivePost).toHaveBeenCalledTimes(1));
    expect(archivePost.mock.calls[0]?.[0]).toEqual({ confirm: "pt MAJU" });
    expect(onDone).toHaveBeenCalledWith("archived");
  });

  test("mode hapus (kosong): memakai endpoint delete", async () => {
    lifecycleRes = { data: { mode: "delete", blockers: [] }, error: null };
    const onDone = mock((_a: string) => {});
    render(<DataUsahaLifecycleDialog open onOpenChange={() => {}} dataUsahaId="d1" name="Kosong" onDone={onDone} />);
    const button = await screen.findByRole("button", { name: "Hapus permanen" });
    await userEvent.type(screen.getByLabelText("Konfirmasi nama Data Usaha"), "Kosong");
    await userEvent.click(button);
    await waitFor(() => expect(deletePost).toHaveBeenCalledTimes(1));
    expect(archivePost).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith("deleted");
  });

  test("diblokir: daftar penghalang tampil dan tidak ada tombol aksi", async () => {
    lifecycleRes = { data: { mode: "blocked", blockers: [{ code: "ACTIVE_SEAT", count: 2 }, { code: "ACTIVE_SUBSCRIPTION", count: 1 }] }, error: null };
    render(<DataUsahaLifecycleDialog open onOpenChange={() => {}} dataUsahaId="d1" name="PT Maju" onDone={() => {}} />);
    expect(await screen.findByText(/2 User Tambahan masih aktif/)).toBeTruthy();
    expect(screen.getByText(/1 langganan masih aktif/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Arsipkan" })).toBeNull();
    expect(screen.queryByLabelText("Konfirmasi nama Data Usaha")).toBeNull();
  });

  test("galat server dipetakan dan dialog tidak memanggil onDone", async () => {
    archivePost.mockImplementationOnce(async () => ({ data: null, error: { value: { code: "HAS_BLOCKERS", blockers: [{ code: "PENDING_ORDER", count: 1 }] } } }));
    const onDone = mock((_a: string) => {});
    render(<DataUsahaLifecycleDialog open onOpenChange={() => {}} dataUsahaId="d1" name="PT Maju" onDone={onDone} />);
    await userEvent.type(await screen.findByLabelText("Konfirmasi nama Data Usaha"), "PT Maju");
    await userEvent.click(screen.getByRole("button", { name: "Arsipkan" }));
    expect(await screen.findByText(/Belum bisa diarsipkan, selesaikan dulu/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("ArchivedDataUsahaSection", () => {
  const items = [
    { id: "a1", name: "Lama", archivedAt: new Date(Date.now() - 5 * 864e5).toISOString(), canRestore: true },
    { id: "a2", name: "Habis", archivedAt: new Date(Date.now() - 40 * 864e5).toISOString(), canRestore: false },
  ];
  test("tidak menampilkan apa pun bila kosong", () => {
    const { container } = render(<ArchivedDataUsahaSection items={[]} retentionDays={30} onRestored={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
  test("dibuka: sisa hari tampil, hanya yang bisa dipulihkan punya tombol; pulihkan memanggil API dan onRestored", async () => {
    const onRestored = mock(() => {});
    render(<ArchivedDataUsahaSection items={items} retentionDays={30} onRestored={onRestored} />);
    await userEvent.click(screen.getByRole("button", { name: /Diarsipkan \(2\)/ }));
    expect(screen.getByText(/dalam 25 hari/)).toBeTruthy();
    expect(screen.getByText(/tidak bisa dipulihkan/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Pulihkan/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /Pulihkan/ }));
    await waitFor(() => expect(restorePost).toHaveBeenCalledTimes(1));
    expect(onRestored).toHaveBeenCalledTimes(1);
  });
});
