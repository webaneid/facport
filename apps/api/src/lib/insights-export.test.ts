import { describe, test, expect } from "bun:test";
import { EXPORT_MAX_ROWS, capRows, connectionEventText, customersCsv, expiringCsv, featureUsersCsv, formatLocalDateTime, newCsv, trendCsv, connectionHistoryCsv } from "./insights-export";
import { displayPhone } from "./phone";
import { projectConnectionChanges } from "./insights-data";

// § Fase 189C, D5 — ekspor CSV: pembangun MURNI (tanpa DB). Sel berawalan = + - @ dinetralkan; telepon Indonesia diekspor format lokal (08…) agar tidak berapostrof.
const TZ = "Asia/Jakarta";
const date = (iso: string) => new Date(iso);

describe("capRows", () => {
  test("batas baris D5 = 10.000; melebihi batas dipotong dan ditandai truncated", () => {
    expect(EXPORT_MAX_ROWS).toBe(10_000);
    expect(capRows([1, 2, 3], 5)).toEqual({ rows: [1, 2, 3], truncated: false });
    expect(capRows([1, 2, 3, 4, 5, 6], 5)).toEqual({ rows: [1, 2, 3, 4, 5], truncated: true });
    expect(capRows([1, 2, 3, 4, 5], 5).truncated).toBe(false); // tepat di batas bukan terpotong
  });
});

describe("formatLocalDateTime", () => {
  test("YYYY-MM-DD HH:mm menurut zona perusahaan; null → kosong", () => {
    expect(formatLocalDateTime(date("2026-10-31T18:00:00.000Z"), TZ)).toBe("2026-11-01 01:00");
    expect(formatLocalDateTime(date("2026-01-05T04:07:00.000Z"), TZ)).toBe("2026-01-05 11:07");
    expect(formatLocalDateTime(null, TZ)).toBe("");
  });
});

describe("displayPhone (API)", () => {
  test("+62 → 08…; internasional apa adanya; kosong → kosong", () => {
    expect(displayPhone("+628123456789")).toBe("08123456789");
    expect(displayPhone("+60123456789")).toBe("+60123456789");
    expect(displayPhone(null)).toBe("");
  });
});

describe("connectionEventText", () => {
  test("kalimat Indonesia per aksi (paritas isi dengan UI), alasan berlabel", () => {
    expect(connectionEventText("reset_database", { previousAlias: "PT Salah" })).toBe('Memilih database yang lain (sebelumnya "PT Salah")');
    expect(connectionEventText("disconnect_accurate", { reason: { code: "salah_akun", note: "Email pribadi" }, removedAccount: true })).toBe("Koneksi diputus admin beserta akun Accurate — Alasan: Salah akun Accurate — Catatan: Email pribadi");
    expect(connectionEventText("select_database", { alias: "PT Benar" })).toBe('Memilih database "PT Benar"');
    expect(connectionEventText("connect_accurate", { via: "attach", accountEmail: "a@x.id" })).toBe("Memakai akun Accurate yang sudah terhubung — a@x.id");
    expect(connectionEventText("tak_dikenal", null)).toBe("tak_dikenal");
    expect(() => connectionEventText("disconnect_accurate", "teks aneh")).not.toThrow();
  });
});

