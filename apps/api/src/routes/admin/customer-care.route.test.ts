import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminCustomerCareRoute } from "./customer-care.route";
import { db } from "../../lib/db";
import { customerCareAgents, customerCareClicks, roles, userRoles, user as userTable } from "../../db/schema";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminCustomerCareRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "CC Test" }),
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
  const email = `cc-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  const cookie = await signIn(email);
  return cookie;
}

async function createAgent(overrides: Partial<{ name: string; position: string; whatsappNumber: string; isActive: boolean; manuallyOfflineUntil: Date | null }> = {}) {
  const [agent] = await db
    .insert(customerCareAgents)
    .values({
      name: overrides.name ?? `Agent ${runId}-${Math.random()}`,
      position: overrides.position ?? "Customer Care",
      whatsappNumber: overrides.whatsappNumber ?? "628123456789",
      isActive: overrides.isActive ?? true,
      manuallyOfflineUntil: overrides.manuallyOfflineUntil ?? null,
    })
    .returning();
  return agent!;
}

describe("POST /admin/customer-care/agents", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/admin/customer-care/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X", position: "Y", whatsappNumber: "628123456789" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("403 kalau tidak punya permission customer_care.manage", async () => {
    const email = `cc-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await testApp.handle(
      new Request("http://localhost/admin/customer-care/agents", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X", position: "Y", whatsappNumber: "628123456789" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  test("400 kalau whatsappNumber bukan angka murni", async () => {
    const cookie = await makeAdmin();
    const res = await testApp.handle(
      new Request("http://localhost/admin/customer-care/agents", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X", position: "Y", whatsappNumber: "+62 812-3456-789" }),
      }),
    );
    expect(res.status).toBe(422);
  });

  test("200 — bikin agent baru", async () => {
    const cookie = await makeAdmin();
    const res = await testApp.handle(
      new Request("http://localhost/admin/customer-care/agents", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Budi", position: "Customer Care", whatsappNumber: "628123456789" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; isActive: boolean };
    expect(body.isActive).toBe(true);
  });
});

describe("GET /admin/customer-care/agents", () => {
  test("isOnlineNow ikut dihitung per agent", async () => {
    const cookie = await makeAdmin();
    await createAgent({ isActive: false }); // pasti offline

    const res = await testApp.handle(new Request("http://localhost/admin/customer-care/agents", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: { isActive: boolean; isOnlineNow: boolean }[] };
    const inactiveAgent = body.agents.find((a) => !a.isActive);
    expect(inactiveAgent?.isOnlineNow).toBe(false);
  });
});

describe("DELETE /admin/customer-care/agents/:id", () => {
  test("soft delete — isActive jadi false, row TETAP ada", async () => {
    const cookie = await makeAdmin();
    const agent = await createAgent();

    const res = await testApp.handle(new Request(`http://localhost/admin/customer-care/agents/${agent.id}`, { method: "DELETE", headers: { cookie } }));
    expect(res.status).toBe(200);

    const [reloaded] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, agent.id));
    expect(reloaded!.isActive).toBe(false);
  });
});

describe("POST /admin/customer-care/agents/:id/offline-today + online-now", () => {
  test("offline-today mengisi manuallyOfflineUntil, online-now mengosongkannya lagi", async () => {
    const cookie = await makeAdmin();
    const agent = await createAgent();

    const offlineRes = await testApp.handle(
      new Request(`http://localhost/admin/customer-care/agents/${agent.id}/offline-today`, { method: "POST", headers: { cookie } }),
    );
    expect(offlineRes.status).toBe(200);
    const [afterOffline] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, agent.id));
    expect(afterOffline!.manuallyOfflineUntil).not.toBeNull();
    expect(afterOffline!.manuallyOfflineUntil!.getTime()).toBeGreaterThan(Date.now());

    const onlineRes = await testApp.handle(
      new Request(`http://localhost/admin/customer-care/agents/${agent.id}/online-now`, { method: "POST", headers: { cookie } }),
    );
    expect(onlineRes.status).toBe(200);
    const [afterOnline] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, agent.id));
    expect(afterOnline!.manuallyOfflineUntil).toBeNull();
  });
});

describe("GET/PUT /admin/customer-care/settings", () => {
  test("400 INVALID_WORK_HOURS kalau workStartMinutes >= workEndMinutes", async () => {
    const cookie = await makeAdmin();
    const res = await testApp.handle(
      new Request("http://localhost/admin/customer-care/settings", {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ workStartMinutes: 1000, workEndMinutes: 500, workDays: [1, 2, 3, 4, 5] }),
      }),
    );
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("INVALID_WORK_HOURS");
  });

  test("200 — update lalu GET balikin nilai yang sama", async () => {
    const cookie = await makeAdmin();
    const putRes = await testApp.handle(
      new Request("http://localhost/admin/customer-care/settings", {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ workStartMinutes: 480, workEndMinutes: 960, workDays: [1, 2, 3, 4, 5] }),
      }),
    );
    expect(putRes.status).toBe(200);

    const getRes = await testApp.handle(new Request("http://localhost/admin/customer-care/settings", { headers: { cookie } }));
    const body = (await getRes.json()) as { workStartMinutes: number; workEndMinutes: number; workDays: number[] };
    expect(body.workStartMinutes).toBe(480);
    expect(body.workEndMinutes).toBe(960);
    expect(body.workDays).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("GET /admin/customer-care/analytics", () => {
  test("hitung DISTINCT customer, bukan raw click count (1 customer klik 2x tidak dobel-hitung)", async () => {
    const cookie = await makeAdmin();
    const agent = await createAgent();
    const customerA = await signUp(`cc-analytics-a-${runId}@test.local`);
    const customerB = await signUp(`cc-analytics-b-${runId}@test.local`);

    await db.insert(customerCareClicks).values({ agentId: agent.id, userId: customerA });
    await db.insert(customerCareClicks).values({ agentId: agent.id, userId: customerA }); // klik ke-2, customer SAMA
    await db.insert(customerCareClicks).values({ agentId: agent.id, userId: customerB });

    const res = await testApp.handle(new Request("http://localhost/admin/customer-care/analytics?period=today", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analytics: { agentId: string; uniqueCustomers: number }[] };
    const row = body.analytics.find((a) => a.agentId === agent.id);
    expect(row?.uniqueCustomers).toBe(2); // customerA + customerB, BUKAN 3
  });
});
