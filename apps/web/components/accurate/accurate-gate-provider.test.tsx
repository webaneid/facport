import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccurateGate } from "@/lib/accurate-gate-copy";

// § Fase 144 — popup gerbang koneksi Accurate. mock.module WAJIB sebelum import komponen (lihat login-form.test.tsx).
let pathname = "/";
let searchParams = new URLSearchParams();
const routerRefresh = mock(() => {});
const routerReplace = mock((_p: string) => {});

type ApiResult = { data?: unknown; error?: { value: { code?: string } } | null };
const connectPost = mock(async (_b: unknown): Promise<ApiResult> => ({ error: { value: { code: "FAKE" } } })); // error path: hindari navigasi window.location
const attachPost = mock(async (_b: unknown): Promise<ApiResult> => ({ data: {}, error: null }));
const confirmPost = mock(async (_b: unknown): Promise<ApiResult> => ({ data: { confirmed: true }, error: null }));
const resetPost = mock(async (_b: unknown): Promise<ApiResult> => ({ data: { reset: true }, error: null }));
const selectPost = mock(async (_b: unknown): Promise<ApiResult> => ({ data: {}, error: null }));
const databasesGet = mock(async (_q: unknown): Promise<ApiResult> => ({
  data: { databases: [{ id: 1, alias: "PT Satu", trial: false, expired: false, used: false }, { id: 2, alias: "PT Dua", trial: false, expired: false, used: true }] },
  error: null,
}));

// § Mock modul pembungkus (spesifier unik), BUKAN `next/navigation`: mock.module bun bersifat global per proses & tes auth/*
// sudah me-mock `next/navigation` dengan bentuk lain — lihat lib/use-accurate-gate-navigation.ts.
mock.module("@/lib/use-accurate-gate-navigation", () => ({
  useAccurateGateNavigation: () => ({ pathname, search: searchParams, refresh: routerRefresh, replace: routerReplace }),
}));
mock.module("@/lib/api-client", () => ({
  api: {
    accurate: {
      connect: { post: connectPost },
      attach: { post: attachPost },
      databases: { get: databasesGet, select: { post: selectPost }, confirm: { post: confirmPost }, reset: { post: resetPost } },
    },
  },
}));

const { AccurateGateProvider, AccurateRequiredNotice, AccurateStatusCard } = await import("./accurate-gate-provider");

function gate(over: Partial<AccurateGate> = {}): AccurateGate {
  return {
    state: "not_connected",
    migrated: false,
    isOwner: true,
    requiresAccurate: true,
    accountEmail: null,
    accurateDbAlias: null,
    lastKnownDbAlias: null,
    missingModules: [],
    missingScopes: [],
    catalogMissingScopes: [],
    importRunning: false,
    accounts: [],
    ...over,
  };
}
function renderGate(g: AccurateGate | null, children: React.ReactNode = <p>Isi halaman</p>) {
  return render(
    <AccurateGateProvider gate={g} dataUsahaId="du-1" dataUsahaName="PT Maju">
      {children}
    </AccurateGateProvider>,
  );
}

beforeEach(() => {
  cleanup();
  pathname = "/";
  searchParams = new URLSearchParams();
  sessionStorage.clear();
  for (const m of [routerRefresh, routerReplace, connectPost, attachPost, confirmPost, resetPost, selectPost, databasesGet]) m.mockClear();
  connectPost.mockImplementation(async () => ({ error: { value: { code: "FAKE" } } }));
});

