import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { app } from "./app";
import { db } from "./lib/db";
import { roles, userRoles, user as userTable } from "./db/schema";

const validPngBuffer = await sharp({
  create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
})
  .png()
  .toBuffer();

// § architecture-testing.md — "Wajib Ada Test Untuk": auth flow (kredensial
// benar/salah, akses endpoint protected tanpa/dengan token) & ownership/
// permission check. Integration test lewat `app.handle()` (pola resmi
// Elysia testing, bukan hit port TCP nyata) terhadap DB dev yang sama
// dipakai verifikasi manual — pakai email unik per test run biar tidak
// bentrok kalau dijalankan berkali-kali.

const runId = Date.now();

async function signUp(email: string, password: string, name: string) {
  const res = await app.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  // Self-service WAJIB verifikasi email (§ lib/auth.ts) — test langsung
  // set emailVerified=true, bukan test alur email (bukan fokus test ini).
  if (body.user?.id) {
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  }
  return { status: res.status, userId: body.user?.id };
}

async function signIn(email: string, password: string) {
  const res = await app.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const cookie = res.headers.get("set-cookie") ?? "";
  return { status: res.status, cookie };
}

async function assignRole(userId: string, roleName: string) {
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  if (!role) throw new Error(`Role ${roleName} belum ke-seed`);
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
}

describe("GET /health", () => {
  test("return 200 tanpa auth", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
  });
});

describe("GET /settings — auth gate", () => {
  // § Critical finding security review Fase 00: GET ini sebelumnya TANPA
  // guard sama sekali, bocorin semua row settings ke siapa pun.
  test("401 kalau tidak login", async () => {
    const res = await app.handle(new Request("http://localhost/settings"));
    expect(res.status).toBe(401);
  });
});

describe("PUT /settings — auth & permission gate", () => {
  test("401 kalau tidak login", async () => {
    const res = await app.handle(
      new Request("http://localhost/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ key: "company.name", value: "X", group: "general" }]),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi role tidak punya permission settings.update", async () => {
    const email = `customer-${runId}@test.local`;
    const { userId } = await signUp(email, "TestPassword123!", "Customer Test");
    await assignRole(userId, "customer");
    const { cookie } = await signIn(email, "TestPassword123!");

    const res = await app.handle(
      new Request("http://localhost/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify([{ key: "company.name", value: "X", group: "general" }]),
      }),
    );
    expect(res.status).toBe(403);
  });

  test("200 kalau login DAN role admin (punya permission settings.update)", async () => {
    const email = `admin-${runId}@test.local`;
    const { userId } = await signUp(email, "TestPassword123!", "Admin Test");
    await assignRole(userId, "admin");
    const { cookie } = await signIn(email, "TestPassword123!");

    const res = await app.handle(
      new Request("http://localhost/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify([{ key: "company.name", value: "Test Co", group: "general" }]),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number };
    expect(body.updated).toBe(1);
  });
});

describe("POST /media/upload — validasi input & auth", () => {
  test("401 kalau tidak login (walau file valid — auth gate, bukan cuma validasi schema)", async () => {
    const form = new FormData();
    form.append("file", new Blob([validPngBuffer], { type: "image/png" }), "valid.png");

    const res = await app.handle(
      new Request("http://localhost/media/upload", { method: "POST", body: form }),
    );
    expect(res.status).toBe(401);
  });

  test("tolak MIME type bukan gambar yang diizinkan (schema-level t.File validation)", async () => {
    const email = `uploader-${runId}@test.local`;
    const { userId } = await signUp(email, "TestPassword123!", "Uploader Test");
    await assignRole(userId, "admin");
    const { cookie } = await signIn(email, "TestPassword123!");

    const form = new FormData();
    form.append("file", new Blob(["not an image"], { type: "text/plain" }), "fake.txt");

    const res = await app.handle(
      new Request("http://localhost/media/upload", {
        method: "POST",
        headers: { cookie },
        body: form,
      }),
    );
    // Ditolak sebelum handler jalan (t.File({type: [...]}) di schema) —
    // Elysia balikin VALIDATION error, BUKAN handler kita, jadi status-nya
    // apa pun yang Elysia set (§ onError fix: jangan dipaksa 500), yang
    // penting BUKAN 200/201.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
