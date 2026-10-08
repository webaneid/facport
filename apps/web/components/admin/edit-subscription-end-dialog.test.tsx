import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// § Fase 180 — tombol cepat Ubah Masa Aktif memakai perpanjangan SERVER berbasis jangkar (tanggal tidak bergeser di akhir bulan); mengetik tanggal sendiri → PATCH tanggal persis.
type Result = { error: { value?: { code?: string } } | null };
const patch = mock(async (_body: { endAt: string }): Promise<Result> => ({ error: null }));
const extendPost = mock(async (_body: { interval: string; periods: number }): Promise<Result> => ({ error: null }));
const subscriptions = mock((_arg: { id: string }) => ({ patch, extend: { post: extendPost } }));
mock.module("@/lib/api-client", () => ({ api: { admin: { subscriptions } }, apiBaseUrl: "" }));
mock.module("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const { EditSubscriptionEndDialog } = await import("./edit-subscription-end-dialog");

// langganan bulanan mulai 31 Jan 2027 10:00 WIB (jangkar), akhir saat ini 28 Feb 2027 10:00 WIB
const ANCHOR = "2027-01-31T03:00:00.000Z";
const END = "2027-02-28T03:00:00.000Z";

function open(over: Partial<React.ComponentProps<typeof EditSubscriptionEndDialog>> = {}) {
  const onSaved = mock(() => {});
  render(<EditSubscriptionEndDialog subscriptionId="s-1" planName="Delivery Order" status="active" endAt={END} periodAnchorAt={ANCHOR} periodMonths={1} onSaved={onSaved} {...over} />);
  fireEvent.click(screen.getByRole("button", { name: "Ubah masa aktif Delivery Order" }));
  return { onSaved };
}
const dateInput = () => screen.getByLabelText("Expired baru (tanggal)") as HTMLInputElement;

describe("EditSubscriptionEndDialog — perpanjangan berbasis jangkar", () => {
  test("+1 bulan: pratinjau 31 Mar (jangkar terjaga, BUKAN 28 Mar); Simpan memanggil extend {monthly, 1}, bukan patch", async () => {
    patch.mockClear();
    extendPost.mockClear();
    const { onSaved } = open();
    fireEvent.click(screen.getByRole("button", { name: "+1 bulan" }));
    expect(dateInput().value).toBe("2027-03-31");
    expect(screen.getByText(/tanggal tidak bergeser di akhir bulan/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(extendPost).toHaveBeenCalledWith({ interval: "monthly", periods: 1 });
    expect(patch).not.toHaveBeenCalled();
  });

  test("+3 bulan → 31 Mei, {monthly, 3}; +1 tahun → 29 Feb 2028 (13 bulan dari jangkar, kabisat), {yearly, 1}", async () => {
    extendPost.mockClear();
    open();
    fireEvent.click(screen.getByRole("button", { name: "+3 bulan" }));
    expect(dateInput().value).toBe("2027-05-31");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(extendPost).toHaveBeenCalledWith({ interval: "monthly", periods: 3 }));
  });

  test("+1 tahun dihitung dari jangkar: 29 Feb 2028", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "+1 tahun" }));
    expect(dateInput().value).toBe("2028-02-29");
  });

  test("tanpa jangkar (data lama / tanggal pernah diubah manual): +1 bulan dihitung dari akhir saat ini (28 Mar)", () => {
    open({ periodAnchorAt: null, periodMonths: null });
    fireEvent.click(screen.getByRole("button", { name: "+1 bulan" }));
    expect(dateInput().value).toBe("2027-03-28");
  });

  test("setelah tombol cepat, mengetik tanggal sendiri → kembali ke PATCH tanggal persis (extend TIDAK dipanggil)", async () => {
    patch.mockClear();
    extendPost.mockClear();
    const { onSaved } = open();
    fireEvent.click(screen.getByRole("button", { name: "+1 bulan" }));
    fireEvent.change(dateInput(), { target: { value: "2027-06-15" } });
    expect(screen.queryByText(/tanggal tidak bergeser di akhir bulan/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith({ endAt: "2027-06-15T03:00:00.000Z" }); // jam 10:00 WIB tetap
    expect(extendPost).not.toHaveBeenCalled();
  });

  test("tanpa perubahan Simpan nonaktif; langganan tidak aktif → tombol ubah nonaktif", () => {
    open();
    expect((screen.getByRole("button", { name: "Simpan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("galat server ditampilkan (langganan sudah tidak aktif) dan dialog tidak menutup", async () => {
    extendPost.mockImplementationOnce(async () => ({ error: { value: { code: "SUBSCRIPTION_NOT_RENEWABLE" } } }));
    const { onSaved } = open();
    fireEvent.click(screen.getByRole("button", { name: "+1 bulan" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(extendPost).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("EditSubscriptionEndDialog — status", () => {
  test("langganan yang bukan 'active' tidak bisa diubah (tombol pensil nonaktif)", () => {
    render(<EditSubscriptionEndDialog subscriptionId="s-2" planName="Sales Order" status="expired" endAt={END} onSaved={() => {}} />);
    expect((screen.getByRole("button", { name: "Ubah masa aktif Sales Order" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
