import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189B — panel "Akses & Riwayat": dimuat saat dibuka (lazy), menampilkan slot + riwayat dalam kalimat, tombol cabut hanya untuk `subscriptions.manage`.
type Seat = { id: string; status: string; invitedEmail: string | null; memberName: string | null; memberEmail: string | null; seatEndAt: string | null; seatSubscriptionStatus: string; seatExpired: boolean };
const seat = (over: Partial<Seat>): Seat => ({ id: "s", status: "available", invitedEmail: null, memberName: null, memberEmail: null, seatEndAt: "2030-01-01T00:00:00.000Z", seatSubscriptionStatus: "active", seatExpired: false, ...over });
const event = (i: number, action: string, changes: unknown) => ({ id: `e${i}`, action, changes, actorName: "Admin Satu", createdAt: "2026-10-12T03:00:00.000Z" });

let permissions = ["users.view", "subscriptions.manage"];
let payload: { seats: Seat[]; history: ReturnType<typeof event>[] } = { seats: [], history: [] };
const accessGet = mock(async (): Promise<{ data: unknown; error: unknown }> => ({ data: payload, error: null }));

mock.module("@/lib/api-client", () => ({
  api: { admin: { "data-usaha": () => ({ access: { get: accessGet }, seats: () => ({ revoke: { post: async () => ({ data: { ok: true }, error: null }) } }) }) } },
  apiBaseUrl: "",
  markActiveDataUsahaSeen: () => {},
}));
mock.module("@/lib/use-permissions", () => ({
  usePermissions: () => permissions,
  usePermission: (key: string) => permissions.includes(key),
  PermissionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
mock.module("@/components/company-timezone-provider", () => ({ useCompanyTimezone: () => "Asia/Jakarta" }));
mock.module("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const { DataUsahaAccessPanel } = await import("./data-usaha-access-panel");

beforeEach(() => {
  permissions = ["users.view", "subscriptions.manage"];
  payload = { seats: [], history: [] };
  accessGet.mockClear();
});

async function openPanel() {
  const user = userEvent.setup();
  render(<DataUsahaAccessPanel dataUsahaId="du-1" />);
  await user.click(screen.getByRole("button", { name: /Akses \(User Tambahan\)/ }));
  return user;
}

describe("DataUsahaAccessPanel", () => {
  test("tertutup di awal: TIDAK ada request; dibuka → memuat sekali; ditutup-buka lagi tidak memuat ulang", async () => {
    const user = userEvent.setup();
    render(<DataUsahaAccessPanel dataUsahaId="du-1" />);
    expect(accessGet).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: /Akses \(User Tambahan\)/ });
    await user.click(toggle);
    await waitFor(() => expect(accessGet).toHaveBeenCalledTimes(1));
    await user.click(toggle);
    await user.click(toggle);
    expect(accessGet).toHaveBeenCalledTimes(1);
  });

  test("slot: aktif (nama · email), diundang (email undangan), tersedia ('Belum dipakai'); kursi berakhir ditandai; tombol cabut hanya untuk slot terisi", async () => {
    payload = {
      seats: [
        seat({ id: "a", status: "active", memberName: "Budi", memberEmail: "budi@test.local" }),
        seat({ id: "b", status: "invited", invitedEmail: "undangan@test.local", seatExpired: true }),
        seat({ id: "c", status: "available" }),
      ],
      history: [],
    };
    await openPanel();
    expect(await screen.findByText("Budi · budi@test.local")).toBeTruthy();
    expect(screen.getByText("undangan@test.local")).toBeTruthy();
    expect(screen.getByText("Belum dipakai")).toBeTruthy();
    expect(screen.getByText(/Kursi berakhir/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cabut akses budi@test.local" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cabut akses undangan@test.local" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Cabut akses/ })).toHaveLength(2); // slot tersedia tidak punya tombol
  });

  test("tanpa izin subscriptions.manage (hanya melihat): tombol cabut tidak ada", async () => {
    permissions = ["users.view"];
    payload = { seats: [seat({ id: "a", status: "active", memberName: "Budi", memberEmail: "budi@test.local" })], history: [] };
    await openPanel();
    await screen.findByText("Budi · budi@test.local");
    expect(screen.queryByRole("button", { name: /^Cabut akses/ })).toBeNull();
  });

  test("riwayat tampil sebagai kalimat (koneksi + akses) terbaru dulu; >8 peristiwa → 'Tampilkan semua'", async () => {
    payload = {
      seats: [],
      history: [
        event(0, "reset_database", { previousAlias: "PT Salah" }),
        event(1, "disconnect_accurate", { previousAccurateDbAlias: "PT Salah", reason: { code: "salah_database", note: null } }),
        event(2, "revoke_seat", { email: "staf@test.local", by: "admin", reason: "Resign" }),
        ...Array.from({ length: 8 }, (_, i) => event(i + 3, "select_database", { alias: `PT ${i}` })),
      ],
    };
    const user = await openPanel();
    expect(await screen.findByText("Memilih database yang lain")).toBeTruthy();
    expect(screen.getByText(/Alasan: Salah database/)).toBeTruthy();
    expect(screen.getByText("Mencabut akses staf@test.local")).toBeTruthy();
    expect(screen.getAllByText(/Admin Satu/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Memilih database "PT 7"')).toBeNull(); // di luar 8 teratas
    await user.click(screen.getByRole("button", { name: /Tampilkan semua \(11\)/ }));
    expect(screen.getByText('Memilih database "PT 7"')).toBeTruthy();
  });

  test("tanpa peristiwa → keterangan jujur; galat muat → alert", async () => {
    await openPanel();
    expect(await screen.findByText(/Belum ada peristiwa tercatat/)).toBeTruthy();
    expect(screen.getByText(/Belum ada slot User Tambahan/)).toBeTruthy();
  });

  test("galat muat → pesan galat, bukan layar kosong", async () => {
    accessGet.mockResolvedValueOnce({ data: null, error: { status: 500 } });
    await openPanel();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Gagal memuat akses dan riwayat/)).toBeTruthy();
  });
});
