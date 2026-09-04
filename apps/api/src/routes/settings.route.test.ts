import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { settingsRoute } from "./settings.route";
import { db } from "../lib/db";
import { roles, userRoles, user as userTable } from "../db/schema";

// § Fase 16, security review 2026-09-04 (Medium) — `company.bankAccounts`/
// `company.qrisAccounts` WAJIB divalidasi bentuknya SAAT SIMPAN (admin),
// bukan baru ketahuan salah saat CUSTOMER coba bayar (§ orders.route.ts).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(settingsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Settings Test" }),
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

async function makeAdminCookie() {
  const email = `settings-payment-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const userId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  if (!role) throw new Error("admin role belum ke-seed");
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
  return signIn(email);
}

async function putSettings(cookie: string, body: { key: string; value: unknown; group: string }[]) {
  return testApp.handle(
    new Request("http://localhost/settings", {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("PUT /settings — validasi company.bankAccounts/qrisAccounts", () => {
  test("400 INVALID_BANK_ACCOUNTS kalau value bukan array of object lengkap", async () => {
    const cookie = await makeAdminCookie();
    const res = await putSettings(cookie, [{ key: "company.bankAccounts", value: [{ bankName: "BCA" }], group: "billing" }]);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_BANK_ACCOUNTS");
  });

  test("200 kalau company.bankAccounts valid", async () => {
    const cookie = await makeAdminCookie();
    const res = await putSettings(cookie, [
      { key: "company.bankAccounts", value: [{ id: "b1", bankName: "BCA", accountNumber: "123", accountName: "PT Test" }], group: "billing" },
    ]);
    expect(res.status).toBe(200);
  });

  test("400 INVALID_QRIS_ACCOUNTS kalau isDynamic=true tapi emvPayload bukan payload QRIS valid", async () => {
    const cookie = await makeAdminCookie();
    const res = await putSettings(cookie, [
      {
        key: "company.qrisAccounts",
        value: [{ id: "q1", name: "QRIS Test", imageUrl: "https://example.test/q.png", isDynamic: true, emvPayload: "bukan-payload-qris" }],
        group: "billing",
      },
    ]);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; qrisId?: string };
    expect(body.code).toBe("INVALID_QRIS_ACCOUNTS");
    expect(body.qrisId).toBe("q1");
  });

  test("200 kalau isDynamic=false, emvPayload TIDAK wajib valid (fallback statis)", async () => {
    const cookie = await makeAdminCookie();
    const res = await putSettings(cookie, [
      {
        key: "company.qrisAccounts",
        value: [{ id: "q2", name: "QRIS Statis", imageUrl: "https://example.test/q2.png", isDynamic: false, emvPayload: "" }],
        group: "billing",
      },
    ]);
    expect(res.status).toBe(200);
  });
});
