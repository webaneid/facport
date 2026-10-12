import { eq } from "drizzle-orm";
import { db } from "./db";
import { memberSeats, user as userTable } from "../db/schema";
import { generateInviteToken, revokeAllSessions } from "./member-seats";
import { DATA_USAHA_EVENT, insertDataUsahaEvent } from "./data-usaha-events";
import { boss, JOBS, startQueue } from "./queue";
import { escapeHtml } from "./email";
import { env } from "./env";
import { logger } from "./logger";

// § Fase 189B — logika undang/cabut seat User Tambahan, DIEKSTRAK dari `routes/team.route.ts` (sisi PEMILIK) agar dipakai juga oleh aksi admin
// (`routes/admin/seats.route.ts`) tanpa salinan. Tiap aksi: kunci baris seat (`FOR UPDATE`) → validasi → ubah → tulis riwayat Data Usaha, SEMUANYA dalam satu
// transaksi (aksi dan jejaknya selalu bersama; dua aksi bersamaan pada slot yang sama dijalankan bergiliran). Pemeriksaan KEPEMILIKAN/IZIN tetap di route pemanggil.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SeatActor = { id: string; role: "owner" | "admin" };
export type SeatActionErrorCode = "SEAT_NOT_FOUND" | "SEAT_ALREADY_AVAILABLE" | "SEAT_NOT_AVAILABLE";
/** Status HTTP baku per kode (sama dengan perilaku route pemilik sebelum ekstraksi). */
export const SEAT_ERROR_STATUS: Record<SeatActionErrorCode, number> = { SEAT_NOT_FOUND: 404, SEAT_ALREADY_AVAILABLE: 400, SEAT_NOT_AVAILABLE: 400 };

export class SeatActionError extends Error {
  constructor(readonly code: SeatActionErrorCode) {
    super(code);
    this.name = "SeatActionError";
  }
}

// seat harus milik Data Usaha yang diklaim pemanggil (cegah mengutak-atik seat Data Usaha lain lewat id) — tidak ditemukan = 404, bukan 403, agar tak membocorkan keberadaan.
async function lockSeat(tx: Tx, seatId: string, dataUsahaId: string) {
  const [seat] = await tx.select().from(memberSeats).where(eq(memberSeats.id, seatId)).for("update");
  if (!seat || seat.dataUsahaId !== dataUsahaId) throw new SeatActionError("SEAT_NOT_FOUND");
  return seat;
}

export async function inviteSeat(params: { seatId: string; dataUsahaId: string; actor: SeatActor; email: string }) {
  const email = params.email.trim().toLowerCase(); // seragam dengan Better Auth (simpan lowercase) dan jalur admin
  const { token, tokenHash, expiresAt } = generateInviteToken();
  await db.transaction(async (tx) => {
    const seat = await lockSeat(tx, params.seatId, params.dataUsahaId);
    if (seat.status !== "available") throw new SeatActionError("SEAT_NOT_AVAILABLE");
    const now = new Date();
    await tx
      .update(memberSeats)
      .set({ invitedEmail: email, inviteTokenHash: tokenHash, inviteTokenExpiresAt: expiresAt, status: "invited", invitedAt: now, updatedAt: now })
      .where(eq(memberSeats.id, seat.id));
    await insertDataUsahaEvent(tx, {
      dataUsahaId: params.dataUsahaId,
      action: DATA_USAHA_EVENT.INVITE_SEAT,
      actorId: params.actor.id,
      changes: { seatId: seat.id, email, by: params.actor.role },
    });
  });
  return { token, email, expiresAt };
}

