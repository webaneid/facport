import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// § Fase 178 — dialog batalkan invoice. Mock didaftarkan SEBELUM import komponen (pola register-form.test.tsx).
type Result = { error: { value?: { code?: string } } | null };
const customerPost = mock(async (): Promise<Result> => ({ error: null }));
const adminPost = mock(async (_body: { reason: string }): Promise<Result> => ({ error: null }));
const customerOrders = mock((_arg: { id: string }) => ({ cancel: { post: customerPost } }));
const adminOrders = mock((_arg: { id: string }) => ({ cancel: { post: adminPost } }));
mock.module("@/lib/api-client", () => ({ api: { orders: customerOrders, admin: { orders: adminOrders } }, apiBaseUrl: "" }));
mock.module("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const { CancelOrderDialog, CUSTOMER_CANCELLABLE, ADMIN_CANCELLABLE } = await import("./cancel-order-dialog");

describe("status yang boleh dibatalkan", () => {
  test("customer: pending & rejected (bukti menunggu admin tidak dibatalkan sepihak); admin: + submitted; lunas/dibatalkan tidak", () => {
    expect(CUSTOMER_CANCELLABLE).toEqual(["pending", "rejected"]);
    expect(ADMIN_CANCELLABLE).toEqual(["pending", "submitted", "rejected"]);
    for (const status of ["paid", "cancelled", "expired"]) {
      expect(CUSTOMER_CANCELLABLE.includes(status)).toBe(false);
      expect(ADMIN_CANCELLABLE.includes(status)).toBe(false);
    }
  });
});

describe("CancelOrderDialog", () => {
  test("customer: konfirmasi tanpa alasan → memanggil API pesanan sendiri lalu onCancelled", async () => {
    const onCancelled = mock(() => {});
    render(<CancelOrderDialog mode="customer" orderId="o-1" invoiceNumber="INV/1" onCancelled={onCancelled} />);
    fireEvent.click(screen.getByRole("button", { name: "Batalkan invoice INV/1" }));
    expect(screen.getByText(/tidak bisa dibayar lagi/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ya, Batalkan Invoice" }));
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(customerOrders).toHaveBeenCalledWith({ id: "o-1" });
    expect(customerPost).toHaveBeenCalled();
  });

  test("admin: alasan WAJIB (tombol nonaktif sampai diisi), dikirim ter-trim", async () => {
    const onCancelled = mock(() => {});
    render(<CancelOrderDialog mode="admin" orderId="o-2" invoiceNumber="INV/2" onCancelled={onCancelled} />);
    fireEvent.click(screen.getByRole("button", { name: "Batalkan invoice INV/2" }));
    const confirm = screen.getByRole("button", { name: "Ya, Batalkan Invoice" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Salah pilih paket/), { target: { value: "  Salah paket  " } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(adminOrders).toHaveBeenCalledWith({ id: "o-2" });
    expect(adminPost).toHaveBeenCalledWith({ reason: "Salah paket" });
  });

  test("galat dari server ditampilkan dengan pesan jelas dan dialog TIDAK menutup / onCancelled tidak dipanggil", async () => {
    customerPost.mockImplementationOnce(async () => ({ error: { value: { code: "ORDER_NOT_CANCELLABLE" } } }));
    const onCancelled = mock(() => {});
    render(<CancelOrderDialog mode="customer" orderId="o-3" invoiceNumber="INV/3" onCancelled={onCancelled} />);
    fireEvent.click(screen.getByRole("button", { name: "Batalkan invoice INV/3" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, Batalkan Invoice" }));
    await waitFor(() => expect(screen.getByText(/sudah tidak bisa dibatalkan/)).toBeTruthy());
    expect(onCancelled).not.toHaveBeenCalled();
  });
});