describe("popup gerbang — situasi belum terhubung", () => {
  test("muncul di dashboard dengan pertanyaan utama dan DUA tombol: 'Hubungkan Sekarang' (solid utama) & 'Nanti' (outline utama)", async () => {
    renderGate(gate());
    const popup = await screen.findByTestId("accurate-gate-popup");
    expect(popup.className).toContain("glass-card"); // kaca-transparan
    expect(screen.getByText("Hubungkan dengan akun Data Usaha Accurate Online Anda")).toBeInTheDocument();

    const primary = screen.getByRole("button", { name: "Hubungkan Sekarang" });
    expect(primary.className).toContain("bg-primary-600");
    expect(primary.className).toContain("text-white");

    const secondary = screen.getByRole("button", { name: "Nanti" });
    expect(secondary.className).toContain("border-primary-600");
    expect(secondary.className).toContain("text-primary-700");
    expect(secondary.className).toContain("bg-transparent");
  });

  test("'Hubungkan Sekarang' memulai OAuth untuk Data Usaha aktif (bukan reconnect)", async () => {
    const user = userEvent.setup();
    renderGate(gate());
    await user.click(await screen.findByRole("button", { name: "Hubungkan Sekarang" }));
    await waitFor(() => expect(connectPost).toHaveBeenCalledWith({ dataUsahaId: "du-1", reconnect: false }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Gagal memulai koneksi Accurate");
  });

  test("'Nanti' menutup popup, disimpan di sesi browser, banner TETAP tampil; tidak muncul lagi di sesi yang sama", async () => {
    const user = userEvent.setup();
    const { unmount } = renderGate(gate());
    await user.click(await screen.findByRole("button", { name: "Nanti" }));
    await waitFor(() => expect(screen.queryByTestId("accurate-gate-popup")).not.toBeInTheDocument());
    expect(screen.getByTestId("accurate-gate-banner")).toHaveTextContent("belum terhubung ke Accurate");
    unmount();
    renderGate(gate()); // "halaman dimuat ulang" di sesi yang sama
    expect(screen.queryByTestId("accurate-gate-popup")).not.toBeInTheDocument();
  });

  test("sesi browser BARU (sessionStorage kosong) → popup muncul lagi", async () => {
    const user = userEvent.setup();
    const { unmount } = renderGate(gate());
    await user.click(await screen.findByRole("button", { name: "Nanti" }));
    unmount();
    sessionStorage.clear(); // sesi baru
    renderGate(gate());
    expect(await screen.findByTestId("accurate-gate-popup")).toBeInTheDocument();
  });

  test("hanya di dashboard & halaman import: di /billing tidak ada popup, hanya banner", () => {
    pathname = "/billing";
    renderGate(gate());
    expect(screen.queryByTestId("accurate-gate-popup")).not.toBeInTheDocument();
    expect(screen.getByTestId("accurate-gate-banner")).toBeInTheDocument();
  });

  test("halaman import → popup otomatis", async () => {
    pathname = "/purchase-invoice/import";
    renderGate(gate());
    expect(await screen.findByTestId("accurate-gate-popup")).toBeInTheDocument();
  });

  test("status ok → tidak ada popup maupun banner", () => {
    renderGate(gate({ state: "ok", accurateDbAlias: "PT 1" }));
    expect(screen.queryByTestId("accurate-gate-popup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("accurate-gate-banner")).not.toBeInTheDocument();
  });

  test("Data Usaha yang tidak butuh Accurate → tidak ada gerbang sama sekali", () => {
    renderGate(gate({ requiresAccurate: false }));
    expect(screen.queryByTestId("accurate-gate-popup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("accurate-gate-banner")).not.toBeInTheDocument();
  });

  test("member seat: TANPA popup; banner informasi tanpa tombol aksi", () => {
    renderGate(gate({ isOwner: false }));
    expect(screen.queryByTestId("accurate-gate-popup")).not.toBeInTheDocument();
    expect(screen.getByTestId("accurate-gate-banner")).toHaveTextContent("Pemilik Data Usaha perlu menghubungkan Accurate");
    expect(screen.queryByRole("button", { name: "Selesaikan sekarang" })).not.toBeInTheDocument();
  });

  test("pemilik sudah punya akun terhubung → tawarkan 'Pakai akun …' (attach, tanpa OAuth ulang)", async () => {
    const user = userEvent.setup();
    renderGate(gate({ accounts: [{ id: "conn-1", accountEmail: "a@accurate.test" }] }));
    await user.click(await screen.findByRole("button", { name: "Pakai akun a@accurate.test" }));
    await waitFor(() => expect(attachPost).toHaveBeenCalledWith({ dataUsahaId: "du-1", connectionId: "conn-1", reconnect: false }));
    expect(connectPost).not.toHaveBeenCalled();
    expect(routerRefresh).toHaveBeenCalled();
  });
});

describe("popup gerbang — izin/scope baru, terputus, galat callback", () => {
  test("update_permissions (fitur baru): 'Perbarui Izin' + nama fitur; mengirim reconnect:true", async () => {
    const user = userEvent.setup();
    renderGate(gate({ state: "update_permissions", missingModules: [{ key: "sales_order", label: "Sales Order" }], accurateDbAlias: "PT 1" }));
    expect(await screen.findByText(/Fitur Sales Order yang baru Anda gunakan/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Perbarui Izin" }));
    await waitFor(() => expect(connectPost).toHaveBeenCalledWith({ dataUsahaId: "du-1", reconnect: true }));
  });

  test("ada import berjalan → tombol utama nonaktif + keterangan", async () => {
    renderGate(gate({ state: "reconnect", importRunning: true }));
    expect(await screen.findByRole("button", { name: "Hubungkan Ulang" })).toBeDisabled();
    expect(screen.getByText(/Ada import yang sedang berjalan/)).toBeInTheDocument();
  });

  test("kembali dari OAuth dengan galat → popup terbuka (walau sudah 'Nanti'), pesan ramah, tombol 'Coba Lagi'", async () => {
    sessionStorage.setItem("accurate-gate:dismissed:du-1:not_connected", "1");
    searchParams = new URLSearchParams("accurate_error=accurate_account_in_use");
    renderGate(gate());
    expect(await screen.findByRole("alert")).toHaveTextContent("sudah terhubung ke akun Facport lain");
    expect(screen.getByRole("button", { name: "Coba Lagi" })).toBeInTheDocument();
  });

  test("kembali dari OAuth berhasil (?accurate=connected) → popup lanjut ke pilih database dan memuat daftar", async () => {
    searchParams = new URLSearchParams("accurate=connected");
    renderGate(gate({ state: "select_database", accountEmail: "a@accurate.test" }));
    expect(await screen.findByText("Pilih database Accurate untuk PT Maju")).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /PT Satu/ })).toBeInTheDocument();
    expect(databasesGet).toHaveBeenCalledWith({ query: { dataUsahaId: "du-1" } });
    expect(screen.getByRole("radio", { name: /PT Dua/ })).toBeDisabled(); // sudah dipakai Data Usaha lain
  });

  test("pilih database lalu 'Simpan & Lanjut' → kartu sukses 'Terhubung ke …' dan status dimuat ulang", async () => {
    const user = userEvent.setup();
    renderGate(gate({ state: "select_database" }));
    await user.click(await screen.findByRole("radio", { name: /PT Satu/ }));
    await user.click(screen.getByRole("button", { name: "Simpan & Lanjut" }));
    await waitFor(() => expect(selectPost).toHaveBeenCalledWith({ dataUsahaId: "du-1", accurateDbId: 1, alias: "PT Satu" }));
    expect(await screen.findByText("Terhubung ke PT Satu")).toBeInTheDocument();
    expect(routerRefresh).toHaveBeenCalled();
  });
});

describe("popup gerbang — konfirmasi database", () => {
  test("'Ya, Sudah Benar' mengonfirmasi dan menampilkan kartu sukses", async () => {
    const user = userEvent.setup();
    renderGate(gate({ state: "confirm_database", accurateDbAlias: "PT Cabang" }));
    expect(await screen.findByText(/Sebelumnya Data Usaha ini terhubung ke PT Cabang/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ya, Sudah Benar" }));
    await waitFor(() => expect(confirmPost).toHaveBeenCalledWith({ dataUsahaId: "du-1" }));
    expect(await screen.findByText("Terhubung ke PT Cabang")).toBeInTheDocument();
  });

  test("'Pilih yang Lain' memanggil reset; bila ada riwayat import → pesan arahan ke tim, popup tetap", async () => {
    const user = userEvent.setup();
    resetPost.mockImplementationOnce(async () => ({ error: { value: { code: "DATABASE_HAS_IMPORT_HISTORY" } } }));
    renderGate(gate({ state: "confirm_database", accurateDbAlias: "PT Cabang" }));
    await user.click(await screen.findByRole("button", { name: "Pilih yang Lain" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("sudah punya riwayat import");
    expect(screen.getByRole("button", { name: "Ya, Sudah Benar" })).toBeInTheDocument();
  });

  test("'Pilih yang Lain' sukses → status dimuat ulang (lanjut pilih database)", async () => {
    const user = userEvent.setup();
    renderGate(gate({ state: "confirm_database", accurateDbAlias: "PT Cabang" }));
    await user.click(await screen.findByRole("button", { name: "Pilih yang Lain" }));
    await waitFor(() => expect(resetPost).toHaveBeenCalledWith({ dataUsahaId: "du-1" }));
    expect(routerRefresh).toHaveBeenCalled();
  });
});

describe("kartu status & penghalang import", () => {
  test("kartu dashboard: badge status + SATU tombol yang membuka popup yang sama (walau sebelumnya 'Nanti')", async () => {
    const user = userEvent.setup();
    pathname = "/billing"; // tanpa popup otomatis
    renderGate(gate({ state: "reconnect", accurateDbAlias: "PT 1" }), <AccurateStatusCard />);
    const card = screen.getByTestId("accurate-status-card");
    expect(card).toHaveTextContent("⚠ Terputus");
    expect(card).toHaveTextContent("PT 1");
    await user.click(screen.getByRole("button", { name: "Hubungkan Ulang" }));
    expect(await screen.findByTestId("accurate-gate-popup")).toBeInTheDocument();
  });

  test("kartu status terhubung: badge sukses tanpa tombol; halaman detail menampilkan akun", () => {
    renderGate(gate({ state: "ok", accurateDbAlias: "PT 1", accountEmail: "a@accurate.test" }), <AccurateStatusCard detailed />);
    const card = screen.getByTestId("accurate-status-card");
    expect(card).toHaveTextContent("✓ Terhubung");
    expect(card).toHaveTextContent("a@accurate.test");
    expect(card.querySelector("button")).toBeNull();
  });

  test("penghalang halaman import: tampil bila belum siap dan tombolnya membuka popup; hilang bila ok", async () => {
    const user = userEvent.setup();
    pathname = "/billing";
    const first = renderGate(gate(), <AccurateRequiredNotice />);
    expect(screen.getByTestId("accurate-required-notice")).toHaveTextContent("Selesaikan dulu supaya import tidak gagal");
    await user.click(screen.getAllByRole("button", { name: "Hubungkan Sekarang" })[0]!);
    expect(await screen.findByTestId("accurate-gate-popup")).toBeInTheDocument();
    first.unmount();
    renderGate(gate({ state: "ok" }), <AccurateRequiredNotice />);
    expect(screen.queryByTestId("accurate-required-notice")).not.toBeInTheDocument();
  });
});