describe("pembangun CSV", () => {
  const owner = { id: "u1", name: "=HYPERLINK(\"http://x\")", email: "a@x.id", companyName: "+PT Aneh", phone: "+628123456789", whatsapp: "+60123456789" };

  test("daftar akun: kolom, tipe/jenis berbahasa Indonesia, telepon lokal, injeksi dinetralkan, fitur digabung", () => {
    const customerItems = [
      { id: "u1", name: owner.name, email: owner.email, disabled: false, companyName: owner.companyName, phone: owner.phone, whatsapp: owner.whatsapp, internalReason: "flag" as const, kind: "pemilik" as const, ownedDataUsaha: 2, connectedDataUsaha: 1, activeFeatures: ["sales_invoice", "purchase_order"], nearestEndAt: date("2026-10-31T18:00:00.000Z"), createdAt: date("2026-01-05T04:07:00.000Z") },
    ];
    const { header, rows } = customersCsv(customerItems, TZ);
    expect(header).toEqual(["Nama", "Email", "Perusahaan", "Telepon", "WhatsApp", "Tipe", "Jenis akun", "Nonaktif", "Data Usaha", "Terhubung Accurate", "Fitur aktif", "Berakhir terdekat", "Terdaftar"]);
    expect(rows[0]).toEqual([owner.name, "a@x.id", "+PT Aneh", "08123456789", "+60123456789", "Internal", "Pemilik", "Tidak", 2, 1, "Sales Invoice; Purchase Order", "2026-11-01 01:00", "2026-01-05 11:07"]);
  });

  test("pemakai fitur, baru, akan berakhir, riwayat koneksi, tren menghasilkan header + baris sesuai", () => {
    const fuItems = [{ owner, dataUsahaName: "DU A", planName: "PO Bulanan", startAt: date("2026-10-01T00:00:00.000Z"), endAt: date("2026-11-01T00:00:00.000Z"), renewalInterval: "monthly" }];
    const fu = featureUsersCsv("Purchase Order", fuItems, TZ);
    expect(fu.header[0]).toBe("Fitur");
    expect(fu.rows[0]![0]).toBe("Purchase Order");
    expect(fu.rows[0]).toContain("Bulanan");

    const nwItems = [{ owner, isNewCustomer: true, firstStartAt: date("2026-10-01T00:00:00.000Z"), features: [{ moduleKey: "sales_invoice", label: "Sales Invoice", dataUsahaName: "DU A", startAt: date("2026-10-01T00:00:00.000Z"), endAt: null }, { moduleKey: "other_deposit", label: "Other Deposit", dataUsahaName: "DU A", startAt: date("2026-10-02T00:00:00.000Z"), endAt: null }] }];
    const nw = newCsv(nwItems, TZ);
    expect(nw.rows).toHaveLength(2); // satu baris per langganan
    expect(nw.rows[0]).toContain("Ya");

    const exItems = [{ owner, nearestEndAt: date("2026-10-20T00:00:00.000Z"), subscriptions: [{ id: "s", moduleKey: "sales_invoice", label: "Sales Invoice", dataUsahaId: "d", dataUsahaName: "DU A", endAt: date("2026-10-20T00:00:00.000Z"), daysLeft: 3, renewal: { status: "terbit" as const, invoiceNumber: "INV/1", amountDue: 150123 } }] }];
    const ex = expiringCsv(exItems, TZ);
    expect(ex.header).toContain("Status tagihan perpanjangan");
    expect(ex.rows[0]).toContain("Tagihan sudah terbit");
    expect(ex.rows[0]).toContain("INV/1");

    const chItems = [{ id: "e", action: "reset_database", changes: { previousAlias: "PT X" }, createdAt: date("2026-10-01T00:00:00.000Z"), actor: { id: "u", name: "Pemilik" }, dataUsaha: { id: "d", name: "DU A" }, owner }];
    const ch = connectionHistoryCsv(chItems, TZ);
    expect(ch.rows[0]).toContain('Memilih database yang lain (sebelumnya "PT X")');
    expect(ch.rows[0]).toContain("Pemilik");

    const tr = trendCsv([{ month: "2026-01", value: 15, previous: 10, delta: 5, percent: 50, future: false }, { month: "2026-12", value: null, previous: null, delta: null, percent: null, future: true }]);
    expect(tr.rows).toEqual([["2026-01", 15, 10, 5, 50], ["2026-12", null, null, null, null]]);
  });
});

describe("projectConnectionChanges (whitelist)", () => {
  test("hanya kunci yang dibutuhkan laporan; id internal koneksi & daftar Data Usaha terdampak tidak ikut; alasan hanya code+note", () => {
    const out = projectConnectionChanges("disconnect_accurate", {
      previousConnectionId: "c1",
      previousAccurateDbId: "9",
      previousAccurateDbAlias: "PT A",
      removedAccount: true,
      affectedDataUsahaIds: ["d1", "d2"],
      viaDataUsahaId: "d1",
      reason: { code: "salah_akun", note: "catatan", rahasia: "x" },
      kolomBaruDiMasaDepan: "bocor",
    });
    expect(out).toEqual({ previousAccurateDbAlias: "PT A", removedAccount: true, reason: { code: "salah_akun", note: "catatan" } });
    expect(projectConnectionChanges("connect_accurate", { via: "oauth", accountEmail: "a@x.id", accurateConnectionId: "c" })).toEqual({ via: "oauth", accountEmail: "a@x.id" });
    expect(projectConnectionChanges("reset_database", { previousDbId: "7", previousAlias: "PT X", lain: 1 })).toEqual({ previousDbId: "7", previousAlias: "PT X" });
    expect(projectConnectionChanges("select_database", { accurateDbId: "7", alias: "PT Y" })).toEqual({ accurateDbId: "7", alias: "PT Y" });
    for (const bad of [null, undefined, "teks", 5, []]) expect(projectConnectionChanges("select_database", bad)).toEqual({});
    expect(projectConnectionChanges("disconnect_accurate", { reason: null })).toEqual({});
  });
});
