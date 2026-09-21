import { describe, test, expect } from "bun:test";
import {
  bannerCopy,
  dismissKey,
  gateCopy,
  isGateAutoOpenPath,
  joinNames,
  oauthErrorMessage,
  statusActionLabel,
  statusBadge,
  type AccurateGate,
  type GateState,
} from "./accurate-gate-copy";

// § Fase 144 — narasi & label tombol gerbang koneksi Accurate (sumber tunggal). Label tombol adalah KONTRAK dengan user
// (permintaan 2026-09-22): "Hubungkan Sekarang"/"Nanti", "Perbarui Izin" untuk fitur/scope baru, dst.
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
const copyOf = (over: Partial<AccurateGate>, opts: { hasError?: boolean } = {}) => gateCopy(gate(over), { dataUsahaName: "PT Maju", ...opts });

describe("gateCopy — label tombol per situasi", () => {
  test("not_connected: pertanyaan utama + 'Hubungkan Sekarang' / 'Nanti'", () => {
    const c = copyOf({ state: "not_connected" });
    expect(c.title).toBe("Hubungkan dengan akun Data Usaha Accurate Online Anda");
    expect(c.primary).toEqual({ label: "Hubungkan Sekarang", action: "connect" });
    expect(c.secondary).toEqual({ label: "Nanti", action: "later" });
  });

  test("not_connected migrated (cutover): 'Hubungkan Ulang', narasi 'sekali saja'", () => {
    const c = copyOf({ state: "not_connected", migrated: true, lastKnownDbAlias: "PT Lama" });
    expect(c.title).toContain("sekali saja");
    expect(c.primary.label).toBe("Hubungkan Ulang");
    expect(c.note).toContain("PT Lama");
  });

  test("reconnect: 'Hubungkan Ulang' (aksi reconnect) / 'Nanti'", () => {
    const c = copyOf({ state: "reconnect" });
    expect(c.title).toBe("Koneksi ke Accurate terputus");
    expect(c.primary).toEqual({ label: "Hubungkan Ulang", action: "reconnect", disabledReason: undefined });
    expect(c.secondary.label).toBe("Nanti");
  });

  test("update_permissions (fitur/scope baru): 'Perbarui Izin', menyebut NAMA FITUR", () => {
    const c = copyOf({ state: "update_permissions", missingModules: [{ key: "sales_order", label: "Sales Order" }, { key: "sales_return", label: "Sales Return" }] });
    expect(c.primary.label).toBe("Perbarui Izin");
    expect(c.primary.action).toBe("reconnect");
    expect(c.body).toContain("Fitur Sales Order dan Sales Return");
    expect(c.body).toContain("Izin yang sudah ada tetap berlaku");
  });

  test("update_permissions tanpa nama fitur → narasi generik yang tetap wajar", () => {
    expect(copyOf({ state: "update_permissions" }).body).toContain("Ada fitur baru yang membutuhkan");
  });

  test("importRunning menahan tombol utama reconnect/update_permissions dengan keterangan", () => {
    for (const state of ["reconnect", "update_permissions"] as GateState[]) {
      const c = copyOf({ state, importRunning: true });
      expect(c.primary.disabledReason).toContain("import yang sedang berjalan");
    }
    expect(copyOf({ state: "not_connected", importRunning: true }).primary.disabledReason).toBeUndefined();
  });

  test("select_database: judul memuat nama Data Usaha; 'Simpan & Lanjut' / 'Nanti'", () => {
    const c = copyOf({ state: "select_database" });
    expect(c.title).toBe("Pilih database Accurate untuk PT Maju");
    expect(c.primary).toEqual({ label: "Simpan & Lanjut", action: "save_database" });
    expect(c.secondary.action).toBe("later");
  });

  test("confirm_database: menyebut database; 'Ya, Sudah Benar' / 'Pilih yang Lain' (reset)", () => {
    const c = copyOf({ state: "confirm_database", accurateDbAlias: "PT Cabang" });
    expect(c.body).toContain("PT Cabang");
    expect(c.primary).toEqual({ label: "Ya, Sudah Benar", action: "confirm_database" });
    expect(c.secondary).toEqual({ label: "Pilih yang Lain", action: "reset_database" });
  });

  test("setelah galat callback, tombol utama koneksi menjadi 'Coba Lagi' (bukan untuk pilih database)", () => {
    expect(copyOf({ state: "not_connected" }, { hasError: true }).primary.label).toBe("Coba Lagi");
    expect(copyOf({ state: "reconnect" }, { hasError: true }).primary.label).toBe("Coba Lagi");
    expect(copyOf({ state: "update_permissions" }, { hasError: true }).primary.label).toBe("Coba Lagi");
    expect(copyOf({ state: "select_database" }, { hasError: true }).primary.label).toBe("Simpan & Lanjut");
  });

  test("tidak ada narasi yang kosong; tiap status punya judul, isi, dan dua tombol berlabel", () => {
    const states: GateState[] = ["not_connected", "reconnect", "update_permissions", "select_database", "confirm_database", "ok"];
    for (const state of states) {
      const c = copyOf({ state });
      expect(c.title.length).toBeGreaterThan(5);
      expect(c.body.length).toBeGreaterThan(20);
      expect(c.primary.label.length).toBeGreaterThan(2);
      expect(c.secondary.label.length).toBeGreaterThan(2);
    }
  });
});

