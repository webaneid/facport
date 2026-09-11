import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, roles, userRoles, plans, subscriptions } from "../db/schema";
import { resolveAnnouncementRecipients, createAnnouncement } from "./announcements";
import { createTestDataUsaha } from "./test-fixtures";

const runId = Date.now();

async function createUser(email: string) {
  const now = new Date();
  const [u] = await db
    .insert(userTable)
    .values({ id: crypto.randomUUID(), email, name: "Announcement Test", emailVerified: true, createdAt: now, updatedAt: now })
    .returning();
  return u!.id;
}

async function assignRole(userId: string, roleName: string) {
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  if (!role) throw new Error(`Role ${roleName} belum ke-seed`);
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
}

async function createActiveSubscription(userId: string, moduleKey: string, isTrial = false) {
  const [plan] = await db
    .insert(plans)
    .values({ name: `Announcement Test Plan ${runId}-${moduleKey}-${Math.random()}`, price: 1000, durationDays: 30, modules: [moduleKey] })
    .returning();
  const dataUsahaId = await createTestDataUsaha(userId);
  await db.insert(subscriptions).values({
    userId,
    planId: plan!.id,
    status: "active",
    startAt: new Date(),
    endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isTrial,
    dataUsahaId,
  });
}

describe("resolveAnnouncementRecipients", () => {
  test("target=specific_users — balikin persis targetUserIds (dedup)", async () => {
    const userA = await createUser(`announce-specific-a-${runId}@test.local`);
    const userB = await createUser(`announce-specific-b-${runId}@test.local`);

    const recipients = await resolveAnnouncementRecipients({
      target: "specific_users",
      targetUserIds: [userA, userB, userA], // sengaja dobel
    });
    expect(new Set(recipients)).toEqual(new Set([userA, userB]));
  });

  test("target=all_customers — semua user dengan role customer, BUKAN admin/staff", async () => {
    const customerId = await createUser(`announce-allcust-customer-${runId}@test.local`);
    await assignRole(customerId, "customer");
    const adminId = await createUser(`announce-allcust-admin-${runId}@test.local`);
    await assignRole(adminId, "admin");

    const recipients = await resolveAnnouncementRecipients({ target: "all_customers" });
    expect(recipients).toContain(customerId);
    expect(recipients).not.toContain(adminId);
  });

  test("target=specific_modules — cuma customer dengan subscription AKTIF (real ATAU trial) utk modul target", async () => {
    const matchingUser = await createUser(`announce-modules-match-${runId}@test.local`);
    await createActiveSubscription(matchingUser, "purchase_invoice");
    const trialUser = await createUser(`announce-modules-trial-${runId}@test.local`);
    await createActiveSubscription(trialUser, "purchase_invoice", true);
    const otherModuleUser = await createUser(`announce-modules-other-${runId}@test.local`);
    await createActiveSubscription(otherModuleUser, "sales_invoice");

    const recipients = await resolveAnnouncementRecipients({ target: "specific_modules", targetModules: ["purchase_invoice"] });
    expect(recipients).toContain(matchingUser);
    expect(recipients).toContain(trialUser);
    expect(recipients).not.toContain(otherModuleUser);
  });

  test("target=specific_modules TANPA targetModules — balikin array kosong, bukan error/semua orang", async () => {
    const recipients = await resolveAnnouncementRecipients({ target: "specific_modules", targetModules: [] });
    expect(recipients).toEqual([]);
  });
});

describe("createAnnouncement", () => {
  test("insert row dengan recipientCount default 0 (diisi worker belakangan)", async () => {
    const adminId = await createUser(`announce-create-${runId}@test.local`);
    const row = await createAnnouncement({
      title: "Maintenance Terjadwal",
      body: "Sistem akan maintenance jam 2 pagi.",
      target: "all_customers",
      createdBy: adminId,
    });
    expect(row.recipientCount).toBe(0);
    expect(row.title).toBe("Maintenance Terjadwal");
  });
});
