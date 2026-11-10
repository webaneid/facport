import { describe, test, expect } from "bun:test";
import { ROLE_ACTIONS, planRoleChange, planTierSwitch, confirmMatches, canRemoveSuperAdmin } from "./role-actions";

// § Fase 189H — aturan murni aksi peran (tanpa DB): hasil aksi, role terakhir, status internal sebelum/sesudah, konfirmasi ketik, Super Admin terakhir.
describe("planRoleChange", () => {
  test("grant: menambah role; sudah punya → noop", () => {
    expect(planRoleChange(["customer"], "grant_staff")).toMatchObject({ ok: true, noop: false, after: ["customer", "staff"] });
    expect(planRoleChange(["customer", "staff"], "grant_staff")).toMatchObject({ ok: true, noop: true });
    expect(planRoleChange(["staff"], "grant_customer")).toMatchObject({ ok: true, noop: false, after: ["staff", "customer"] });
  });
  test("revoke: mencabut role; tidak punya → noop; tidak boleh meninggalkan akun tanpa role", () => {
    expect(planRoleChange(["customer", "admin"], "revoke_admin")).toMatchObject({ ok: true, noop: false, after: ["customer"] });
    expect(planRoleChange(["customer"], "revoke_admin")).toMatchObject({ ok: true, noop: true });
    expect(planRoleChange(["customer"], "revoke_customer")).toEqual({ ok: false, code: "WOULD_LEAVE_NO_ROLE" });
    expect(planRoleChange(["staff"], "revoke_staff")).toEqual({ ok: false, code: "WOULD_LEAVE_NO_ROLE" });
  });
  test("status internal sebelum/sesudah ditentukan role (flag ikut diperhitungkan)", () => {
    expect(planRoleChange(["customer"], "grant_admin", false)).toMatchObject({ internalBefore: false, internalAfter: true });
    expect(planRoleChange(["customer", "staff"], "revoke_staff", false)).toMatchObject({ internalBefore: true, internalAfter: false });
    expect(planRoleChange(["customer", "staff"], "revoke_staff", true)).toMatchObject({ internalBefore: true, internalAfter: true });
  });
  test("semua aksi terdaftar dan memetakan ke role sah", () => {
    expect(Object.keys(ROLE_ACTIONS).sort()).toEqual(["grant_admin", "grant_customer", "grant_staff", "revoke_admin", "revoke_customer", "revoke_staff"]);
  });
});

describe("confirmMatches / canRemoveSuperAdmin", () => {
  test("konfirmasi = email target, tak peka huruf besar/kecil & spasi tepi", () => {
    expect(confirmMatches(" Budi@Test.Local ", "budi@test.local")).toBe(true);
    expect(confirmMatches("budi@test.loca", "budi@test.local")).toBe(false);
    expect(confirmMatches("", "budi@test.local")).toBe(false);
  });
  test("Super Admin aktif terakhir tidak boleh dicabut", () => {
    expect(canRemoveSuperAdmin(1)).toBe(false);
    expect(canRemoveSuperAdmin(0)).toBe(false);
    expect(canRemoveSuperAdmin(2)).toBe(true);
  });
});

// § Fase 216, ADR-0053 — ubah tingkat staf (Admin `staff` ↔ Super Admin `admin`) sebagai SATU operasi: hasil akhir tepat satu dari kedua role, role lain (customer) tak disentuh.
describe("planTierSwitch", () => {
  test("Admin → Super Admin: mengganti staff dengan admin, customer tetap", () => {
    expect(planTierSwitch(["staff"], "admin")).toEqual({ ok: true, noop: false, before: ["staff"], after: ["admin"], promotes: true, demotes: false });
    expect(planTierSwitch(["customer", "staff"], "admin")).toEqual({ ok: true, noop: false, before: ["customer", "staff"], after: ["admin", "customer"], promotes: true, demotes: false });
  });
  test("Super Admin → Admin: demotes=true (rute wajib memeriksa Super Admin aktif terakhir)", () => {
    expect(planTierSwitch(["admin"], "staff")).toEqual({ ok: true, noop: false, before: ["admin"], after: ["staff"], promotes: false, demotes: true });
  });
  test("sudah di tingkat itu → noop", () => {
    expect(planTierSwitch(["admin"], "admin")).toMatchObject({ ok: true, noop: true, promotes: false, demotes: false });
    expect(planTierSwitch(["customer", "staff"], "staff")).toMatchObject({ ok: true, noop: true });
  });
  test("bukan akun staf (hanya customer / tanpa role) → NOT_STAFF", () => {
    expect(planTierSwitch(["customer"], "admin")).toEqual({ ok: false, code: "NOT_STAFF" });
    expect(planTierSwitch([], "staff")).toEqual({ ok: false, code: "NOT_STAFF" });
  });
  test("keadaan janggal (punya admin DAN staff) dinormalkan ke satu tingkat, bukan noop", () => {
    expect(planTierSwitch(["admin", "staff"], "admin")).toMatchObject({ ok: true, noop: false, after: ["admin"], promotes: false, demotes: false });
    expect(planTierSwitch(["admin", "staff"], "staff")).toMatchObject({ ok: true, noop: false, after: ["staff"], demotes: true });
  });
});