describe("oauthErrorMessage", () => {
  test("kode dikenal → kalimat ramah; kode tak dikenal → fallback; kosong → null", () => {
    expect(oauthErrorMessage("accurate_account_in_use")).toContain("sudah terhubung ke akun Facport lain");
    expect(oauthErrorMessage("access_denied")).toContain("Izin tidak jadi diberikan");
    expect(oauthErrorMessage("kode_aneh")).toContain("belum berhasil");
    expect(oauthErrorMessage(null)).toBeNull();
    expect(oauthErrorMessage("")).toBeNull();
  });

  test("tidak pernah memantulkan nilai mentah dari URL ke pesan (anti-injeksi teks)", () => {
    expect(oauthErrorMessage("<script>alert(1)</script>")).not.toContain("<script>");
  });
});

describe("bannerCopy / statusBadge / statusActionLabel", () => {
  test("tidak ada banner bila ok atau Data Usaha tidak butuh Accurate", () => {
    expect(bannerCopy(gate({ state: "ok" }))).toBeNull();
    expect(bannerCopy(gate({ state: "not_connected", requiresAccurate: false }))).toBeNull();
  });

  test("member seat: kalimat informasi tanpa aksi", () => {
    const g = gate({ state: "reconnect", isOwner: false });
    expect(bannerCopy(g)).toBe("Pemilik Data Usaha perlu menghubungkan Accurate sebelum import bisa dikirim.");
    expect(statusActionLabel(g)).toBeNull();
  });

  test("pemilik: kalimat & label aksi sesuai status", () => {
    expect(bannerCopy(gate({ state: "not_connected" }))).toContain("belum terhubung");
    expect(bannerCopy(gate({ state: "update_permissions", missingModules: [{ key: "a", label: "Sales Order" }] }))).toContain("Sales Order");
    expect(statusActionLabel(gate({ state: "not_connected" }))).toBe("Hubungkan Sekarang");
    expect(statusActionLabel(gate({ state: "not_connected", migrated: true }))).toBe("Hubungkan Ulang");
    expect(statusActionLabel(gate({ state: "update_permissions" }))).toBe("Perbarui Izin");
    expect(statusActionLabel(gate({ state: "select_database" }))).toBe("Pilih Database");
    expect(statusActionLabel(gate({ state: "confirm_database" }))).toBe("Konfirmasi Database");
    expect(statusActionLabel(gate({ state: "ok" }))).toBeNull();
  });

  test("badge: terhubung=success, terputus=destructive, sisanya warning", () => {
    expect(statusBadge(gate({ state: "ok" })).variant).toBe("success");
    expect(statusBadge(gate({ state: "reconnect" })).variant).toBe("destructive");
    for (const state of ["not_connected", "update_permissions", "select_database", "confirm_database"] as GateState[]) {
      expect(statusBadge(gate({ state })).variant).toBe("warning");
    }
  });
});

describe("helper", () => {
  test("joinNames", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A dan B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B, dan C");
  });

  test("popup otomatis HANYA di dashboard dan halaman import (keputusan user)", () => {
    expect(isGateAutoOpenPath("/")).toBe(true);
    expect(isGateAutoOpenPath("/purchase-invoice/import")).toBe(true);
    expect(isGateAutoOpenPath("/purchase-invoice/import/123")).toBe(true);
    expect(isGateAutoOpenPath("/vendor/payable-account/import")).toBe(true);
    for (const p of ["/billing", "/team", "/subscribe", "/accurate", "/profile", "/notifications"]) expect(isGateAutoOpenPath(p)).toBe(false);
  });

  test("kunci 'Nanti' per Data Usaha + status", () => {
    expect(dismissKey("du1", "not_connected")).not.toBe(dismissKey("du1", "reconnect"));
    expect(dismissKey("du1", "not_connected")).not.toBe(dismissKey("du2", "not_connected"));
  });
});
