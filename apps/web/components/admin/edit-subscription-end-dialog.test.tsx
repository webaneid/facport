import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// § Fase 180 — tombol cepat Ubah Masa Aktif memakai perpanjangan SERVER berbasis jangkar (tanggal tidak bergeser di akhir bulan); mengetik tanggal sendiri → PATCH tanggal persis.
type Result = { error: { value?: { code?: string } } | null };
const patch = mock(async (_body: { endAt: string }): Promise<Result> => ({ error: null }));
const extendPost = mock(async (_body: { interval: string; periods: number }): Promise<Result> => ({ error: null }));
const renewalPatch = mock(async (_body: { renewalInterval: string | null }): Promise<Result> => ({ error: null }));
const issuePost = mock(async (_body: { interval: string }): Promise<Result & { data?: { invoiceNumber: string } }> => ({ error: null, data: { invoiceNumber: "INV/2026/10/0099" } }));
const subscriptions = mock((_arg: { id: string }) => ({ patch, extend: { post: extendPost }, renewal: { patch: renewalPatch }, "renewal-invoice": { post: issuePost } }));
mock.module("@/lib/use-permissions", () => ({ usePermissions: () => ["invoices.manage", "subscriptions.manage"] }));
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

// § Fase 181, ADR-0042 — perpanjangan terjadwal di dialog: atur penanda + terbitkan tagihan sekarang.
describe("EditSubscriptionEndDialog — perpanjangan terjadwal (Fase 181)", () => {
  test("langganan modul non-trial: bagian 'Perpanjangan berikutnya' tampil; simpan memanggil PATCH renewal (null untuk 'Tidak ada'); tombol simpan nonaktif sampai berubah", async () => {
    renewalPatch.mockClear();
    const onSaved = mock(() => {});
    render(<EditSubscriptionEndDialog subscriptionId="s-9" planName="Delivery Order" status="active" endAt={END} renewalInterval="yearly" renewalEligible onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah masa aktif Delivery Order" }));
    expect(screen.getByRole("button", { name: "Tahunan" }).getAttribute("aria-pressed")).toBe("true");
    const save = screen.getByRole("button", { name: "Simpan perpanjangan" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Bulanan" }));
    fireEvent.click(save);
    await waitFor(() => expect(renewalPatch).toHaveBeenCalledWith({ renewalInterval: "monthly" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Tidak ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan perpanjangan" }));
    await waitFor(() => expect(renewalPatch).toHaveBeenLastCalledWith({ renewalInterval: null }));
  });

  test("tidak tampil untuk trial / slot user (renewalEligible=false)", () => {
    render(<EditSubscriptionEndDialog subscriptionId="s-10" planName="Seat" status="active" endAt={END} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah masa aktif Seat" }));
    expect(screen.queryByText("Perpanjangan berikutnya")).toBeNull();
    expect(screen.queryByRole("button", { name: "Terbitkan tagihan sekarang" })).toBeNull();
  });

  test("Terbitkan tagihan sekarang: memakai penanda tersimpan; tanpa penanda & tanpa pilihan → pesan, tidak memanggil API; dengan pilihan memanggil dengan interval itu", async () => {
    issuePost.mockClear();
    const { unmount } = render(<EditSubscriptionEndDialog subscriptionId="s-11" planName="Sales Order" status="active" endAt={END} renewalInterval="yearly" renewalEligible onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah masa aktif Sales Order" }));
    fireEvent.click(screen.getByRole("button", { name: "Terbitkan tagihan sekarang" }));
    await waitFor(() => expect(issuePost).toHaveBeenCalledWith({ interval: "yearly" }));
    unmount();

    issuePost.mockClear();
    render(<EditSubscriptionEndDialog subscriptionId="s-12" planName="Purchase Order" status="active" endAt={END} renewalEligible onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah masa aktif Purchase Order" }));
    fireEvent.click(screen.getByRole("button", { name: "Terbitkan tagihan sekarang" }));
    expect(issuePost).not.toHaveBeenCalled(); // belum ada penanda dan belum memilih
    fireEvent.click(screen.getByRole("button", { name: "Bulanan" }));
    fireEvent.click(screen.getByRole("button", { name: "Terbitkan tagihan sekarang" }));
    await waitFor(() => expect(issuePost).toHaveBeenCalledWith({ interval: "monthly" }));
  });

  test("galat server saat menerbitkan (pesanan berjalan) → onSaved TIDAK dipanggil", async () => {
    issuePost.mockImplementationOnce(async () => ({ error: { value: { code: "MODULE_ORDER_IN_PROGRESS" } } }));
    const onSaved = mock(() => {});
    render(<EditSubscriptionEndDialog subscriptionId="s-13" planName="Receive Item" status="active" endAt={END} renewalInterval="monthly" renewalEligible onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah masa aktif Receive Item" }));
    fireEvent.click(screen.getByRole("button", { name: "Terbitkan tagihan sekarang" }));
    await waitFor(() => expect(issuePost).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });
});
