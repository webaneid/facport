import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, ilike } from "drizzle-orm";
import { db } from "./db";
import { ownershipTransfers, dataUsaha } from "../db/schema";

const TRANSFER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

// § pola SAMA `lib/member-seats.ts` generateInviteToken/hashInviteToken —
// duplikasi sengaja (konvensi project ini, § getAppOrigin() di beberapa
// route), bukan digabung 1 helper bersama karena 2 domain berbeda (seat
// vs transfer kepemilikan) walau kebetulan sama-sama "token+hash+expiry".
export function generateTransferToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashTransferToken(token), expiresAt: new Date(Date.now() + TRANSFER_TOKEN_TTL_MS) };
}

export function hashTransferToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// § Dipakai `GET /transfers/:token`, `POST /transfers/:token/accept(-existing)`.
// SELAIN cek hash+status+expiry, WAJIB verifikasi `fromUserId` MASIH SAMA
// dengan `data_usaha.userId` SAAT INI — kalau kepemilikan sudah berubah
// lewat jalur lain sejak transfer ini diinisiasi (mis. admin transfer
// langsung, atau transfer lain yang lebih dulu di-accept), token ini
// otomatis jadi stale dan HARUS ditolak, walau hash/expiry-nya sendiri
// masih valid — mencegah transfer "menimpa" kepemilikan yang sudah pindah.
export async function findValidTransferByToken(token: string) {
  const tokenHash = hashTransferToken(token);
  const now = new Date();
  const [row] = await db
    .select({ transfer: ownershipTransfers, currentOwnerId: dataUsaha.userId, dataUsahaName: dataUsaha.name })
    .from(ownershipTransfers)
    .innerJoin(dataUsaha, eq(dataUsaha.id, ownershipTransfers.dataUsahaId))
    .where(and(eq(ownershipTransfers.tokenHash, tokenHash), eq(ownershipTransfers.status, "pending"), gt(ownershipTransfers.tokenExpiresAt, now)));
  if (!row) return null;
  if (row.transfer.fromUserId !== row.currentOwnerId) return null;
  return row;
}

// § Dipanggil dari `databaseHooks.user.create.after` (`lib/auth.ts`, path
// `/callback/:id` — Google OAuth) SETELAH akun baru dibuat — pola SAMA
// PERSIS `lib/member-seats.ts` `linkGoogleSignupToPendingInvite` (Fase
// 110): halaman `/transfer/[token]` juga menawarkan tombol Google, tapi
// jalur Google TIDAK PERNAH melewati form yang panggil `accept` biasa,
// jadi eksekusi transfer utk akun BARU-via-Google harus terjadi DI SINI.
// `ilike` (case-insensitive, alasan sama seperti fungsi seat) + expiry
// dicek eksplisit (§ lesson dari security review Fase 110 — celah expiry
// tidak dicek di jalur Google, JANGAN ulangi lagi di sini). `fromUserId`
// juga WAJIB masih = pemilik SEKARANG (guard stale-ownership yang sama
// dengan `findValidTransferByToken`) — dicek eksplisit lewat join, bukan
// diasumsikan aman cuma karena status masih "pending".
export async function linkGoogleSignupToPendingTransfer(userId: string, email: string): Promise<void> {
  const pending = await db
    .select({ id: ownershipTransfers.id, dataUsahaId: ownershipTransfers.dataUsahaId, fromUserId: ownershipTransfers.fromUserId, currentOwnerId: dataUsaha.userId })
    .from(ownershipTransfers)
    .innerJoin(dataUsaha, eq(dataUsaha.id, ownershipTransfers.dataUsahaId))
    .where(and(eq(ownershipTransfers.status, "pending"), ilike(ownershipTransfers.toEmail, email), gt(ownershipTransfers.tokenExpiresAt, new Date())));
  for (const row of pending) {
    if (row.fromUserId !== row.currentOwnerId) continue;
    await executeOwnershipTransfer(row.id, row.dataUsahaId, userId);
  }
}

// § Efek transfer HANYA `data_usaha.userId` — TIDAK PERNAH menulis ulang
// `subscriptions.userId`/`invoices.userId` (riwayat pembelian historis
// tetap milik pembeli asli, § ADR-0032/architecture-user-tambahan.md).
// `member_seats` juga TIDAK berubah (dataUsahaId tetap sama, akses seat
// tidak bergantung siapa pemiliknya).
export async function executeOwnershipTransfer(transferId: string, dataUsahaId: string, toUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(dataUsaha).set({ userId: toUserId, updatedAt: new Date() }).where(eq(dataUsaha.id, dataUsahaId));
    await tx
      .update(ownershipTransfers)
      .set({ status: "accepted", acceptedAt: new Date(), acceptedBy: toUserId, updatedAt: new Date() })
      .where(eq(ownershipTransfers.id, transferId));
  });
}
