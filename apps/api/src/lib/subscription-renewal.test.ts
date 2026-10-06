import { describe, test, expect } from "bun:test";
import { paymentVerifiedBody } from "./subscription-renewal";

const WIB = "Asia/Jakarta";
// 6 Des 2026 14:35 WIB
const end = new Date(Date.UTC(2026, 11, 6, 7, 35));

describe("paymentVerifiedBody — notifikasi pembayaran terverifikasi", () => {
  test("tanpa perpanjangan: teks lama TIDAK berubah (1 dan banyak langganan)", () => {
    expect(paymentVerifiedBody(1, [], WIB)).toBe("Pembayaran kamu terverifikasi — langganan sudah aktif, selamat menggunakan Facport!");
    expect(paymentVerifiedBody(3, [], WIB)).toBe("Pembayaran kamu terverifikasi — 3 langganan sudah aktif, selamat menggunakan Facport!");
  });
  test("1 perpanjangan: menyebut sampai kapan berlaku (tanggal + jam, WIB)", () => {
    const body = paymentVerifiedBody(0, [{ newEndAt: end }], WIB);
    expect(body).toContain("perpanjangan langganan berhasil, berlaku sampai");
    expect(body).toContain("6 Desember 2026");
    expect(body).toMatch(/14[.:]35/);
  });
  test("beberapa perpanjangan & campuran dengan langganan baru", () => {
    expect(paymentVerifiedBody(0, [{ newEndAt: end }, { newEndAt: end }], WIB)).toBe("Pembayaran kamu terverifikasi — 2 langganan berhasil diperpanjang, masing-masing dari tanggal berakhirnya.");
    expect(paymentVerifiedBody(2, [{ newEndAt: end }, { newEndAt: end }], WIB)).toContain("2 langganan baru sudah aktif dan 2 langganan berhasil diperpanjang");
  });
});
