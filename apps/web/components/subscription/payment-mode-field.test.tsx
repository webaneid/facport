import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentModeField, type PaymentMode } from "./payment-mode-field";

// § Fase 178 — pilihan mode pembayaran: kirim invoice | sudah dibayar (invoice otomatis lunas) | gratis (tanpa invoice); disaring menurut izin pemanggil.
describe("PaymentModeField", () => {
  test("menampilkan 3 mode dengan penjelasan, yang terpilih ditandai; memilih memanggil onChange dengan mode-nya", () => {
    const onChange = mock((_m: PaymentMode) => {});
    render(<PaymentModeField value="paid_invoice" onChange={onChange} allowed={["invoice", "paid_invoice", "free"]} />);
    expect(screen.getByText("Kirim invoice")).toBeTruthy();
    expect(screen.getByText(/otomatis berstatus LUNAS/)).toBeTruthy();
    expect(screen.getByText("Gratis (tanpa invoice)")).toBeTruthy();
    expect((screen.getByLabelText(/Sudah dibayar/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText(/Kirim invoice/));
    expect(onChange).toHaveBeenCalledWith("invoice");
    fireEvent.click(screen.getByLabelText(/Gratis/));
    expect(onChange).toHaveBeenLastCalledWith("free");
  });

  test("hanya mode yang diizinkan yang tampil (mis. staf tanpa subscriptions.manage hanya 'Kirim invoice')", () => {
    render(<PaymentModeField value="invoice" onChange={() => {}} allowed={["invoice"]} />);
    expect(screen.getByText("Kirim invoice")).toBeTruthy();
    expect(screen.queryByText("Sudah dibayar")).toBeNull();
    expect(screen.queryByText("Gratis (tanpa invoice)")).toBeNull();
  });
});
