import { describe, test, expect } from "bun:test";
import { anonymizedEmail, anonymizedName, isAnonymizedEmail, scrubJson, emailDigest, ERASE_CONFIRM_WORDS, classifyFk } from "./account-erasure";

// § Fase 189H, ADR-0045 — bagian MURNI penghapusan/anonimisasi: penanda anonim, scrub PII di JSON audit, konfirmasi ketik, klasifikasi FK (fail-closed).
describe("penanda anonim", () => {
  test("email & nama anonim deterministik per id, tidak memuat data asli, dikenali sebagai anonim", () => {
    const id = "abcd1234-ef56-7890";
    expect(anonymizedEmail(id)).toBe("anon-abcd1234-ef56-7890@anonymized.invalid");
    expect(anonymizedName(id)).toBe("Akun Anonim abcd1234");
    expect(isAnonymizedEmail(anonymizedEmail(id))).toBe(true);
    expect(isAnonymizedEmail("budi@test.local")).toBe(false);
    expect(isAnonymizedEmail("x@anonymized.invalid.evil.com")).toBe(false);
  });
  test("digest email: SHA-256 hex dari huruf kecil + spasi dipangkas; bukan email asli", () => {
    const d = emailDigest(" Budi@Test.Local ");
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    expect(d).toBe(emailDigest("budi@test.local"));
    expect(d).not.toContain("budi");
  });
  test("kata konfirmasi", () => {
    expect(ERASE_CONFIRM_WORDS).toEqual({ delete: "HAPUS", anonymize: "ANONIMKAN" });
  });
});

describe("scrubJson", () => {
  const repl = [
    { from: "budi@test.local", to: "anon-1@anonymized.invalid" },
    { from: "+6281234567890", to: "[dihapus]" },
  ];
  test("mengganti email (tak peka huruf besar/kecil) dan telepon di semua kedalaman, struktur tetap", () => {
    const input = { email: "Budi@Test.Local", nested: { list: ["x", "BUDI@test.local", { phone: "+6281234567890" }] }, n: 5, ok: true, nul: null };
    expect(scrubJson(input, repl)).toEqual({ email: "anon-1@anonymized.invalid", nested: { list: ["x", "anon-1@anonymized.invalid", { phone: "[dihapus]" }] }, n: 5, ok: true, nul: null });
  });
  test("karakter regex pada nilai ('+', '.') tidak diperlakukan sebagai pola; nilai mirip tidak ikut terganti", () => {
    expect(scrubJson({ a: "budiXtest.local", b: "+62812345678901" }, repl)).toEqual({ a: "budiXtest.local", b: "[dihapus]1" });
  });
  test("teks bebas yang memuat email ikut diganti; tanpa penggantian → objek sama isinya", () => {
    expect(scrubJson({ note: "undang budi@test.local ya" }, repl)).toEqual({ note: "undang anon-1@anonymized.invalid ya" });
    expect(scrubJson({ a: 1 }, [])).toEqual({ a: 1 });
  });
});

describe("classifyFk (fail-closed)", () => {
  test("cascade diabaikan; audit_logs.actor_id boleh di-NULL-kan; semua lainnya memblokir", () => {
    expect(classifyFk({ table: "session", column: "user_id", deleteType: "c" })).toBe("cascade");
    expect(classifyFk({ table: "audit_logs", column: "actor_id", deleteType: "a" })).toBe("nullable");
    expect(classifyFk({ table: "invoices", column: "user_id", deleteType: "a" })).toBe("blocking");
    expect(classifyFk({ table: "tabel_baru_masa_depan", column: "user_id", deleteType: "a" })).toBe("blocking");
    expect(classifyFk({ table: "media", column: "uploaded_by", deleteType: "a" })).toBe("blocking");
  });
});
