import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, promos } from "../db/schema";
import { promosRoute } from "./promos.route";

// § Fase 116, architecture-promo.md — `GET /promos` (customer, auth:true):
// cuma `isActive:true`, urut `sortOrder` ASC, LIMIT 5 (diminta user
// eksplisit), response diperkecil ke field render saja.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(promosRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Promos Public Test" }),
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

describe("GET /promos", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/promos"));
    expect(res.status).toBe(401);
  });

  test("cuma balikin isActive:true, urut sortOrder ASC, MAKSIMAL 5 walau ada lebih banyak aktif", async () => {
    const email = `promos-public-limit-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    // § `GET /promos` MEMANG global (tidak ada scoping per-user/per-test)
    // — bersihkan dulu SEMUA baris sebelum test ini supaya tidak
    // ketercampur sisa run sebelumnya (dev DB sama dipakai berkali-kali,
    // § feedback_dev_db_test_cleanup). Aman: test LAIN di file ini/file
    // sebelah (`admin/promos.route.test.ts`) cuma assert row spesifik by
    // id, tidak pernah cek TOTAL/urutan list global seperti test ini.
    await db.delete(promos);

    // § 7 promo AKTIF (lebih dari batas 5) + 1 NONAKTIF — pastikan cuma
    // 5 pertama (by sortOrder) yang balik, dan yang nonaktif tidak ikut
    // sama sekali walau sortOrder-nya kecil.
    await db.insert(promos).values({ url: "https://x/inactive", imageUrl: "https://x/i.webp", isActive: false, sortOrder: 0, createdBy: userId });
    for (let i = 1; i <= 7; i++) {
      await db.insert(promos).values({ url: `https://x/${i}`, imageUrl: `https://x/${i}.webp`, isActive: true, sortOrder: i, createdBy: userId });
    }

    const res = await testApp.handle(new Request("http://localhost/promos", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { promos: { url: string }[] };
    expect(body.promos).toHaveLength(5);
    expect(body.promos.map((p) => p.url)).toEqual(["https://x/1", "https://x/2", "https://x/3", "https://x/4", "https://x/5"]);
  });

  test("response cuma field render (tidak expose isActive/sortOrder/createdBy)", async () => {
    const email = `promos-public-fields-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    await db.insert(promos).values({
      title: "T",
      description: "D",
      buttonLabel: "B",
      url: "https://x/fields",
      imageUrl: "https://x/fields.webp",
      isActive: true,
      sortOrder: 0,
      createdBy: userId,
    });

    const res = await testApp.handle(new Request("http://localhost/promos", { headers: { cookie } }));
    const body = (await res.json()) as { promos: Record<string, unknown>[] };
    const found = body.promos.find((p) => p.url === "https://x/fields");
    expect(found).toBeTruthy();
    expect(Object.keys(found!).sort()).toEqual(["buttonLabel", "description", "id", "imageUrl", "title", "url"].sort());
  });
});
