import { describe, test, expect } from "bun:test";
import { describeDataUsahaEvent } from "./data-usaha-history";

const ev = (action: string, changes: unknown) => ({ id: "1", action, changes, actorName: "X", createdAt: "2026-10-12T00:00:00.000Z" });

describe("describeDataUsahaEvent", () => {
  test("koneksi: sambung oauth/attach, pilih, konfirmasi, reset (koreksi mandiri)", () => {
    expect(describeDataUsahaEvent(ev("connect_accurate", { via: "oauth", accountEmail: "a@x.id" }))).toMatchObject({ title: "Menyambungkan akun Accurate", detail: "Akun: a@x.id" });
    expect(describeDataUsahaEvent(ev("connect_accurate", { via: "attach" })).title).toBe("Memakai akun Accurate yang sudah terhubung");
    expect(describeDataUsahaEvent(ev("select_database", { accurateDbId: "7", alias: "PT Salah" })).title).toBe('Memilih database "PT Salah"');
    expect(describeDataUsahaEvent(ev("confirm_database", { accurateDbId: "7" })).title).toBe('Mengonfirmasi database "7"');
    expect(describeDataUsahaEvent(ev("reset_database", { previousAlias: "PT Salah" }))).toMatchObject({ title: "Memilih database yang lain", detail: 'Sebelumnya: "PT Salah" (koreksi oleh pemilik)', tone: "warning" });
  });

  test("putus koneksi: alasan berlabel + catatan; tanpa alasan tetap terbaca; dengan akun", () => {
    const withReason = describeDataUsahaEvent(ev("disconnect_accurate", { previousAccurateDbAlias: "PT A", reason: { code: "salah_akun", note: "Email pribadi" }, removedAccount: true }));
    expect(withReason.title).toBe("Koneksi diputus admin beserta akun Accurate");
    expect(withReason.detail).toBe("Database: PT A · Alasan: Salah akun Accurate · Catatan: Email pribadi");
    expect(withReason.tone).toBe("danger");
    expect(describeDataUsahaEvent(ev("disconnect_accurate", { previousAccurateDbAlias: "PT A", reason: null })).detail).toBe("Database: PT A");
    expect(describeDataUsahaEvent(ev("disconnect_accurate", {})).detail).toBeNull(); // data lama pra-189B
  });

  test("seat: undang/cabut dengan pelaku, alasan, dan pemindahan", () => {
    expect(describeDataUsahaEvent(ev("invite_seat", { email: "s@x.id", by: "owner" }))).toMatchObject({ title: "Mengundang s@x.id", detail: "Oleh pemilik" });
    const revoke = describeDataUsahaEvent(ev("revoke_seat", { email: "s@x.id", by: "admin", reason: "Resign", newInviteEmail: "p@x.id" }));
    expect(revoke.title).toBe("Mencabut akses s@x.id");
    expect(revoke.detail).toBe("Oleh admin · Alasan: Resign · Diganti undangan ke p@x.id");
  });

  test("defensif: changes null/aneh tidak melempar; aksi tak dikenal tampil apa adanya", () => {
    for (const changes of [null, undefined, "teks", 42, [], { alias: 5 }]) {
      for (const a of ["connect_accurate", "select_database", "reset_database", "disconnect_accurate", "invite_seat", "revoke_seat"]) {
        expect(() => describeDataUsahaEvent(ev(a, changes))).not.toThrow();
      }
    }
    expect(describeDataUsahaEvent(ev("aksi_baru", {})).title).toBe("aksi_baru");
  });
});
