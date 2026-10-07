import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, like } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { user as userTable, verification } from "../db/schema";

// § 2026-10-07 — laporan client: ganti password 2× lewat link email, login tetap gagal. Akar masalah: email BELUM terverifikasi (daftar mandiri), dan reset password
// bawaan Better Auth tidak memverifikasinya. Sekarang reset lewat link email (bukti pemilik mengakses kotak surat) otomatis menandai email terverifikasi.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler);
const post = (path: string, body: unknown) =>
  testApp.handle(new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function signUp(email: string, password: string) {
  const res = await post("/api/auth/sign-up/email", { email, password, name: "Reset Test" });
  return ((await res.json()) as { user: { id: string } }).user.id;
}

// Token reset diambil dari tabel verification (identifier "reset-password:<token>", value = userId) — email aslinya dikirim lewat job queue.
async function latestResetToken(userId: string): Promise<string> {
  const rows = await db.select().from(verification).where(like(verification.identifier, "reset-password:%"));
  const mine = rows.filter((r) => r.value === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!mine) throw new Error("token reset tidak ditemukan");
  return mine.identifier.replace("reset-password:", "");
}

describe("reset password menandai email terverifikasi", () => {
  test("akun belum terverifikasi: login ditolak 403 EMAIL_NOT_VERIFIED (walau password benar) → setelah reset lewat link, login BERHASIL dan email_verified = true", async () => {
    const email = `reset-unverified-${runId}@test.local`;
    const userId = await signUp(email, "PasswordLama123!");

    const before = await post("/api/auth/sign-in/email", { email, password: "PasswordLama123!" });
    expect(before.status).toBe(403);
    expect(((await before.json()) as { code: string }).code).toBe("EMAIL_NOT_VERIFIED");

    expect((await post("/api/auth/request-password-reset", { email, redirectTo: "http://localhost/reset-password" })).status).toBe(200);
    const token = await latestResetToken(userId);
    const reset = await post("/api/auth/reset-password", { newPassword: "PasswordBaru456!", token });
    expect(reset.status).toBe(200);

    const [row] = await db.select().from(userTable).where(eq(userTable.id, userId));
    expect(row!.emailVerified).toBe(true);
    const after = await post("/api/auth/sign-in/email", { email, password: "PasswordBaru456!" });
    expect(after.status).toBe(200);
    // password lama tidak lagi berlaku
    expect((await post("/api/auth/sign-in/email", { email, password: "PasswordLama123!" })).status).toBe(401);
  });

  test("akun yang sudah terverifikasi tetap terverifikasi dan password barunya berlaku", async () => {
    const email = `reset-verified-${runId}@test.local`;
    const userId = await signUp(email, "PasswordLama123!");
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, userId));
    await post("/api/auth/request-password-reset", { email, redirectTo: "http://localhost/reset-password" });
    const token = await latestResetToken(userId);
    expect((await post("/api/auth/reset-password", { newPassword: "PasswordBaru456!", token })).status).toBe(200);
    expect((await db.select().from(userTable).where(eq(userTable.id, userId)))[0]!.emailVerified).toBe(true);
    expect((await post("/api/auth/sign-in/email", { email, password: "PasswordBaru456!" })).status).toBe(200);
  });

  test("token reset yang tidak valid TIDAK memverifikasi apa pun", async () => {
    const email = `reset-badtoken-${runId}@test.local`;
    const userId = await signUp(email, "PasswordLama123!");
    const res = await post("/api/auth/reset-password", { newPassword: "PasswordBaru456!", token: "token-ngawur" });
    expect(res.status).toBe(400);
    expect((await db.select().from(userTable).where(eq(userTable.id, userId)))[0]!.emailVerified).toBe(false);
  });
});
