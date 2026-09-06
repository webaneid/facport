import { db } from "./db";
import { subscriptions, auditLogs } from "../db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PlanRow = { id: string; durationDays: number };

// § Fase 18 — versi BATCH dari pola "admin-provisioned" yang sudah ada
// sejak Fase 01/11 (`admin/subscriptions.route.ts` `POST /admin/subscriptions`
// — endAt WAJIB diinput admin per-panggilan). Helper ini BEDA: dipakai
// saat admin bikin user BARU + langsung tandai N sub-modul lunas
// sekaligus — endAt DIHITUNG OTOMATIS dari `plan.durationDays` (bukan
// diinput manual), karena tidak ada UI per-modul buat isi tanggal custom
// di alur onboarding cepat ini. Endpoint `POST /admin/subscriptions`
// SATU-PLAN yang sudah ada TIDAK diubah — tetap dipakai kalau admin mau
// assign 1 subscription existing user dengan endAt custom (kontrak
// korporat, dst), beda kebutuhan dari sini.
export async function createManualSubscriptions(
  tx: Tx,
  params: { userId: string; planRows: PlanRow[]; actorId: string },
) {
  const { userId, planRows, actorId } = params;
  const now = new Date();
  const subscriptionIds: string[] = [];

  for (const plan of planRows) {
    const endAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    const [subscription] = await tx
      .insert(subscriptions)
      .values({ userId, planId: plan.id, status: "active", startAt: now, endAt })
      .returning();
    subscriptionIds.push(subscription!.id);

    await tx.insert(auditLogs).values({
      entityType: "subscription",
      entityId: subscription!.id,
      action: "create",
      changes: { userId, planId: plan.id, endAt: endAt.toISOString(), provisionedBy: "admin", markedPaidAtOnboarding: true },
      actorId,
    });
  }

  return subscriptionIds;
}
