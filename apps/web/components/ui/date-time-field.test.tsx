import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateTimeField } from "./date-time-field";

// § Fase 174, ADR-0041 — tanggal+jam akhir langganan di zona perusahaan; hanya mengemit saat diubah, tidak memotong detik nilai awal.
describe("DateTimeField (WIB)", () => {
  const original = "2026-11-06T07:35:42.500Z"; // 6 Nov 2026 14:35:42.500 WIB

  test("menampilkan tanggal & jam dinding WIB, tidak mengemit apa pun saat dirender (detik tidak terpotong)", () => {
    const onChange = mock((_iso: string) => {});
    render(<DateTimeField value={original} onChange={onChange} timeZone="Asia/Jakarta" ariaLabel="Expired" />);
    expect((screen.getByLabelText("Expired (tanggal)") as HTMLInputElement).value).toBe("2026-11-06");
    expect((screen.getByLabelText("Expired (jam)") as HTMLInputElement).value).toBe("14:35");
    expect(screen.getByText("WIB")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("mengubah jam mengemit ISO instant yang benar (WIB → UTC, detik 0)", () => {
    const onChange = mock((_iso: string) => {});
    render(<DateTimeField value={original} onChange={onChange} timeZone="Asia/Jakarta" ariaLabel="Expired" />);
    fireEvent.change(screen.getByLabelText("Expired (jam)"), { target: { value: "09:00" } });
    expect(onChange).toHaveBeenCalledWith("2026-11-06T02:00:00.000Z");
  });

  test("mengubah tanggal memakai jam yang tampil; mengosongkan tanggal mengemit string kosong", () => {
    const onChange = mock((_iso: string) => {});
    render(<DateTimeField value={original} onChange={onChange} timeZone="Asia/Jakarta" ariaLabel="Expired" />);
    fireEvent.change(screen.getByLabelText("Expired (tanggal)"), { target: { value: "2026-12-01" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-12-01T07:35:00.000Z");
    fireEvent.change(screen.getByLabelText("Expired (tanggal)"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  test("nilai kosong + hanya tanggal diisi → jam default 23:59 WIB (tidak memotong hak hari itu)", () => {
    const onChange = mock((_iso: string) => {});
    render(<DateTimeField value="" onChange={onChange} timeZone="Asia/Jakarta" ariaLabel="Expired" />);
    fireEvent.change(screen.getByLabelText("Expired (tanggal)"), { target: { value: "2026-12-31" } });
    expect(onChange).toHaveBeenCalledWith("2026-12-31T16:59:00.000Z");
  });
});
