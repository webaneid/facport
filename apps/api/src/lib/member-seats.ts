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
    // § Fase 189B (audit, Medium) — bersyarat: slot yang DICABUT/dipindahkan di antara pembacaan dan penulisan tidak boleh dihidupkan lagi.
    await db
      .update(memberSeats)
      .set({ memberUserId: userId, status: "active", acceptedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(memberSeats.id, seat.id), eq(memberSeats.status, "invited")));
  }
}

// § Menautkan penerima undangan ke slot — dipakai `routes/invites.route.ts` (akun baru & akun existing). BERSYARAT (audit 189B, Medium): hanya bila slot MASIH
// `invited` dengan hash token yang sama dengan yang divalidasi pemanggil. `revokeSeat` mengunci baris (FOR UPDATE), tetapi penerima undangan membaca dulu lalu menulis
// belakangan; tanpa syarat ini slot yang baru dicabut/dipindahkan bisa hidup lagi untuk orang yang sudah dicabut. Mengembalikan false bila tidak ada baris yang berubah.
export async function linkSeatToMember(seatId: string, memberUserId: string, expectedTokenHash: string): Promise<boolean> {
  const updated = await db
    .update(memberSeats)
    .set({ memberUserId, status: "active", acceptedAt: new Date(), inviteTokenHash: null, inviteTokenExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(memberSeats.id, seatId), eq(memberSeats.status, "invited"), eq(memberSeats.inviteTokenHash, expectedTokenHash)))
    .returning({ id: memberSeats.id });
  return updated.length > 0;
}

// § Dipakai `POST /me/team/:seatId/revoke` dan aksi admin — hapus SEMUA sesi (baris DB) member yang dicabut. Catatan: Better Auth memakai cookie cache 5 menit
// (`lib/auth.ts`), jadi sesinya bisa tampak valid sampai 5 menit; AKSES ke Data Usaha tetap terputus seketika karena dicek ke tabel seat per request
// (`lib/seat-access.ts`).
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(sessionTable).where(eq(sessionTable.userId, userId));
}
