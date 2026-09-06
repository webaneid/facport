import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminAnnouncementsRoute } from "./announcements.route";
import { db } from "../../lib/db";
import { announcements, roles, userRoles, user as userTable } from "../../db/schema";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminAnnouncementsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Announcements Test" }),
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

async function makeAdmin() {
  const email = `announcements-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  const cookie = await signIn(email);
  return cookie;
}

describe("POST /admin/announcements", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "X", body: "Y", target: "all_customers" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission notifications.broadcast", async () => {
    const email = `announcements-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/admin/announcements", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "X", body: "Y", target: "all_customers" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  test("400 TARGET_MODULES_REQUIRED kalau target=specific_modules tapi targetModules kosong", async () => {
    const cookie = await makeAdmin();
    const res = await testApp.handle(
      new Request("http://localhost/admin/announcements", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "X", body: "Y", target: "specific_modules" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TARGET_MODULES_REQUIRED");
  });

  test("400 TARGET_USER_IDS_REQUIRED kalau target=specific_users tapi targetUserIds kosong", async () => {
    const cookie = await makeAdmin();
    const res = await testApp.handle(
      new Request("http://localhost/admin/announcements", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "X", body: "Y", target: "specific_users" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TARGET_USER_IDS_REQUIRED");
  });

  test("200 — bikin announcement, recipientCount masih 0 (fan-out ASYNC lewat job)", async () => {
    const cookie = await makeAdmin();
    const res = await testApp.handle(
      new Request("http://localhost/admin/announcements", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Fitur Baru", body: "Sekarang bisa X", target: "all_customers" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; recipientCount: number };
    expect(body.recipientCount).toBe(0);

    const [row] = await db.select().from(announcements).where(eq(announcements.id, body.id));
    expect(row!.title).toBe("Fitur Baru");
    expect(row!.target).toBe("all_customers");
  });
});

describe("GET /admin/announcements", () => {
  test("403 kalau tidak punya permission", async () => {
    const email = `announcements-list-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await testApp.handle(new Request("http://localhost/admin/announcements", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });

  test("200 balikin daftar announcement, terbaru dulu", async () => {
    const cookie = await makeAdmin();
    await testApp.handle(
      new Request("http://localhost/admin/announcements", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Pengumuman Lama", body: "-", target: "all_customers" }),
      }),
    );
    await testApp.handle(
      new Request("http://localhost/admin/announcements", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Pengumuman Baru", body: "-", target: "all_customers" }),
      }),
    );

    const res = await testApp.handle(new Request("http://localhost/admin/announcements", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { announcements: { title: string }[] };
    expect(body.announcements[0]!.title).toBe("Pengumuman Baru");
  });
});
