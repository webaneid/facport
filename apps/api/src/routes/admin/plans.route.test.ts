import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, plans } from "../../db/schema";
import { adminPlansRoute } from "./plans.route";
import { MODULE_CATALOG } from "../../lib/module-catalog";

// § Fase 110, architecture-user-tambahan.md — TIDAK ADA test file untuk
// endpoint lain di `plans.route.ts` sebelumnya (gap pre-existing, di luar
// scope fase ini) — file ini FOKUS ke validasi silang `kind`<->`modules`
// BARU (seat_addon vs module plan), yang genuinely baru & berisiko kalau
// salah (bisa lolos bikin plan seat_addon dengan modules terisi, atau
// sebaliknya).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminPlansRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Plans Test" }),
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
  const email = `admin-plans-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  return signIn(email);
}

async function postPlan(cookie: string, body: Record<string, unknown>) {
  return testApp.handle(
    new Request("http://localhost/admin/plans", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /admin/plans — validasi kind<->modules", () => {
  test("200 — plan kind default (module) dengan 1 modul, berhasil", async () => {
    const cookie = await makeAdminCookie();
    const res = await postPlan(cookie, {
      name: `Plan Module ${runId}`,
      price: 10000,
      durationDays: 30,
      modules: ["purchase_invoice"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; modules: string[] };
    expect(body.kind).toBe("module");
    expect(body.modules).toEqual(["purchase_invoice"]);
  });

  test("400 MODULE_PLAN_REQUIRES_EXACTLY_ONE_MODULE — kind module tapi modules kosong", async () => {
    const cookie = await makeAdminCookie();
    const res = await postPlan(cookie, { name: `Plan Empty ${runId}`, price: 10000, durationDays: 30, modules: [] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("MODULE_PLAN_REQUIRES_EXACTLY_ONE_MODULE");
  });

  test("200 — kind seat_addon dengan modules kosong, berhasil, trialEligible dipaksa false", async () => {
    const cookie = await makeAdminCookie();
    const res = await postPlan(cookie, {
      name: `Plan Seat ${runId}`,
      price: 20000,
      durationDays: 30,
      modules: [],
      kind: "seat_addon",
      trialEligible: true, // § sengaja dikirim true, harus dipaksa false oleh server
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; modules: string[]; trialEligible: boolean };
    expect(body.kind).toBe("seat_addon");
    expect(body.modules).toEqual([]);
    expect(body.trialEligible).toBe(false);

    const [row] = await db.select().from(plans).where(eq(plans.name, `Plan Seat ${runId}`));
    expect(row!.trialEligible).toBe(false);
  });

  test("400 SEAT_ADDON_CANNOT_HAVE_MODULES — kind seat_addon tapi modules terisi", async () => {
    const cookie = await makeAdminCookie();
    const res = await postPlan(cookie, {
      name: `Plan Seat Invalid ${runId}`,
      price: 20000,
      durationDays: 30,
      modules: ["purchase_invoice"],
      kind: "seat_addon",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("SEAT_ADDON_CANNOT_HAVE_MODULES");
  });
});

// § Fase 117, ADR-0033 — guard drift: union literal `modules` di
// `planBody` (plans.route.ts) DITULIS MANUAL (generate otomatis dari
// module-catalog.ts TERBUKTI merusak inferensi Eden Treaty, temuan
// 2026-09-04, lihat komentar di plans.route.ts) — test ini mengecek LEWAT
// PERILAKU (bukan introspeksi internal TypeBox) bahwa union itu tetap
// SAMA PERSIS dengan Varian Produk "facport" di module-catalog.ts, supaya
// kalau salah satu berubah tanpa yang lain, test ini gagal duluan
// sebelum ke production.
describe("POST /admin/plans — drift guard union `modules` vs module-catalog.ts (Fase 117)", () => {
  test("SEMUA Varian Produk facport di module-catalog.ts diterima sebagai plan modules", async () => {
    const cookie = await makeAdminCookie();
    const facportKeys = MODULE_CATALOG.filter((m) => m.productLine === "facport").map((m) => m.key);
    for (const key of facportKeys) {
      const res = await postPlan(cookie, {
        name: `Plan Drift Guard ${key} ${runId}`,
        price: 10000,
        durationDays: 30,
        modules: [key],
      });
      expect(res.status).toBe(200);
    }
  });

  test("key yang BUKAN Varian Produk facport DITOLAK (union tidak lebih longgar dari katalog)", async () => {
    const cookie = await makeAdminCookie();
    const res = await postPlan(cookie, {
      name: `Plan Drift Guard Invalid ${runId}`,
      price: 10000,
      durationDays: 30,
      modules: ["bukan_varian_valid"],
    });
    expect(res.status).toBe(422);
  });
});
