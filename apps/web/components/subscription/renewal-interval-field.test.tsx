import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { RenewalIntervalField, type RenewalChoice } from "./renewal-interval-field";

// § Fase 181, ADR-0042 — pilihan "Perpanjangan berikutnya": Tidak ada / Bulanan / Tahunan, dengan keterangan yang menjelaskan tagihan otomatis 7 hari sebelum berakhir.
describe("RenewalIntervalField", () => {
  test("3 pilihan; yang terpilih ditandai (aria-pressed); memilih memanggil onChange", () => {
    const onChange = mock((_v: RenewalChoice) => {});
    render(<RenewalIntervalField value="none" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Tidak ada" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Tahunan" }));
    expect(onChange).toHaveBeenCalledWith("yearly");
    fireEvent.click(screen.getByRole("button", { name: "Bulanan" }));
    expect(onChange).toHaveBeenLastCalledWith("monthly");
  });

  test("keterangan mengikuti pilihan: tidak ada → manual; tahunan/bulanan → tagihan otomatis 7 hari sebelum berakhir dan seat tidak ikut", () => {
    const { rerender } = render(<RenewalIntervalField value="none" onChange={() => {}} />);
    expect(screen.getByText(/Tidak ada tagihan otomatis/)).toBeTruthy();
    rerender(<RenewalIntervalField value="yearly" onChange={() => {}} />);
    expect(screen.getByText(/1 tahun terbit otomatis 7 hari sebelum langganan berakhir/)).toBeTruthy();
    expect(screen.getByText(/Tidak berlaku untuk Slot User Tambahan/)).toBeTruthy();
    rerender(<RenewalIntervalField value="monthly" onChange={() => {}} />);
    expect(screen.getByText(/1 bulan terbit otomatis/)).toBeTruthy();
  });
});
