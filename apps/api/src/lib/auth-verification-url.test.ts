import { describe, test, expect } from "bun:test";
import { normalizeVerificationUrl } from "./auth-verification-url";

const APP = "https://app.facinstitute.id";
const link = (callback?: string) => `https://api.facinstitute.id/api/auth/verify-email?token=abc.def${callback === undefined ? "" : `&callbackURL=${encodeURIComponent(callback)}`}`;
const callbackOf = (url: string) => new URL(url).searchParams.get("callbackURL");

describe("normalizeVerificationUrl — link verifikasi tidak boleh berakhir di domain API", () => {
  test("callbackURL '/' (bawaan Better Auth saat login tanpa callback) → origin aplikasi", () => {
    expect(callbackOf(normalizeVerificationUrl(link("/"), APP))).toBe("https://app.facinstitute.id/");
  });

  test("callbackURL hilang → origin aplikasi", () => {
    expect(callbackOf(normalizeVerificationUrl(link(), APP))).toBe("https://app.facinstitute.id/");
  });

  test("callbackURL relatif ber-path (mis. /subscribe?plans=x) → digabung dengan origin aplikasi, query terjaga", () => {
    expect(callbackOf(normalizeVerificationUrl(link("/subscribe?plans=a&plans=b"), APP))).toBe("https://app.facinstitute.id/subscribe?plans=a&plans=b");
  });

  test("callbackURL absolut (jalur daftar) tidak diubah", () => {
    const abs = "https://app.facinstitute.id/subscribe?plans=x";
    expect(callbackOf(normalizeVerificationUrl(link(abs), APP))).toBe(abs);
  });

  test("callbackURL relatif berbahaya (//evil.com, \\\\evil, tanpa slash) TIDAK pernah dipakai → halaman utama aplikasi", () => {
    for (const bad of ["//evil.com/x", "/\\evil.com", "evil.com", "javascript:alert(1)"]) {
      expect(callbackOf(normalizeVerificationUrl(link(bad), APP))).toBe("https://app.facinstitute.id/");
    }
  });

  test("token dan bagian lain URL tidak berubah", () => {
    const out = new URL(normalizeVerificationUrl(link("/"), APP));
    expect(out.origin).toBe("https://api.facinstitute.id");
    expect(out.pathname).toBe("/api/auth/verify-email");
    expect(out.searchParams.get("token")).toBe("abc.def");
  });

  test("origin aplikasi berakhiran slash tidak menggandakan slash", () => {
    expect(callbackOf(normalizeVerificationUrl(link("/x"), "https://app.facinstitute.id/"))).toBe("https://app.facinstitute.id/x");
  });
});
