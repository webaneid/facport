import { eq } from "drizzle-orm";
import { db } from "./db";
import { announcements, subscriptions, plans, roles, userRoles } from "../db/schema";

export type AnnouncementTarget = "all_customers" | "specific_modules" | "specific_users";

type ResolveParams = {
  target: AnnouncementTarget;
  targetModules?: string[] | null;
  targetUserIds?: string[] | null;
};

// § Fase 45 — resolve daftar PENERIMA broadcast sesuai kriteria target
// admin. Dipanggil dari worker `JOBS.SEND_ANNOUNCEMENT` (bukan sinkron di
// endpoint create — resolve bisa butuh scan banyak baris subscription,
// § ADR-0029 "notifikasi ringan disinkron, broadcast lewat job").
export async function resolveAnnouncementRecipients(params: ResolveParams): Promise<string[]> {
  if (params.target === "specific_users") {
    return [...new Set(params.targetUserIds ?? [])];
  }

  if (params.target === "all_customers") {
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    if (!customerRole) return [];
    const rows = await db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, customerRole.id));
    return [...new Set(rows.map((r) => r.userId))];
  }

  // target === "specific_modules" — customer dengan subscription AKTIF
  // (real ATAU trial) yang meng-cover SALAH SATU modul target. Filter
  // di JS (bukan SQL array-containment) — pola sama `getActiveSubscriptionsWithPlans`
  // (jumlah baris subscription aktif kecil, tidak perlu SQL khusus).
  const targetModules = new Set(params.targetModules ?? []);
  if (targetModules.size === 0) return [];
  const rows = await db
    .select({ userId: subscriptions.userId, modules: plans.modules })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.status, "active"));
  const matched = rows.filter((r) => r.modules.some((m) => targetModules.has(m)));
  return [...new Set(matched.map((r) => r.userId))];
}

export async function createAnnouncement(params: {
  title: string;
  body: string;
  target: AnnouncementTarget;
  targetModules?: string[] | null;
  targetUserIds?: string[] | null;
  createdBy: string;
}) {
  const [row] = await db
    .insert(announcements)
    .values({
      title: params.title,
      body: params.body,
      target: params.target,
      targetModules: params.targetModules ?? null,
      targetUserIds: params.targetUserIds ?? null,
      createdBy: params.createdBy,
    })
    .returning();
  return row!;
}
