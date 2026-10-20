import { describe, test, expect } from "bun:test";
import { normalizeErrorKey, summarizeErrors, hintFor } from "./import-error-summary";

const failed = (errorMessage: string | null, status = "failed") => ({ status, errorMessage });

// Pesan-pesan di bawah diambil dari kasus NYATA production 2026-10-19 (Purchase Payment & Work Order).
const PPH = 'PPh ID "Pajak Penghasilan Ps. 23" tidak ditemukan di Data Master Pajak Accurate — cek ejaan/kode pajak, atau kosongkan kolom "PPh ID" kalau tidak diperlukan.';
const PPH2 = 'PPh ID "Jasa Manajemen" tidak ditemukan di Data Master Pajak Accurate — cek ejaan/kode pajak, atau kosongkan kolom "PPh ID" kalau tidak diperlukan.';
const OVER = (no: string) => `Pembayaran faktur "${no}" melebihi nilai utang fakturnya`;
const WO = (id: string) => `Kolom wajib kosong atau tidak valid di baris ${id}: matItemNo, matQuantity.`;

describe("normalizeErrorKey", () => {
  test("nomor faktur/id/angka berbeda pada pola yang sama → kunci yang sama", () => {
    expect(normalizeErrorKey(OVER("351-09061110"))).toBe(normalizeErrorKey(OVER("351-0929232.0")));
    expect(normalizeErrorKey(WO("7beb6892-aa8b-469e-8ecd-ea42e77df30f"))).toBe(normalizeErrorKey(WO("435eb65b-fed4-4907-9468-e77835917b24")));
    expect(normalizeErrorKey(PPH)).toBe(normalizeErrorKey(PPH2));
  });
  test("pesan berbeda jenis → kunci berbeda", () => {
    expect(normalizeErrorKey(OVER("A"))).not.toBe(normalizeErrorKey(PPH));
  });
  test("lampiran daftar faktur dari Excel dipotong supaya pesan yang sama tetap satu kelompok", () => {
    const a = `${OVER("351-1")} Faktur pada dokumen ini menurut Excel: PIN-1 (Payment 100). Accurate bisa menyebut faktur dengan nomor lain.`;
    const b = `${OVER("351-2")} Faktur pada dokumen ini menurut Excel: PIN-2 (Payment 999), PIN-3 (Payment 5). Accurate bisa menyebut faktur dengan nomor lain.`;
    expect(normalizeErrorKey(a)).toBe(normalizeErrorKey(b));
  });
});

describe("summarizeErrors", () => {
  test("hanya baris gagal bermessage yang dihitung; urut dari terbanyak; contoh = pesan asli tanpa lampiran", () => {
    const rows = [
      ...Array.from({ length: 316 }, () => failed(PPH)),
      ...Array.from({ length: 48 }, (_, i) => failed(OVER(`351-0906111${i}`))),
      failed(null),
      failed("   "),
      { status: "success", errorMessage: null },
      { status: "pending", errorMessage: "abaikan" },
    ];
    const s = summarizeErrors(rows);
    expect(s.totalFailed).toBe(364);
    expect(s.groups.map((g) => g.count)).toEqual([316, 48]);
    expect(s.groups[0]!.example).toContain("PPh ID");
  });

  test("hanya 5 kelompok teratas ditampilkan; sisanya diringkas jumlahnya", () => {
    const rows = Array.from({ length: 8 }, (_, i) => failed(`Galat khusus nomor${"x".repeat(i)} jenis-${String.fromCharCode(97 + i)}`));
    const s = summarizeErrors(rows);
    expect(s.groups).toHaveLength(5);
    expect(s.otherGroups).toBe(3);
    expect(s.otherRows).toBe(3);
  });

  test("tanpa galat → ringkasan kosong", () => {
    expect(summarizeErrors([{ status: "success", errorMessage: null }])).toEqual({ totalFailed: 0, groups: [], otherGroups: 0, otherRows: 0 });
  });
});

describe("hintFor — saran per jenis galat (kasus nyata)", () => {
  test("PPh tidak ditemukan → perbaiki data (Deskripsi Master Pajak)", () => {
    expect(hintFor(PPH)).toMatchObject({ action: "fix-data" });
    expect(hintFor(PPH)!.advice).toContain("Deskripsi");
  });
  test("melebihi nilai utang/piutang → perbaiki data (cek sisa tagihan), Payment sebelum PPh", () => {
    expect(hintFor(OVER("X"))).toMatchObject({ action: "fix-data" });
    expect(hintFor("Pembayaran faktur \"X\" melebihi nilai piutang fakturnya")!.advice).toContain("SEBELUM");
  });
  test('kasus nyata client 2026-10-20: "Kuantitas … di faktur melebihi yang dikirim" (DO 10, retur 3) → perbaiki data; isi Qty sendiri', () => {
    const msg = 'Kuantitas "Anti Gores Iphone 5" di faktur melebihi yang dikirim.';
    expect(hintFor(msg)).toMatchObject({ action: "fix-data" });
    expect(hintFor(msg)!.advice).toContain("Item Qty");
  });
  test("kolom wajib (Work Order) → perbaiki data", () => {
    expect(hintFor(WO("abc"))).toMatchObject({ action: "fix-data" });
  });
  test("timeout → periksa Accurate dulu; batas request → boleh Retry; galat tak dikenal → tanpa saran", () => {
    expect(hintFor("Accurate belum membalas setelah 6 menit menunggu.")).toMatchObject({ action: "check-accurate" });
    expect(hintFor("Accurate tidak membalas dalam batas waktu.")).toMatchObject({ action: "check-accurate" });
    expect(hintFor("Jumlah request API melebihi toleransi yang diperbolehkan")).toMatchObject({ action: "retry-ok" });
    expect(hintFor("galat aneh yang belum dikenal")).toBeNull();
  });
  test("§ Fase 205 — kirim bertahap berhenti → boleh Retry (melanjutkan, bukan menduplikasi), meski pesan juga menyebut Accurate", () => {
    expect(hintFor('Pengiriman bertahap dokumen "R1" berhenti setelah 4 percobaan pada 1500 dari 4000 entri (Accurate tidak menyelesaikan atau tidak menjawab).')).toMatchObject({ action: "retry-ok" });
    // galat bisnis di tengah kirim bertahap TIDAK ikut retry-ok (data harus diperbaiki dulu), walau pesannya memuat catatan kemajuan
    expect(hintFor("Nilai Pembayaran tidak mencukupi [Pengiriman bertahap: 500 dari 4000 entri faktur sudah tersimpan]")).toBeNull();
    expect(hintFor("Pembayaran melebihi nilai piutang faktur. [Pengiriman bertahap: 500 dari 4000 entri faktur sudah tersimpan]")).toMatchObject({ action: "fix-data" });
  });
});
