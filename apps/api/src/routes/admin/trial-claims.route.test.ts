import { describe, test, expect, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { eq, inArray, and, desc } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminTrialClaimsRoute } from "./trial-claims.route";
import { db } from "../../lib/db";
import { roles, userRoles, trialClaims, auditLogs, user as userTable } from "../../db/schema";

// § Fase 217, ADR-0054 — daftar klaim trial (users.view) dan lepas klaim (users.manage, alasan wajib, diaudit, baris tidak dihapus).
const runId = Date.now();
const app = new Elysia().mount(auth.handler).use(adminTrialClaimsRoute);
const PASSWORD = "TestPassword123!";
let seq = 0;
const dbIds: string[] = [];

async function makeUser(roleName: "admin" | "staff" | "customer") {
  const email = `trialclaims-${runId}-${seq++}@test.local`;
  const res = await app.handle(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, name: "Trial Claims Test" }) }));
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  const signIn = await app.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) }));
  return { id: user.id, cookie: signIn.headers.get("set-cookie") ?? "" };
}
async function makeClaim(ownerId: string) {
  const accurateDbId = `T217R-${runId}-${seq++}`;
  dbIds.push(accurateDbId);
  const [c] = await db.insert(trialClaims).values({ accurateDbId, module: "sales_receipt", subscriptionId: crypto.randomUUID(), userId: ownerId }).returning();
  return c!;
}
const req = (cookie: string | null, method: string, path: string, body?: unknown) =>
  app.handle(new Request(`http://localhost/admin/trial-claims${path}`, { method, headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));

afterAll(async () => {
  if (dbIds.length) await db.delete(trialClaims).where(inArray(trialClaims.accurateDbId, dbIds));
});

describe("/admin/trial-claims", () => {
  test("daftar: 401 tanpa login, 403 customer, Admin (staff) boleh melihat dan menyaring", async () => {
    const staff = await makeUser("staff");
    const customer = await makeUser("customer");
    const claim = await makeClaim(staff.id);
    expect((await req(null, "GET", "/")).status).toBe(401);
    expect((await req(customer.cookie, "GET", "/")).status).toBe(403);
    const res = await req(staff.cookie, "GET", `/?q=${encodeURIComponent(claim.accurateDbId)}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { claims: { id: string }[] };
    expect(json.claims.map((c) => c.id)).toEqual([claim.id]);
  });

  test("lepas klaim: Admin (staff) 403; Super Admin 200 + audit; baris tetap ada; ulang 409; alasan wajib; tidak ada 404", async () => {
    const staff = await makeUser("staff");
    const admin = await makeUser("admin");
    const claim = await makeClaim(staff.id);
    expect((await req(staff.cookie, "POST", `/${claim.id}/release`, { reason: "salah klaim" })).status).toBe(403);
    expect((await req(admin.cookie, "POST", `/${claim.id}/release`, { reason: "  " })).status).toBeGreaterThanOrEqual(400);
    const ok = await req(admin.cookie, "POST", `/${claim.id}/release`, { reason: "salah klaim" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ released: true, accurateDbId: claim.accurateDbId });
    const [after] = await db.select().from(trialClaims).where(eq(trialClaims.id, claim.id));
    expect(after!.releasedAt).not.toBeNull();
    expect(after!.releaseReason).toBe("salah klaim");
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "trial_claim"), eq(auditLogs.entityId, claim.id))).orderBy(desc(auditLogs.createdAt)).limit(1);
    expect(audit?.actorId).toBe(admin.id);
    expect((await req(admin.cookie, "POST", `/${claim.id}/release`, { reason: "lagi" })).status).toBe(409);
    expect((await req(admin.cookie, "POST", `/${crypto.randomUUID()}/release`, { reason: "ghaib" })).status).toBe(404);
  });
});
