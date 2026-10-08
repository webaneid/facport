import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// § Fase 183, ADR-0043 — perpanjang kursi per slot (termasuk beberapa slot sekaligus) dari halaman Tim.
const seats = [
  { id: "seat-1", status: "active", invitedEmail: null, memberName: "Andi", memberEmail: "andi@x.id", seatExpired: true, seatEndAt: "2026-09-01T00:00:00.000Z", renewable: true, renewalOpen: false },
  { id: "seat-2", status: "available", invitedEmail: null, memberName: null, memberEmail: null, seatExpired: false, seatEndAt: "2026-11-01T00:00:00.000Z", renewable: true, renewalOpen: false },
  { id: "seat-3", status: "available", invitedEmail: null, memberName: null, memberEmail: null, seatExpired: false, seatEndAt: "2026-11-01T00:00:00.000Z", renewable: true, renewalOpen: true },
  { id: "seat-4", status: "available", invitedEmail: null, memberName: null, memberEmail: null, seatExpired: true, seatEndAt: "2026-08-01T00:00:00.000Z", renewable: false, renewalOpen: false },
];
type Result = { error: { value?: { code?: string } } | null; data?: { orderId: string } };
const renewPost = mock(async (_body: Record<string, unknown>): Promise<Result> => ({ error: null, data: { orderId: "order-9" } }));
const push = mock((_url: string) => {});
const teamFn = Object.assign((_arg: { seatId: string }) => ({}), { get: async () => ({ data: { seats } }), renew: { post: renewPost } });
mock.module("@/lib/api-client", () => ({ api: { me: { team: teamFn, "data-usaha": () => ({}) } }, apiBaseUrl: "" }));
mock.module("next/navigation", () => ({ useRouter: () => ({ push }) }));
mock.module("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));
mock.module("@/components/company-timezone-provider", () => ({ useCompanyTimezone: () => "Asia/Jakarta" }));

const { TeamForm } = await import("./team-form");

describe("TeamForm — perpanjang kursi", () => {
  test("tombol 'Perpanjang' hanya untuk slot yang bisa diperpanjang; slot dengan tagihan terbuka dinonaktifkan; slot dibatalkan tanpa tombol", async () => {
    render(<TeamForm dataUsahaId="du-1" />);
    await screen.findAllByRole("button", { name: "Perpanjang" });
    expect(screen.getAllByRole("button", { name: "Perpanjang" })).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Menunggu pembayaran" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("beberapa slot sekaligus: pilih 2 slot + Tahunan + ulangi otomatis → satu permintaan berisi kedua slot, lalu menuju halaman bayar", async () => {
    renewPost.mockClear();
    render(<TeamForm dataUsahaId="du-1" />);
    const buttons = await screen.findAllByRole("button", { name: "Perpanjang" });
    fireEvent.click(buttons[0]!); // seat-1 terpilih
    // slot 2 ditambah lewat checkbox; slot 3 (tagihan terbuka) tidak bisa dipilih
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes[2]!.disabled).toBe(true);
    fireEvent.click(boxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Tahunan" }));
    fireEvent.click(screen.getByLabelText(/Ulangi otomatis/));
    fireEvent.click(screen.getByRole("button", { name: "Buat Tagihan (2 slot)" }));
    await waitFor(() => expect(renewPost).toHaveBeenCalledWith({ dataUsahaId: "du-1", seatIds: ["seat-1", "seat-2"], interval: "yearly", repeat: true }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/billing/order-9/pay"));
  });

  test("tanpa slot terpilih tombol Buat Tagihan nonaktif; galat server tidak berpindah halaman", async () => {
    push.mockClear();
    renewPost.mockImplementationOnce(async () => ({ error: { value: { code: "SEAT_RENEWAL_IN_PROGRESS" } } }));
    render(<TeamForm dataUsahaId="du-1" />);
    const buttons = await screen.findAllByRole("button", { name: "Perpanjang" });
    fireEvent.click(buttons[1]!); // seat-2
    fireEvent.click(screen.getAllByRole("checkbox")[1]!); // lepas pilihan
    expect((screen.getByRole("button", { name: "Buat Tagihan (0 slot)" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Buat Tagihan (1 slot)" }));
    await waitFor(() => expect(renewPost).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });
});