export async function revokeSeat(params: { seatId: string; dataUsahaId: string; actor: SeatActor; reason?: string; newEmail?: string }) {
  const invite = params.newEmail ? generateInviteToken() : null;
  const result = await db.transaction(async (tx) => {
    const seat = await lockSeat(tx, params.seatId, params.dataUsahaId);
    if (seat.status === "available") throw new SeatActionError("SEAT_ALREADY_AVAILABLE");

    const previousMemberUserId = seat.memberUserId;
    let previousEmail = seat.invitedEmail;
    if (previousMemberUserId) {
      const [member] = await tx.select({ email: userTable.email }).from(userTable).where(eq(userTable.id, previousMemberUserId));
      previousEmail = member?.email ?? previousEmail;
    }
    const now = new Date();
    await tx
      .update(memberSeats)
      .set({
        memberUserId: null,
        invitedEmail: params.newEmail ?? null,
        inviteTokenHash: invite?.tokenHash ?? null,
        inviteTokenExpiresAt: invite?.expiresAt ?? null,
        status: invite ? "invited" : "available",
        ...(invite ? { invitedAt: now } : {}),
        revokedAt: now,
        revokedBy: params.actor.id,
        updatedAt: now,
      })
      .where(eq(memberSeats.id, seat.id));
    await insertDataUsahaEvent(tx, {
      dataUsahaId: params.dataUsahaId,
      action: DATA_USAHA_EVENT.REVOKE_SEAT,
      actorId: params.actor.id,
      changes: {
        seatId: seat.id,
        previousStatus: seat.status,
        email: previousEmail,
        memberUserId: previousMemberUserId,
        by: params.actor.role,
        ...(params.reason ? { reason: params.reason } : {}),
        ...(params.newEmail ? { newInviteEmail: params.newEmail } : {}),
      },
    });
    return { previousStatus: seat.status, previousMemberUserId, previousEmail };
  });

  // WAJIB cabut sesi aktif member yang dicabut — dia harus langsung ke-logout, bukan tetap bisa akses sampai sesi kadaluarsa sendiri. (Mencabut SEMUA sesi akunnya,
  // perilaku lama dipertahankan; akun yang juga punya akses di Data Usaha lain cukup login ulang.)
  // Non-fatal: transaksi (slot + riwayat) SUDAH commit; kegagalan menghapus sesi tidak boleh membalas 500 dan melewatkan notifikasi/email pemanggil. Akses data tetap terputus
  // karena dicek ke tabel seat per request; sesi yang tersisa hanya sesi akun.
  if (result.previousMemberUserId) {
    try {
      await revokeAllSessions(result.previousMemberUserId);
    } catch (err) {
      logger.error({ err: (err as Error).name, dataUsahaId: params.dataUsahaId }, "Seat dicabut, tetapi pencabutan sesi member gagal");
    }
  }
  return { ...result, invite: invite && params.newEmail ? { token: invite.token, email: params.newEmail } : undefined };
}

// `||` (bukan `??`) SENGAJA — .env sering set APP_ORIGIN_PROD= (string kosong, bukan unset).
function getAppOrigin(): string {
  return env.APP_ORIGIN_PROD || "http://app.localhost:6209";
}

/** Email undangan. `onBehalfOfOwner` = undangan dikirim TIM FACPORT (aksi admin) — tidak menyamar sebagai pemilik, dan HANYA mengklaim hal yang dipenuhi sistem (pemilik diberi tahu). */
export async function sendSeatInviteEmail(params: { to: string; inviterName: string; dataUsahaName: string; token: string; onBehalfOfOwner?: boolean }) {
  const inviteUrl = `${getAppOrigin()}/invite/${params.token}`;
  const safeInviter = escapeHtml(params.inviterName);
  const safeDataUsaha = escapeHtml(params.dataUsahaName);
  await startQueue();
  await boss.send(JOBS.SEND_EMAIL, {
    to: params.to,
    subject: params.onBehalfOfOwner ? "Undangan User Tambahan Facport" : `${params.inviterName || "Seseorang"} mengundangmu ke Facport`,
    html: params.onBehalfOfOwner
      ? `<p>Tim Facport mengundang kamu sebagai User Tambahan untuk Data Usaha <strong>${safeDataUsaha}</strong> di Facport. Pemilik Data Usaha (${safeInviter}) telah diberi tahu tentang undangan ini.</p><p>Klik link berikut untuk menerima undangan (berlaku 7 hari): <a href="${inviteUrl}">${inviteUrl}</a></p><p>Kalau kamu tidak mengenal Data Usaha ini, abaikan email ini.</p>`
      : `<p>${safeInviter} mengundang kamu sebagai User Tambahan untuk Data Usaha <strong>${safeDataUsaha}</strong> di Facport.</p><p>Klik link berikut untuk menerima undangan (berlaku 7 hari): <a href="${inviteUrl}">${inviteUrl}</a></p>`,
  });
}

/** Email pemberitahuan ke PEMILIK saat admin mengubah akses User Tambahan (selain notifikasi in-app). Isi generik: alasan admin adalah catatan internal. */
export async function sendSeatAccessChangedEmailToOwner(params: { to: string; ownerName: string; dataUsahaName: string; summary: string }) {
  await startQueue();
  await boss.send(JOBS.SEND_EMAIL, {
    to: params.to,
    subject: `Akses User Tambahan diubah — ${params.dataUsahaName}`,
    html: `<p>Halo ${escapeHtml(params.ownerName)},</p><p>${escapeHtml(params.summary)}</p><p>Kalau kamu tidak mengenali perubahan ini, segera hubungi tim Facport.</p>`,
  });
}
