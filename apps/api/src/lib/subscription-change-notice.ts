import { eq } from "drizzle-orm";
import { db } from "./db";
import { dataUsaha, user as userTable } from "../db/schema";
import { createNotification, NOTIFICATION_TYPES, formatNotificationDate } from "./notifications";
import { getCompanyTimezone } from "./company-timezone";
import { boss, JOBS, startQueue } from "./queue";
import { escapeHtml } from "./email";
import { logger } from "./logger";

// § Fase 182 — setiap perubahan masa aktif / pemberian paket oleh ADMIN tanpa invoice (mode Gratis, Ubah Masa Aktif, perpanjang cepat) memberi tahu PEMILIK Data Usaha SAAT INI:
// paket, tanggal lama → baru. Keputusan: SELALU diberi tahu (juga saat dipersingkat) — tidak ada perubahan masa aktif yang diam-diam. Best-effort pasca-commit: galat dicatat, tidak menggagalkan aksi admin.
export type SubscriptionChangeKind = "granted" | "extended" | "changed";

export function buildSubscriptionChangeNotice(p: { kind: SubscriptionChangeKind; featureLabel: string; dataUsahaName: string; oldEnd: Date | null; newEnd: Date | null; timeZone: string }): { title: string; body: string } {
  const fmt = (d: Date | null) => (d ? formatNotificationDate(d, p.timeZone) : "tanpa batas");
  if (p.kind === "granted") {
    return { title: "Paket diberikan admin", body: `Admin memberikan akses ${p.featureLabel} untuk Data Usaha ${p.dataUsahaName} (tanpa tagihan), berlaku sampai ${fmt(p.newEnd)}.` };
  }
  const shortened = !!p.oldEnd && !!p.newEnd && p.newEnd.getTime() < p.oldEnd.getTime();
  const title = p.kind === "extended" ? "Masa aktif diperpanjang admin" : shortened ? "Masa aktif dipersingkat admin" : "Masa aktif diubah admin";
  const verb = p.kind === "extended" ? "diperpanjang" : shortened ? "dipersingkat" : "diubah";
  return { title, body: `Masa aktif ${p.featureLabel} di Data Usaha ${p.dataUsahaName} ${verb} oleh admin: dari ${fmt(p.oldEnd)} menjadi ${fmt(p.newEnd)}.` };
}

export async function notifySubscriptionChangedByAdmin(p: { dataUsahaId: string; featureLabel: string; kind: SubscriptionChangeKind; oldEnd: Date | null; newEnd: Date | null }): Promise<void> {
  try {
    const [row] = await db
      .select({ ownerId: dataUsaha.userId, name: dataUsaha.name, email: userTable.email, ownerName: userTable.name })
      .from(dataUsaha)
      .innerJoin(userTable, eq(userTable.id, dataUsaha.userId))
      .where(eq(dataUsaha.id, p.dataUsahaId));
    if (!row) return;
    const timeZone = await getCompanyTimezone();
    const { title, body } = buildSubscriptionChangeNotice({ kind: p.kind, featureLabel: p.featureLabel, dataUsahaName: row.name, oldEnd: p.oldEnd, newEnd: p.newEnd, timeZone });
    await createNotification({ userId: row.ownerId, type: NOTIFICATION_TYPES.SUBSCRIPTION_CHANGED_BY_ADMIN, title, body, entityType: "data_usaha", entityId: p.dataUsahaId });
    await startQueue();
    await boss.send(JOBS.SEND_EMAIL, { to: row.email, subject: title, html: `<p>Halo ${escapeHtml(row.ownerName)},</p><p>${escapeHtml(body)}</p>` });
  } catch (err) {
    logger.error({ err, dataUsahaId: p.dataUsahaId }, "Notifikasi perubahan langganan oleh admin gagal terkirim");
  }
}
