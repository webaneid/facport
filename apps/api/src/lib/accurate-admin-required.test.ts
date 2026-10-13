import { describe, test, expect } from "bun:test";
import { AccurateApiError, parseAdminRequired } from "./accurate";

// § Fase 192, ADR-0047 — galat Accurate "perlu hak Administrator untuk memasang aplikasi" dikenali + tautan instalasi diteruskan HANYA bila https & host persis account.accurate.id.
const REAL =
  "Anda memerlukan hak Administrator untuk mulai menginstall Aplikasi facport pada data usaha PT.Buana Indah Marketama Sejahtera. Gunakan link https://account.accurate.id/marketplace/user/application-install-confirm.do?appKey=86b6b881-2e24-4382-8911-73f95a44c6d1&databaseId=519021 untuk menginstall aplikasi.";

describe("parseAdminRequired", () => {
  test("mengenali pesan asli dan mengambil tautan instalasi", () => {
    const r = parseAdminRequired(new AccurateApiError(REAL, 500));
    expect(r).not.toBeNull();
    expect(r!.installUrl).toBe("https://account.accurate.id/marketplace/user/application-install-confirm.do?appKey=86b6b881-2e24-4382-8911-73f95a44c6d1&databaseId=519021");
  });

  test("tanda baca di ujung tautan tidak ikut", () => {
    const r = parseAdminRequired(new AccurateApiError("Anda memerlukan hak Administrator untuk menginstall. Buka https://account.accurate.id/x?a=1.", 500));
    expect(r!.installUrl).toBe("https://account.accurate.id/x?a=1");
  });

  test("galat Accurate lain → null", () => {
    expect(parseAdminRequired(new AccurateApiError("Masa ujicoba database sudah berakhir", 500))).toBeNull();
    expect(parseAdminRequired(new Error("hak Administrator"))).toBeNull(); // bukan AccurateApiError
    expect(parseAdminRequired("hak Administrator")).toBeNull();
  });

  test("pesan dikenali tapi tanpa tautan → installUrl null", () => {
    const r = parseAdminRequired(new AccurateApiError("Anda memerlukan hak Administrator untuk menginstall aplikasi", 500));
    expect(r).not.toBeNull();
    expect(r!.installUrl).toBeNull();
  });

  test("tautan ke host lain (termasuk yang menyerupai) TIDAK diteruskan", () => {
    for (const url of [
      "https://evil.example/install",
      "https://account.accurate.id.evil.example/x",
      "https://evil.example/account.accurate.id/x",
      "http://account.accurate.id/x",
      "https://account.accurate.id:8443/x",
      "https://account.accurate.id@evil.example/x",
      "javascript:alert(1)",
    ]) {
      const r = parseAdminRequired(new AccurateApiError(`Anda memerlukan hak Administrator untuk menginstall. Gunakan ${url} segera`, 500));
      expect(r).not.toBeNull();
      expect(r!.installUrl).toBeNull();
    }
  });
});
