import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { user as userTable } from "../db/schema";
import { safeSignUpEmail } from "./auth-errors";

// § diminta user 2026-09-27 (audit menyeluruh) — verifikasi `safeSignUpEmail`
// menangani SEMUA 3 bentuk kegagalan "email sudah terdaftar" yang
// dikonfirmasi EMPIRIS lewat test langsung (bukan tebakan bentuk error-nya):
// (1) kasus normal/sequential (Better Auth balikin user SINTETIS/PALSU,
// BUKAN throw, karena `requireEmailVerification: true` — INI root cause
// ASLI bug "Gagal membuat akun staff" untuk fajar@cpssoft.com, § lessons-learned.md),
// (2) race window sempit (APIError `FAILED_TO_CREATE_USER`, dikonfirmasi
// via Promise.allSettled langsung ke `signUpEmail`).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Auth Errors Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

describe("safeSignUpEmail", () => {
  test("ok:true dengan userId yang BENAR tersimpan di DB untuk email baru", async () => {
    const email = `auth-errors-new-${runId}@test.local`;
    const result = await safeSignUpEmail({ email, password: "TestPassword123!", name: "Orang Baru" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const [row] = await db.select().from(userTable).where(eq(userTable.id, result.userId));
    expect(row).toBeTruthy();
    expect(row!.email).toBe(email);
  });

  // § kasus PALING UMUM & PALING PENTING — ini yang sebelumnya TIDAK
  // pernah tertangkap oleh fix pertama hari ini (cek throw yang ternyata
  // tidak pernah terjadi). Better Auth balikin user SINTETIS untuk kasus
  // ini (dikonfirmasi via test langsung: id yang dikembalikan TIDAK ADA
  // di tabel user) — `safeSignUpEmail` WAJIB balikin ok:false, BUKAN
  // ok:true dengan id palsu yang akan bikin FK violation di caller.
  test("ok:false EMAIL_ALREADY_EXISTS untuk email yang SUDAH terdaftar (kasus normal/sequential)", async () => {
    const email = `auth-errors-dup-${runId}@test.local`;
    await signUp(email);

    const result = await safeSignUpEmail({ email, password: "AnotherPassword123!", name: "Duplicate Attempt" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("EMAIL_ALREADY_EXISTS");
  });

  // § race window BENAR-BENAR simultan (dikonfirmasi empiris: salah satu
  // throw APIError code FAILED_TO_CREATE_USER, BUKAN USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL)
  // — `safeSignUpEmail` WAJIB tetap balikin ok:false yang benar, TIDAK
  // boleh ikut throw ke caller (jatuh ke 500 generik).
  test("salah satu ok:false EMAIL_ALREADY_EXISTS kalau 2 signUpEmail BENAR-BENAR simultan untuk email yang sama", async () => {
    const email = `auth-errors-race-${runId}@test.local`;
    const [r1, r2] = await Promise.all([
      safeSignUpEmail({ email, password: "Password123!", name: "Race A" }),
      safeSignUpEmail({ email, password: "Password123!", name: "Race B" }),
    ]);

    const results = [r1, r2];
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;
    // § tidak dijamin urutan mana yang menang, tapi HARUS persis 1 sukses + 1 gagal (TIDAK BOLEH keduanya throw/ok).
    expect(okCount).toBe(1);
    expect(failCount).toBe(1);
    const loser = results.find((r) => !r.ok)!;
    if (loser.ok) throw new Error("unreachable");
    expect(loser.reason).toBe("EMAIL_ALREADY_EXISTS");
  });
});
