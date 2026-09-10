import { describe, test, expect } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { ImportProgress, DEFAULT_IMPORT_PROGRESS_MESSAGES } from "./import-progress";

describe("ImportProgress", () => {
  test("status mapping_pending -> tidak render apa pun", () => {
    const { container } = render(<ImportProgress status="mapping_pending" total={100} processed={0} />);
    expect(container.firstChild).toBeNull();
  });

  test("status processing -> bar sesuai persentase asli (processed/total), teks pesan tampil", () => {
    render(<ImportProgress status="processing" total={200} processed={50} />);
    expect(screen.getByText(`${DEFAULT_IMPORT_PROGRESS_MESSAGES[0]} (25%)`)).toBeInTheDocument();
  });

  test("status completed -> bar tampil TANPA teks berputar (proses sudah selesai)", () => {
    render(<ImportProgress status="completed" total={10} processed={10} />);
    expect(screen.queryByText(/\(100%\)/)).not.toBeInTheDocument();
  });

  test("total 0 -> persentase 0, tidak crash (hindari pembagian dengan nol)", () => {
    render(<ImportProgress status="processing" total={0} processed={0} />);
    expect(screen.getByText(`${DEFAULT_IMPORT_PROGRESS_MESSAGES[0]} (0%)`)).toBeInTheDocument();
  });

  test("teks berputar ganti ke pesan berikutnya setelah messageIntervalMs, lalu KEMBALI ke awal setelah 1 putaran penuh", async () => {
    render(<ImportProgress status="processing" total={10} processed={0} messages={["A", "B", "C"]} messageIntervalMs={10} />);
    expect(screen.getByText("A (0%)")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("B (0%)")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("C (0%)")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("A (0%)")).toBeInTheDocument());
  });

  test("processed melebihi total (defensif) -> persentase di-clamp ke 100, tidak lebih", () => {
    render(<ImportProgress status="processing" total={10} processed={15} />);
    expect(screen.getByText(`${DEFAULT_IMPORT_PROGRESS_MESSAGES[0]} (100%)`)).toBeInTheDocument();
  });
});
