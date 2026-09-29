import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable } from "../db/schema";
import { accurateLookupRoute } from "./accurate-lookup.route";
import { createTestDataUsaha, createTestAccurateConnection } from "../lib/test-fixtures";

// § Fase 163, ADR-0039 — endpoint search-as-you-type ke Accurate. Panggilan
// SUNGGUHAN ke Accurate (sandbox) diverifikasi MANUAL (§ pola project,
// test call nyata — bukan bagian suite otomatis ini, sama seperti
// `autoproduksi.test.ts` Fase 159 yang cuma test logic payload murni).
// File ini FOKUS ke guard/error path — SEMUA jalur di bawah gagal SEBELUM
// sempat panggil Accurate sama sekali, jadi tidak perlu mock fetch/session.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(accurateLookupRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Accurate Lookup Test" }),
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

async function search(path: "items" | "glaccounts", cookie: string, q: string, dataUsahaId?: string) {
  return testApp.handle(
    new Request(`http://localhost/accurate/${path}/search?q=${encodeURIComponent(q)}`, {
      headers: { cookie, ...(dataUsahaId ? { "x-data-usaha-id": dataUsahaId } : {}) },
    }),
  );
}

describe("GET /accurate/items/search & /accurate/glaccounts/search — guard", () => {
  test("401 tanpa login", async () => {
    const res = await testApp.handle(new Request("http://localhost/accurate/items/search?q=bolu"));
    expect(res.status).toBe(401);
  });

  test("400 DATA_USAHA_REQUIRED — tanpa header X-Data-Usaha-Id", async () => {
    const email = `lookup-nohdr-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    await createTestDataUsaha(userId);
    const res = await search("items", cookie, "bolu");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_REQUIRED");
  });

  test("400 DATA_USAHA_REQUIRED — header bukan UUID valid", async () => {
    const email = `lookup-badhdr-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    await createTestDataUsaha(userId);
    const res = await search("items", cookie, "bolu", "bukan-uuid");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_REQUIRED");
  });

  test("403 DATA_USAHA_FORBIDDEN — Data Usaha bukan milik user ini", async () => {
    const ownerEmail = `lookup-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    await signIn(ownerEmail);
    const otherDataUsahaId = await createTestDataUsaha(ownerId);

    const attackerEmail = `lookup-attacker-${runId}@test.local`;
    await signUp(attackerEmail);
    const attackerCookie = await signIn(attackerEmail);

    const res = await search("glaccounts", attackerCookie, "kas", otherDataUsahaId);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DATA_USAHA_FORBIDDEN");
  });

  test("400 ACCURATE_NOT_CONNECTED — Data Usaha belum ada koneksi Accurate sama sekali", async () => {
    const email = `lookup-noconn-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);
    const res = await search("items", cookie, "bolu", dataUsahaId);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("ACCURATE_NOT_CONNECTED");
  });

  test("400 ACCURATE_NOT_CONNECTED — koneksi ADA tapi database belum dipilih", async () => {
    const email = `lookup-nodb-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);
    await createTestAccurateConnection(userId, { dataUsahaId }); // accurateDbId sengaja tidak diisi
    const res = await search("glaccounts", cookie, "kas", dataUsahaId);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("ACCURATE_NOT_CONNECTED");
  });

  test("400 — query q kosong ditolak schema (bukan 500)", async () => {
    const email = `lookup-emptyq-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);
    const res = await search("items", cookie, "", dataUsahaId);
    expect(res.status).toBe(422); // Elysia validation error utk t.String({minLength:1}) yang gagal
  });
});
