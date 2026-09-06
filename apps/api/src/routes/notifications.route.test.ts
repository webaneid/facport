import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, notifications } from "../db/schema";
import { notificationsRoute } from "./notifications.route";
import { createNotification, NOTIFICATION_TYPES } from "../lib/notifications";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(notificationsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Notif Route Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

async function signIn(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    }),
  );
  return res.headers.get("set-cookie") ?? "";
}

describe("GET /me/notifications", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/notifications"));
    expect(res.status).toBe(401);
  });

  test("cuma balikin notifikasi milik user sendiri, urut terbaru dulu", async () => {
    const ownerId = await signUp(`notif-list-owner-${runId}@test.local`);
    const ownerCookie = await signIn(`notif-list-owner-${runId}@test.local`);
    const otherId = await signUp(`notif-list-other-${runId}@test.local`);

    await createNotification({ userId: otherId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "Punya orang lain", body: "-" });
    await createNotification({ userId: ownerId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "Notif 1", body: "-" });
    await createNotification({ userId: ownerId, type: NOTIFICATION_TYPES.TRIAL_STARTED, title: "Notif 2", body: "-" });

    const res = await testApp.handle(new Request("http://localhost/me/notifications", { headers: { cookie: ownerCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { notifications: { title: string }[]; total: number };
    expect(body.total).toBe(2);
    expect(body.notifications.map((n) => n.title)).toEqual(["Notif 2", "Notif 1"]);
    expect(body.notifications.some((n) => n.title === "Punya orang lain")).toBe(false);
  });

  test("?unreadOnly=true cuma balikin yang belum dibaca", async () => {
    const userId = await signUp(`notif-unread-${runId}@test.local`);
    const cookie = await signIn(`notif-unread-${runId}@test.local`);

    const read = await createNotification({ userId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "Sudah dibaca", body: "-" });
    await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(eq(notifications.id, read.id));
    await createNotification({ userId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "Belum dibaca", body: "-" });

    const res = await testApp.handle(new Request("http://localhost/me/notifications?unreadOnly=true", { headers: { cookie } }));
    const body = (await res.json()) as { notifications: { title: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.notifications[0]!.title).toBe("Belum dibaca");
  });
});

describe("GET /me/notifications/unread-count", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/notifications/unread-count"));
    expect(res.status).toBe(401);
  });

  test("hitung cuma yang belum dibaca", async () => {
    const userId = await signUp(`notif-count-${runId}@test.local`);
    const cookie = await signIn(`notif-count-${runId}@test.local`);

    await createNotification({ userId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "A", body: "-" });
    await createNotification({ userId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "B", body: "-" });

    const res = await testApp.handle(new Request("http://localhost/me/notifications/unread-count", { headers: { cookie } }));
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(2);
  });
});

describe("PATCH /me/notifications/:id/read", () => {
  test("404 kalau notifikasi milik user LAIN (ownership check)", async () => {
    const ownerId = await signUp(`notif-read-owner-${runId}@test.local`);
    const attackerEmail = `notif-read-attacker-${runId}@test.local`;
    await signUp(attackerEmail);
    const attackerCookie = await signIn(attackerEmail);

    const notif = await createNotification({ userId: ownerId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "Punya owner", body: "-" });

    const res = await testApp.handle(
      new Request(`http://localhost/me/notifications/${notif.id}/read`, { method: "PATCH", headers: { cookie: attackerCookie } }),
    );
    expect(res.status).toBe(404);
  });

  test("200 — tandai isRead=true + readAt terisi", async () => {
    const userId = await signUp(`notif-read-ok-${runId}@test.local`);
    const cookie = await signIn(`notif-read-ok-${runId}@test.local`);
    const notif = await createNotification({ userId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "Test", body: "-" });

    const res = await testApp.handle(
      new Request(`http://localhost/me/notifications/${notif.id}/read`, { method: "PATCH", headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isRead: boolean; readAt: string | null };
    expect(body.isRead).toBe(true);
    expect(body.readAt).not.toBeNull();
  });
});

describe("POST /me/notifications/read-all", () => {
  test("tandai SEMUA notifikasi user ini dibaca, TIDAK menyentuh milik user lain", async () => {
    const userId = await signUp(`notif-readall-${runId}@test.local`);
    const cookie = await signIn(`notif-readall-${runId}@test.local`);
    const otherId = await signUp(`notif-readall-other-${runId}@test.local`);

    await createNotification({ userId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "A", body: "-" });
    await createNotification({ userId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "B", body: "-" });
    const otherNotif = await createNotification({ userId: otherId, type: NOTIFICATION_TYPES.ORDER_CREATED, title: "Punya lain", body: "-" });

    const res = await testApp.handle(new Request("http://localhost/me/notifications/read-all", { method: "POST", headers: { cookie } }));
    expect(res.status).toBe(200);

    const mine = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(mine.every((n) => n.isRead)).toBe(true);

    const [otherReloaded] = await db.select().from(notifications).where(eq(notifications.id, otherNotif.id));
    expect(otherReloaded!.isRead).toBe(false);
  });
});
