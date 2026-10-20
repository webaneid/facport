import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ImportErrorSummary } from "./import-error-summary";

describe("ImportErrorSummary", () => {
  test("tanpa baris gagal → tidak render apa pun", () => {
    const { container } = render(<ImportErrorSummary rows={[{ status: "success", errorMessage: null }]} />);
    expect(container.firstChild).toBeNull();
  });

  test("menampilkan jumlah baris gagal, kelompok galat dengan hitungan, dan saran 'perbaiki data dulu'", () => {
    const msg = 'PPh ID "Pajak Penghasilan Ps. 23" tidak ditemukan di Data Master Pajak Accurate — cek ejaan.';
    render(<ImportErrorSummary rows={Array.from({ length: 3 }, () => ({ status: "failed", errorMessage: msg }))} />);
    expect(screen.getByText("Ringkasan Galat")).toBeInTheDocument();
    expect(screen.getByText(/3 baris gagal/)).toBeInTheDocument();
    expect(screen.getByText("3 baris")).toBeInTheDocument();
    expect(screen.getByText(/Perbaiki data dulu/)).toBeInTheDocument();
    expect(screen.getByText(/Deskripsi di Master Pajak/)).toBeInTheDocument();
  });

  test("galat tak dikenal tetap ditampilkan (tanpa saran), tidak crash", () => {
    render(<ImportErrorSummary rows={[{ status: "failed", errorMessage: "galat aneh" }]} />);
    expect(screen.getByText("galat aneh")).toBeInTheDocument();
    expect(screen.queryByText(/Perbaiki data dulu/)).not.toBeInTheDocument();
  });
});
