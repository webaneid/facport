import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, notifications } from "../db/schema";
import { createNotification, createNotificationsBulk, NOTIFICATION_TYPES } from "./notifications";

const runId = Date.now();

async function createUser(email: string) {
  const now = new Date();
  const [u] = await db
    .insert(userTable)
    .values({ id: crypto.randomUUID(), email, name: "Notif Test", emailVerified: true, createdAt: now, updatedAt: now })
    .returning();
  return u!.id;
}

describe("createNotification", () => {
  test("insert 1 baris notifikasi milik user yang benar", async () => {
    const userId = await createUser(`notif-create-${runId}@test.local`);
    const row = await createNotification({
      userId,
      type: NOTIFICATION_TYPES.ORDER_CREATED,
      title: "Pesanan dibuat",
      body: "Selesaikan pembayaran kamu.",
      entityType: "order",
      entityId: crypto.randomUUID(),
    });
    expect(row.userId).toBe(userId);
    expect(row.type).toBe("order_created");
    expect(row.isRead).toBe(false);

    const [reloaded] = await db.select().from(notifications).where(eq(notifications.id, row.id));
    expect(reloaded!.title).toBe("Pesanan dibuat");
  });
});

describe("createNotificationsBulk", () => {
  test("insert N baris sekaligus (fan-out), 1 baris per userId", async () => {
    const userA = await createUser(`notif-bulk-a-${runId}@test.local`);
    const userB = await createUser(`notif-bulk-b-${runId}@test.local`);

    const rows = await createNotificationsBulk([
      { userId: userA, type: NOTIFICATION_TYPES.ANNOUNCEMENT, title: "Pengumuman", body: "Halo semua" },
      { userId: userB, type: NOTIFICATION_TYPES.ANNOUNCEMENT, title: "Pengumuman", body: "Halo semua" },
    ]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([userA, userB]));
  });

  test("array kosong tidak error, balikin array kosong", async () => {
    const rows = await createNotificationsBulk([]);
    expect(rows).toEqual([]);
  });
});
