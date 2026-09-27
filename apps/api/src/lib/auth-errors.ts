import { APIError } from "better-auth";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { user as userTable } from "../db/schema";

// § BUG DITEMUKAN 2026-09-27 (audit menyeluruh), FIX SUBSTANSIAL — investigasi
// pertama hari ini (fix `admin/staff.route.ts`/`admin/users.route.ts`)
// SALAH ASUMSI: baca source `sign-up.mjs` menemukan
// `throw APIError.from(..., USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL)`, TAPI
// throw itu HANYA terjadi kalau `shouldReturnGenericDuplicateResponse ===
// false`. Project ini set `requireEmailVerification: true` (`lib/auth.ts`)
// yang bikin `shouldReturnGenericDuplicateResponse` SELALU `true` —
// DIKONFIRMASI EMPIRIS (test langsung panggil `signUpEmail` 2x sequential
// untuk email yang sama): percobaan KEDUA **TIDAK PERNAH throw**, dia
// balikin `{token: null, user: {...SINTETIS, id BARU YANG TIDAK PERNAH
// DISIMPAN KE DB...}}` — dirancang MEMANG begitu oleh Better Auth untuk
// cegah email enumeration (respons duplikat harus SAMA BENTUK dengan
// respons sukses). Akibatnya `if (!result?.user)` (cek lama) TIDAK PERNAH
// true untuk kasus ini — kode lanjut pakai `result.user.id` yang PALSU
// buat `db.insert(userRoles)`/`linkAccount` dst → FOREIGN KEY VIOLATION
// (raw PostgresError, uncaught) → 500 generik. **INI ROOT CAUSE ASLI bug
// "Gagal membuat akun staff — coba lagi." untuk fajar@cpssoft.com** — fix
// pertama hari ini (cuma tangkap throw) TIDAK PERNAH benar-benar
// memperbaiki kasus paling umum ini, cuma menambah kode mati.
//
// Ditemukan JUGA (test race Promise.allSettled langsung ke `signUpEmail`,
// bypass pre-check): kalau 2 request BENAR-BENAR simultan lolos
// pre-check internal Better Auth SEKALIGUS, salah satu throw `APIError`
// code `FAILED_TO_CREATE_USER` (422) — BUKAN `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`
// — karena keduanya mencoba INSERT nyata dan yang kedua menabrak unique
// constraint DB (Better Auth menangkap raw PostgresError itu SENDIRI di
// `catch` internalnya, membungkusnya jadi `FAILED_TO_CREATE_USER` generik).
//
// KESIMPULAN: ada 3 bentuk kegagalan "email sudah terdaftar" yang mungkin
// muncul dari `signUpEmail()` di project ini, TIDAK ADA yang tunggal aman
// diandalkan sendirian — makanya dibungkus 1 helper `safeSignUpEmail`
// (bukan cuma fungsi deteksi seperti sebelumnya) yang menangani KETIGANYA
// sekaligus + pre-check (menutup kasus PALING UMUM/sequential secara
// eksplisit, bukan cuma bereaksi ke exception):
// 1. Pre-check by email SEBELUM panggil signUpEmail — reliable untuk
//    kasus normal/sequential (SATU-SATUNYA kasus yang benar-benar
//    terjadi di bug asli fajar@cpssoft.com).
// 2. `catch` untuk `APIError` code `FAILED_TO_CREATE_USER` ATAU
//    `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` — race window sempit di
//    antara pre-check & signUpEmail (request lain menang duluan).
// 3. Verifikasi SETELAH signUpEmail "berhasil" — `result.user.id` yang
//    dikembalikan BENAR-BENAR ada di tabel `user` (bukan id sintetis) —
//    jaring pengaman TERAKHIR kalau kedua lapis di atas entah bagaimana
//    terlewati (race di dalam race), SEBELUM `id` itu dipakai untuk
//    INSERT ke tabel lain (userRoles/memberSeats/dst) yang akan gagal FK
//    kalau id-nya palsu.
export type SafeSignUpResult = { ok: true; userId: string } | { ok: false; reason: "EMAIL_ALREADY_EXISTS" | "CREATE_FAILED" };

export async function safeSignUpEmail(params: { email: string; password: string; name: string }): Promise<SafeSignUpResult> {
  const [existing] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, params.email));
  if (existing) return { ok: false, reason: "EMAIL_ALREADY_EXISTS" };

  let result: Awaited<ReturnType<typeof auth.api.signUpEmail>>;
  try {
    result = await auth.api.signUpEmail({ body: params });
  } catch (err) {
    if (err instanceof APIError && (err.body?.code === "FAILED_TO_CREATE_USER" || err.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")) {
      return { ok: false, reason: "EMAIL_ALREADY_EXISTS" };
    }
    throw err;
  }
  if (!result?.user) return { ok: false, reason: "CREATE_FAILED" };

  // § jaring pengaman #3 — `result.user` truthy TIDAK CUKUP (bisa
  // sintetis/palsu, § komentar besar di atas). Verifikasi id-nya BENAR
  // ada di DB sebelum caller memakainya untuk insert ke tabel lain.
  const [created] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, result.user.id));
  if (!created) return { ok: false, reason: "EMAIL_ALREADY_EXISTS" };

  return { ok: true, userId: result.user.id };
}
