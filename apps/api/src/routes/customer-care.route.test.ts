import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { customerCareRoute } from "./customer-care.route";
import { db } from "../lib/db";
import { customerCareAgents, customerCareClicks, settings, user as userTable } from "../db/schema";
import { WORK_START_MINUTES_KEY, WORK_END_MINUTES_KEY, WORK_DAYS_KEY } from "../lib/customer-care";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(customerCareRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "CC Route Test" }),
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

// § schedule DIBUAT SELALU-ONLINE (00:00-23:59, semua hari) supaya test
// tidak flaky tergantung jam sungguhan saat test dijalankan.
async function seedAlwaysOnlineSchedule() {
  await db
    .insert(settings)
    .values({ key: WORK_START_MINUTES_KEY, value: 0, group: "customer_care" })
    .onConflictDoUpdate({ target: settings.key, set: { value: 0 } });
  await db
    .insert(settings)
    .values({ key: WORK_END_MINUTES_KEY, value: 1440, group: "customer_care" })
    .onConflictDoUpdate({ target: settings.key, set: { value: 1440 } });
  await db
    .insert(settings)
    .values({ key: WORK_DAYS_KEY, value: [0, 1, 2, 3, 4, 5, 6], group: "customer_care" })
    .onConflictDoUpdate({ target: settings.key, set: { value: [0, 1, 2, 3, 4, 5, 6] } });
}

async function seedNeverOnlineSchedule() {
  await db
    .insert(settings)
    .values({ key: WORK_DAYS_KEY, value: [], group: "customer_care" })
    .onConflictDoUpdate({ target: settings.key, set: { value: [] } });
}

// § `customer_care_agents` GLOBAL/shared (sama seperti `settings`) — test
// rotasi butuh tahu PERSIS pool kandidatnya, jadi bersihkan dulu SEBELUM
// bikin agent test sendiri, cegah agent sisa dari test/file lain ikut
// jadi kandidat rotasi dan bikin assertion "agent mana yang kepilih"
// tidak deterministik.
async function resetAgentsTable() {
  await db.delete(customerCareClicks);
  await db.delete(customerCareAgents);
}

async function createAgent(overrides: Partial<{ isActive: boolean; manuallyOfflineUntil: Date | null }> = {}) {
  const [agent] = await db
    .insert(customerCareAgents)
    .values({
      name: `Agent ${runId}-${Math.random()}`,
      position: "Customer Care",
      whatsappNumber: "628123456789",
      isActive: overrides.isActive ?? true,
      manuallyOfflineUntil: overrides.manuallyOfflineUntil ?? null,
    })
    .returning();
  return agent!;
}

describe("GET /me/customer-care/next", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/customer-care/next"));
    expect(res.status).toBe(401);
  });

  test("available:false kalau tidak ada agent online (di luar jam kerja)", async () => {
    await seedNeverOnlineSchedule();
    await createAgent();
    const email = `cc-next-none-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/me/customer-care/next", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean };
    expect(body.available).toBe(false);
  });

  test("available:true, TIDAK expose whatsappNumber mentah", async () => {
    await seedAlwaysOnlineSchedule();
    await resetAgentsTable();
    const agent = await createAgent();
    const email = `cc-next-avail-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/me/customer-care/next", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean; agent?: { id: string; name: string; photoUrl: string | null } };
    expect(body.available).toBe(true);
    expect(body.agent?.id).toBe(agent.id);
    expect(JSON.stringify(body)).not.toContain(agent.whatsappNumber);
  });

  test("pilih agent dengan klik PALING SEDIKIT hari ini, agent yang manual-off DIABAIKAN", async () => {
    await seedAlwaysOnlineSchedule();
    await resetAgentsTable();
    const busyAgent = await createAgent();
    const quietAgent = await createAgent();
    const offlineAgent = await createAgent({ manuallyOfflineUntil: new Date(Date.now() + 60 * 60 * 1000) });

    const clicker = await signUp(`cc-next-clicker-${runId}@test.local`);
    await db.insert(customerCareClicks).values({ agentId: busyAgent.id, userId: clicker });
    await db.insert(customerCareClicks).values({ agentId: busyAgent.id, userId: clicker });

    const pickerEmail = `cc-next-picker-${runId}@test.local`;
    await signUp(pickerEmail);
    const cookie = await signIn(pickerEmail);

    const res = await testApp.handle(new Request("http://localhost/me/customer-care/next", { headers: { cookie } }));
    const body = (await res.json()) as { agent?: { id: string } };
    expect(body.agent?.id).toBe(quietAgent.id);
    expect(body.agent?.id).not.toBe(offlineAgent.id);
  });
});

describe("POST /me/customer-care/click", () => {
  test("400 AGENT_NOT_ONLINE kalau agent yang diklaim client SUDAH tidak online (re-validasi server)", async () => {
    await seedAlwaysOnlineSchedule();
    const agent = await createAgent({ manuallyOfflineUntil: new Date(Date.now() + 60 * 60 * 1000) }); // di-off-kan SETELAH client dapat data lama
    const staleEmail = `cc-click-stale-${runId}@test.local`;
    await signUp(staleEmail);
    const cookie = await signIn(staleEmail);

    const res = await testApp.handle(
      new Request("http://localhost/me/customer-care/click", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("AGENT_NOT_ONLINE");
  });

  test("200 — insert click log, balikin waLink berisi nomor WA", async () => {
    await seedAlwaysOnlineSchedule();
    const agent = await createAgent();
    const userId = await signUp(`cc-click-ok-${runId}@test.local`);
    const cookie = await signIn(`cc-click-ok-${runId}@test.local`);

    const res = await testApp.handle(
      new Request("http://localhost/me/customer-care/click", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { waLink: string };
    expect(body.waLink).toBe(`https://wa.me/${agent.whatsappNumber}`);

    const clicks = await db.select().from(customerCareClicks).where(eq(customerCareClicks.agentId, agent.id));
    expect(clicks.some((c) => c.userId === userId)).toBe(true);
  });
});
