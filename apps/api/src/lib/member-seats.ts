import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, ilike } from "drizzle-orm";
import { db } from "./db";
import { memberSeats, session as sessionTable } from "../db/schema";

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

// § Fase 110, architecture-user-tambahan.md — token invite: HASH saja yang
// disimpan (`inviteTokenHash`), token MENTAH cuma ada di link yang
// dikirim lewat email, tidak pernah ditulis ke DB (pola sama token
// verifikasi email Better Auth).
export function generateInviteToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token), expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// § Dipanggil dari `databaseHooks.user.create.after` (`lib/auth.ts`, path
// `/callback/:id` — Google OAuth) SETELAH akun baru dibuat. Match by EMAIL
// (bukan token) karena jalur Google TIDAK PERNAH melewati halaman
// `/invite/[token]` — Google sendiri sudah membuktikan kepemilikan email
// itu (OAuth), jadi match-by-email di sini SAH sebagai bukti kepemilikan,
// setara token untuk jalur password. `ilike` (bukan `eq`) — email
// dibandingkan case-insensitive (Better Auth sendiri normalize email jadi
// lowercase saat simpan, TAPI `invitedEmail` diisi APA ADANYA dari input
// admin/user pengundang saat invite — bisa saja beda kapitalisasi).
export async function linkGoogleSignupToPendingInvite(userId: string, email: string): Promise<void> {
  // § security review Fase 110 (Medium) — jalur password (`invites.route.ts`
  // `findValidInviteByToken`) cek expiry token eksplisit; jalur Google ini
  // sebelumnya TIDAK, sehingga invite yang sudah lewat 7 hari (§ salinan
  // email "berlaku 7 hari") tetap bisa diklaim lewat Google sign-up selama
  // primary user belum revoke manual. Disamakan: expiry WAJIB dicek juga
  // di sini, konsisten dengan jalur password.
  const pending = await db
    .select({ id: memberSeats.id })
    .from(memberSeats)
    .where(
      and(
        eq(memberSeats.status, "invited"),
        ilike(memberSeats.invitedEmail, email),
        gt(memberSeats.inviteTokenExpiresAt, new Date()),
      ),
    );
  for (const seat of pending) {
    await db
      .update(memberSeats)
      .set({ memberUserId: userId, status: "active", acceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(memberSeats.id, seat.id));
  }
}

// § Dipakai `POST /me/team/:seatId/revoke` — cabut SEMUA sesi aktif
// member yang di-revoke (dia harus benar2 langsung ke-logout, bukan
// tetap bisa akses sampai token/cookie kadaluarsa sendiri).
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
}
