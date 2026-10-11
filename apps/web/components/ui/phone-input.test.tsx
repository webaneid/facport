import { describe, test, expect, mock } from "bun:test";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInput, parseE164 } from "./phone-input";

// § Fase 189A — keluaran PhoneInput SELALU E.164 dengan "+" (standar Jalajogja). Dibungkus komponen terkontrol seperti pemakaian nyata.
function Harness({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <PhoneInput
      ariaLabel="Nomor telepon"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

describe("parseE164", () => {
  test("kode negara terpanjang dulu; format lokal lama 08… → Indonesia", () => {
    expect(parseE164("+628123456789")).toMatchObject({ country: { code: "ID" }, localNumber: "8123456789" });
    expect(parseE164("+60123456789")).toMatchObject({ country: { code: "MY" }, localNumber: "123456789" });
    expect(parseE164("+966501234567")).toMatchObject({ country: { code: "SA" }, localNumber: "501234567" });
    expect(parseE164("08123456789")).toMatchObject({ country: { code: "ID" }, localNumber: "8123456789" });
    expect(parseE164("")).toMatchObject({ country: { code: "ID" }, localNumber: "" });
  });
});

describe("PhoneInput", () => {
  test("default Indonesia +62; ketik 0812… → keluaran +62812… (angka 0 lokal dibuang)", async () => {
    const user = userEvent.setup();
    const values: string[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    expect(screen.getByRole("button", { name: "Pilih kode negara" })).toHaveTextContent("+62");
    await user.type(screen.getByLabelText("Nomor telepon"), "0812345");
    expect(values.at(-1)).toBe("+62812345");
    expect((screen.getByLabelText("Nomor telepon") as HTMLInputElement).value).toBe("812345");
  });

  test("hanya digit diterima (huruf/simbol dibuang)", async () => {
    const user = userEvent.setup();
    const values: string[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    await user.type(screen.getByLabelText("Nomor telepon"), "8a1-2 b3");
    expect(values.at(-1)).toBe("+62812" + "3");
  });

  test("ganti negara ke Malaysia lewat pencarian → kode +60 dan keluaran ikut berubah", async () => {
    const user = userEvent.setup();
    const values: string[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    await user.type(screen.getByLabelText("Nomor telepon"), "123456789");
    await user.click(screen.getByRole("button", { name: "Pilih kode negara" }));
    await user.type(screen.getByLabelText("Cari negara atau kode"), "malay");
    await user.click(screen.getByRole("button", { name: /Malaysia/ }));
    expect(values.at(-1)).toBe("+60123456789");
    expect(screen.getByRole("button", { name: "Pilih kode negara" })).toHaveTextContent("+60");
  });

  test("nilai awal E.164 internasional ditampilkan dengan negara dan nomor lokal yang benar", () => {
    render(<Harness initial="+60123456789" />);
    expect(screen.getByRole("button", { name: "Pilih kode negara" })).toHaveTextContent("+60");
    expect((screen.getByLabelText("Nomor telepon") as HTMLInputElement).value).toBe("123456789");
  });

  test("mengosongkan input → keluaran string kosong", async () => {
    const user = userEvent.setup();
    const onValue = mock((_: string) => {});
    render(<Harness initial="+628123" onValue={onValue} />);
    await user.clear(screen.getByLabelText("Nomor telepon"));
    expect(onValue.mock.calls.at(-1)![0]).toBe("");
  });
});
