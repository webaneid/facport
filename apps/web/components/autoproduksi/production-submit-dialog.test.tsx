import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// § Fase 185 — popup 3 tahap Input Produksi: Periksa dulu → Progres (jujur, dari status server) → Hasil.
type EntryStatus = "pending" | "processing" | "success" | "failed";
let sequence: { status: EntryStatus; errorMessage?: string | null; number?: string | null }[] = [];
const getEntry = mock(async () => {
  const next = sequence.length > 1 ? sequence.shift()! : sequence[0]!;
  return { data: { entry: { status: next.status, errorMessage: next.errorMessage ?? null, accurateTransactionNumber: next.number ?? null } } };
});
mock.module("@/lib/api-client", () => ({ api: { autoproduksi: { "production-entries": () => ({ get: getEntry }) } }, apiBaseUrl: "" }));

const { ProductionSubmitDialog } = await import("./production-submit-dialog");

const summary = { formulaLabel: "F-007 · Bolu Kukus", qtyText: "20 Loyang", dateText: "2026-10-09", context: [{ label: "Cabang", value: "JKT" }] };

function setup(over: Partial<React.ComponentProps<typeof ProductionSubmitDialog>> = {}) {
  const onSubmit = mock(async () => ({ ok: true as const, entryId: "e-1" }));
  const onCancel = mock(() => {});
  const onNewInput = mock(() => {});
  render(<ProductionSubmitDialog summary={summary} onSubmit={onSubmit} onCancel={onCancel} onNewInput={onNewInput} pollMs={20} slowAfterMs={150} {...over} />);
  return { onSubmit, onCancel, onNewInput };
}

describe("ProductionSubmitDialog", () => {
  test("tahap Periksa: ringkasan lengkap tampil, Batal menutup tanpa mengirim; tidak ada peringatan bila bukan duplikat", () => {
    const { onSubmit, onCancel } = setup();
    expect(screen.getByText("Periksa dulu sebelum dikirim")).toBeTruthy();
    expect(screen.getByText("F-007 · Bolu Kukus")).toBeTruthy();
    expect(screen.getByText("20 Loyang")).toBeTruthy();
    expect(screen.getByText("JKT")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("peringatan duplikat tampil di tahap Periksa tetapi tidak memblokir Kirim", () => {
    setup({ duplicateWarning: "Input serupa sudah dikirim 3 menit lalu" });
    expect(screen.getByRole("alert").textContent).toContain("3 menit lalu");
    expect((screen.getByRole("button", { name: "Kirim" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("Kirim → progres mengikuti status server (pending → processing → success) → 'Input Produksi Terkirim' + nomor + 2 tombol; klik ganda Kirim hanya sekali mengirim", async () => {
    sequence = [{ status: "pending" }, { status: "processing" }, { status: "success", number: "ADJ/001" }];
    const { onSubmit, onNewInput } = setup();
    const kirim = screen.getByRole("button", { name: "Kirim" });
    fireEvent.click(kirim);
    fireEvent.click(kirim);
    expect(screen.getByText("Mengirim input produksi…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kirim" })).toBeNull(); // tombol hilang selama proses
    await screen.findByText("Input Produksi Terkirim");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/ADJ\/001/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Lihat riwayat" }).getAttribute("href")).toBe("/autoproduksi/riwayat");
    fireEvent.click(screen.getByRole("button", { name: "Input produksi baru" }));
    expect(onNewInput).toHaveBeenCalled();
  });

  test("gagal di server → 'Gagal terkirim' + alasan + arahan ke Riwayat + 2 tombol", async () => {
    sequence = [{ status: "processing" }, { status: "failed", errorMessage: "Gudang tidak ditemukan" }];
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    await screen.findByText("Gagal terkirim");
    expect(screen.getByText("Gudang tidak ditemukan")).toBeTruthy();
    expect(screen.getByText("Cek status di laman Riwayat.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Lihat riwayat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Input produksi baru" })).toBeTruthy();
  });

  test("POST gagal (tidak sampai membuat entri) → langsung 'Gagal terkirim' dengan pesan, tanpa polling", async () => {
    getEntry.mockClear();
    setup({ onSubmit: mock(async () => ({ ok: false as const, message: "Formula ini sedang non-aktif" })) });
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    await screen.findByText("Gagal terkirim");
    expect(screen.getByText("Formula ini sedang non-aktif")).toBeTruthy();
    expect(getEntry).not.toHaveBeenCalled();
  });

  test("terlalu lama (belum final) → 'Masih diproses…' dengan Lihat riwayat / Input produksi baru; bila akhirnya selesai tetap pindah ke hasil", async () => {
    sequence = [{ status: "pending" }];
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Kirim" }));
    await screen.findByText(/Masih diproses/);
    expect(screen.getByRole("button", { name: "Input produksi baru" })).toBeTruthy();
    sequence = [{ status: "success" }];
    await waitFor(() => expect(screen.getByText("Input Produksi Terkirim")).toBeTruthy());
  });
});
