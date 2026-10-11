import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { plans, subscriptions, invoices, roles, userRoles, user as userTable } from "../db/schema";
import { createTestDataUsaha } from "./test-fixtures";
import { findDueRenewalCandidates, issueRenewalInvoiceNow } from "./renewal-billing";
import { InternalAccountBillingError } from "./internal-accounts";

// § Fase 189G, ADR-0044 — tagihan perpanjangan TERJADWAL (ADR-0042) tidak boleh terbit untuk pemilik Data Usaha yang akun internal; penerbitan manual admin ditolak guard.
const WIB = "Asia/Jakarta";
const DAY = 24 * 60 * 60 * 1000;
const runId = Date.now();
let seq = 0;

async function makeScenario(opts: { isInternal?: boolean; roleName?: "customer" | "admin" | "staff" }) {
  const id = `renew-internal-${runId}-${seq++}`;
  await db.insert(userTable).values({ id, name: "Renew Internal", email: `${id}@test.local`, emailVerified: true, isInternal: opts.isInternal ?? false, createdAt: new Date(), updatedAt: new Date() });
  const [role] = await db.select().from(roles).where(eq(roles.name, opts.roleName ?? "customer"));
  await db.insert(userRoles).values({ userId: id, roleId: role!.id });
  const dataUsahaId = await createTestDataUsaha(id);
  const moduleKey = "sales_invoice";
  const [plan] = await db.insert(plans).values({ name: `Renew Internal Plan ${runId}-${seq++}`, price: 100000, durationDays: 30, interval: "monthly", modules: [moduleKey] }).returning();
  const endAt = new Date(Date.now() + 5 * DAY);
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId: id, planId: plan!.id, status: "active", startAt: new Date(endAt.getTime() - 30 * DAY), endAt, dataUsahaId, renewalInterval: "monthly" })
    .returning();
  return { ownerId: id, dataUsahaId, subId: sub!.id };
}

describe("tagihan perpanjangan terjadwal — akun internal", () => {
  test("kandidat job harian: pemilik KOMERSIL ikut; pemilik internal (flag) dan ber-role admin/staff dikecualikan", async () => {
    const commercial = await makeScenario({});
    const flagged = await makeScenario({ isInternal: true });
    const adminOwner = await makeScenario({ roleName: "admin" });
    const staffOwner = await makeScenario({ roleName: "staff" });
    const ids = (await findDueRenewalCandidates(new Date())).map((c) => c.subscription.id);
    expect(ids).toContain(commercial.subId);
    expect(ids).not.toContain(flagged.subId);
    expect(ids).not.toContain(adminOwner.subId);
    expect(ids).not.toContain(staffOwner.subId);
  });

  test("setelah flag dicabut, langganan itu kembali menjadi kandidat tagihan", async () => {
    const s = await makeScenario({ isInternal: true });
    expect((await findDueRenewalCandidates(new Date())).map((c) => c.subscription.id)).not.toContain(s.subId);
    await db.update(userTable).set({ isInternal: false }).where(eq(userTable.id, s.ownerId));
    expect((await findDueRenewalCandidates(new Date())).map((c) => c.subscription.id)).toContain(s.subId);
  });

  test("penerbitan MANUAL admin untuk pemilik internal ditolak guard (InternalAccountBillingError), tanpa invoice dan tanpa menandai siklus", async () => {
    const s = await makeScenario({ isInternal: true });
    await expect(issueRenewalInvoiceNow(s.subId, { timeZone: WIB })).rejects.toBeInstanceOf(InternalAccountBillingError);
    expect(await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, s.ownerId))).toHaveLength(0);
    const [row] = await db.select({ marked: subscriptions.renewalInvoicedForEndAt }).from(subscriptions).where(eq(subscriptions.id, s.subId));
    expect(row!.marked).toBeNull();
  });
});
