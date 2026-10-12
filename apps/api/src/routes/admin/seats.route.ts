import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { dataUsaha, user as userTable } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { createNotification, NOTIFICATION_TYPES } from "../../lib/notifications";
import { listDataUsahaEvents, REASON_NOTE_MAX_LENGTH } from "../../lib/data-usaha-events";
import { listSeatsForDataUsaha } from "../../lib/seat-queries";
import { SEAT_ERROR_STATUS, SeatActionError, revokeSeat, sendSeatAccessChangedEmailToOwner, sendSeatInviteEmail } from "../../lib/seat-actions";
import { logger } from "../../lib/logger";

// § Fase 189B, ADR-0044, D7/D15 — akses User Tambahan (seat) dari sisi ADMIN: melihat daftar slot + riwayat, mencabut, atau memindahkan akses (cabut + undang email baru di
// slot yang sama). Kasus nyata (Excel client butir 4): atasan meminta akses seseorang dihapus, atau karyawan resign tanpa serah terima. Logika bersama pemilik di
// `lib/seat-actions.ts`. Izin: baca `users.view` (admin & staf), aksi `subscriptions.manage` (selaras "Putuskan Koneksi"). Alasan WAJIB dan tercatat di riwayat Data Usaha.
export const adminSeatsRoute = new Elysia({ prefix: "/admin/data-usaha" })
  .use(permissionPlugin)
  .get(
    "/:id/access",
    async ({ params, set }) => {
      const [du] = await db
        .select({ id: dataUsaha.id, name: dataUsaha.name, ownerId: userTable.id, ownerName: userTable.name, ownerEmail: userTable.email })
        .from(dataUsaha)
        .innerJoin(userTable, eq(userTable.id, dataUsaha.userId))
        .where(eq(dataUsaha.id, params.id));
      if (!du) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      return { dataUsaha: du, seats: await listSeatsForDataUsaha(params.id), history: await listDataUsahaEvents(params.id, 50) };
    },
    { permission: "users.view", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/:id/seats/:seatId/revoke",
    async ({ params, body, user, set }) => {
      // alasan wajib (min. 3 karakter SETELAH trim) — skema hanya membatasi panjang kasar; spasi saja tidak dianggap alasan
      const reason = body.reason.trim();
      if (reason.length < 3) {
        set.status = 422;
        return { code: "REASON_REQUIRED" };
      }
      // skema memberi ruang 2× untuk spasi di tepi; yang TERSIMPAN (setelah trim) tetap dibatasi
      if (reason.length > REASON_NOTE_MAX_LENGTH) {
        set.status = 422;
        return { code: "REASON_TOO_LONG" };
      }
      const [du] = await db
        .select({ id: dataUsaha.id, name: dataUsaha.name, ownerId: userTable.id, ownerName: userTable.name, ownerEmail: userTable.email })
        .from(dataUsaha)
        .innerJoin(userTable, eq(userTable.id, dataUsaha.userId))
        .where(eq(dataUsaha.id, params.id));
      if (!du) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const newEmail = body.newEmail?.trim().toLowerCase() || undefined;

      let result;
      try {
        result = await revokeSeat({ seatId: params.seatId, dataUsahaId: du.id, actor: { id: user.id, role: "admin" }, reason, newEmail });
      } catch (err) {
        if (err instanceof SeatActionError) {
          set.status = SEAT_ERROR_STATUS[err.code];
          return { code: err.code };
        }
        throw err;
      }

      // Aksi SUDAH ter-commit (beserta riwayatnya): galat notifikasi/email tidak boleh membalas 500 seolah gagal — dicatat saja (tanpa PII).
      try {
        const who = result.previousEmail ?? "seorang pengguna";
        // SENGAJA generik: alasan yang dicatat admin adalah catatan internal dan tidak ditampilkan ke pelanggan (D15)
        const summary = result.invite
          ? `Akses ${who} di Data Usaha ${du.name} dicabut oleh tim Facport, dan slot itu kini diundangkan ke ${result.invite.email}.`
          : `Akses ${who} di Data Usaha ${du.name} dicabut oleh tim Facport. Slotnya tersedia kembali di halaman Kelola Tim.`;
        await createNotification({
          userId: du.ownerId,
          type: NOTIFICATION_TYPES.SEAT_ACCESS_CHANGED_BY_ADMIN,
          title: "Akses User Tambahan diubah",
          body: summary,
          entityType: "data_usaha",
          entityId: du.id,
        });
        // audit 189B (Medium): perubahan akses oleh admin tidak boleh hanya bergantung pada notifikasi in-app yang mungkin tak dibuka — pemilik juga diberi email.
        await sendSeatAccessChangedEmailToOwner({ to: du.ownerEmail, ownerName: du.ownerName, dataUsahaName: du.name, summary });
        if (result.invite) {
          await sendSeatInviteEmail({ to: result.invite.email, inviterName: du.ownerName, dataUsahaName: du.name, token: result.invite.token, onBehalfOfOwner: true });
        }
      } catch (err) {
        logger.error({ err: (err as Error).name, dataUsahaId: du.id }, "Aksi cabut akses tersimpan, tetapi notifikasi/email gagal");
      }
      return { ok: true, previousStatus: result.previousStatus, invited: !!result.invite };
    },
    {
      permission: "subscriptions.manage",
      params: t.Object({ id: t.String({ format: "uuid" }), seatId: t.String({ format: "uuid" }) }),
      body: t.Object({
        reason: t.String({ minLength: 3, maxLength: REASON_NOTE_MAX_LENGTH * 2 }),
        newEmail: t.Optional(t.String({ format: "email", maxLength: 255 })),
      }),
    },
  );
