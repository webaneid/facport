import { describe, test, expect, mock } from "bun:test";
import { useState } from "react";
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

  // § BUG 2026-10-07 — tahun tidak bisa diketik: nilai sementara "0002" dikonversi jadi 1902 lalu menimpa kolom di setiap ketukan.
  test("mengetik tahun digit demi digit (0002 → 0020 → 0202 → 2027): tampilan TIDAK ditimpa, tidak ada emisi tanggal salah, baru mengemit saat 2027 lengkap", () => {
    const onChange = mock((_iso: string) => {});
    function Harness() {
      const [value, setValue] = useState(original);
      return (
        <DateTimeField
          value={value}
          onChange={(iso) => {
            onChange(iso);
            setValue(iso);
          }}
          timeZone="Asia/Jakarta"
          ariaLabel="Expired"
        />
      );
    }
    render(<Harness />);
    const date = screen.getByLabelText("Expired (tanggal)") as HTMLInputElement;
    for (const typed of ["0002-11-06", "0020-11-06", "0202-11-06"]) {
      fireEvent.change(date, { target: { value: typed } });
      expect(date.value).toBe(typed); // tidak ditimpa jadi 1902 / 1920
      expect(onChange).toHaveBeenLastCalledWith(""); // belum lengkap → induk menonaktifkan Simpan
    }
    fireEvent.change(date, { target: { value: "2027-11-06" } });
    expect(date.value).toBe("2027-11-06");
    expect(onChange).toHaveBeenLastCalledWith("2027-11-06T07:35:00.000Z"); // jam 14:35 WIB tetap
  });

  test("nilai diubah dari LUAR (mis. tombol +1 bulan) → kolom mengikuti; setelah mengetik tanggal tidak lengkap lalu dari luar diisi lagi → mengikuti", () => {
    function Harness() {
      const [value, setValue] = useState(original);
      return (
        <div>
          <DateTimeField value={value} onChange={setValue} timeZone="Asia/Jakarta" ariaLabel="Expired" />
          <button type="button" onClick={() => setValue("2027-01-01T07:35:00.000Z")}>
            dari-luar
          </button>
        </div>
      );
    }
    render(<Harness />);
    const date = screen.getByLabelText("Expired (tanggal)") as HTMLInputElement;
    fireEvent.change(date, { target: { value: "0002-11-06" } });
    fireEvent.click(screen.getByRole("button", { name: "dari-luar" }));
    expect(date.value).toBe("2027-01-01");
    expect((screen.getByLabelText("Expired (jam)") as HTMLInputElement).value).toBe("14:35");
  });

  test("tahun di luar rentang wajar (1999 / 2101) tidak dianggap lengkap; kolom tanggal membatasi 2000–2100", () => {
    const onChange = mock((_iso: string) => {});
    render(<DateTimeField value={original} onChange={onChange} timeZone="Asia/Jakarta" ariaLabel="Expired" />);
    const date = screen.getByLabelText("Expired (tanggal)") as HTMLInputElement;
    expect(date.min).toBe("2000-01-01");
    expect(date.max).toBe("2100-12-31");
    fireEvent.change(date, { target: { value: "1999-11-06" } });
    expect(onChange).toHaveBeenLastCalledWith("");
    fireEvent.change(date, { target: { value: "2101-11-06" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  test("jam dikosongkan → belum lengkap (emit kosong); tanggal lengkap + jam kosong terisi 23:59 dan jam itu ikut tampil di kolom jam", () => {
    const onChange = mock((_iso: string) => {});
    render(<DateTimeField value="" onChange={onChange} timeZone="Asia/Jakarta" ariaLabel="Expired" />);
    fireEvent.change(screen.getByLabelText("Expired (tanggal)"), { target: { value: "2026-12-31" } });
    expect((screen.getByLabelText("Expired (jam)") as HTMLInputElement).value).toBe("23:59");
    fireEvent.change(screen.getByLabelText("Expired (jam)"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
