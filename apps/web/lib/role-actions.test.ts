import { describe, test, expect } from "bun:test";
import { availableRoleActions, roleActionError, ROLE_ACTION_TEXT } from "./role-actions";

// § Fase 189H — tombol aksi peran yang relevan per daftar role; pesan galat ramah.
describe("availableRoleActions", () => {
  test("customer biasa: jadikan Admin / Super Admin", () => {
    expect(availableRoleActions(["customer"])).toEqual(["grant_staff", "grant_admin"]);
  });
  test("staf saja: aktifkan akses pengguna + cabut role Admin", () => {
    expect(availableRoleActions(["staff"])).toEqual(["grant_customer", "revoke_staff"]);
  });
  test("ber-role ganda: cabut akses pengguna dan cabut role admin", () => {
    expect(availableRoleActions(["admin", "customer"])).toEqual(["revoke_customer", "revoke_admin"]);
  });
  test("semua aksi punya teks", () => {
    for (const a of ["grant_customer", "grant_admin", "grant_staff", "revoke_customer", "revoke_admin", "revoke_staff"] as const) expect(ROLE_ACTION_TEXT[a].button.length).toBeGreaterThan(0);
  });
});
describe("roleActionError", () => {
  test("kode dikenal → pesan; lain → generik", () => {
    expect(roleActionError("CANNOT_CHANGE_OWN_ROLE")).toContain("sendiri");
    expect(roleActionError(undefined)).toContain("Gagal");
    expect(roleActionError("X")).toContain("Gagal");
  });
});

import { eraseReasonText, ERASE_TEXT } from "./role-actions";
describe("eraseReasonText / ERASE_TEXT", () => {
  test("alasan dilewati dibuat ramah; tabel dipetakan ke istilah pengguna", () => {
    expect(eraseReasonText({ code: "HAS_RECORDS", tables: ["invoices", "subscriptions"] })).toContain("invoice, langganan");
    expect(eraseReasonText({ code: "SELF" })).toContain("Anda sendiri");
    expect(eraseReasonText({ code: "IMPORT_RUNNING" })).toContain("import");
  });
  test("kata konfirmasi", () => {
    expect(ERASE_TEXT.delete.word).toBe("HAPUS");
    expect(ERASE_TEXT.anonymize.word).toBe("ANONIMKAN");
  });
});
