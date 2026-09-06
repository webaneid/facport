import { describe, test, expect } from "bun:test";
import { eq, and, like, desc, sql } from "drizzle-orm";
import sharp from "sharp";
import { app } from "./app";
import { db } from "./lib/db";
import { roles, userRoles, user as userTable, verification } from "./db/schema";

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

async function signUp(email: string, password: string, name: string, extraHeaders?: Record<string, string>) {
  const res = await app.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
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

async function signIn(email: string, password: string, extraHeaders?: Record<string, string>) {
  const res = await app.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
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

// § Bug ditemukan 2026-09-06 — self-register TIDAK PERNAH dapat role
// "customer" (lihat komentar fix di `app.ts` intercept
// `POST /api/auth/sign-up/email`). Akibatnya user tidak muncul di
// `GET /admin/users` DAN login "gagal diam-diam" (frontend redirect
// balik ke `/login` kalau `roles` kosong). Regresi: pakai `signUp()` APA
// ADANYA (TANPA `assignRole()` manual seperti test lain) — role WAJIB
// otomatis nempel.
describe("POST /api/auth/sign-up/email — role customer otomatis", () => {
  test("user baru langsung dapat role customer tanpa assign manual", async () => {
    const email = `signup-role-${runId}@test.local`;
    // § `x-real-ip` unik — hindari ikut numpuk ke bucket rate-limit
    // "unknown" bersama SEMUA test lain di file ini yang tidak kirim IP
    // (§ rate-limit test di bawah, sudah dokumentasikan pola yang sama).
    const { userId } = await signUp(email, "TestPassword123!", "Signup Role Test", { "x-real-ip": "203.0.113.210" });
    expect(userId).toBeTruthy();

    const rows = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId!));
    expect(rows.map((r) => r.roleName)).toContain("customer");
  });
});

// § Fase 48 — diminta user: pilih paket di landing → daftar → klik link
// verifikasi email WAJIB langsung login + mendarat di `callbackURL` yang
// dikirim saat signUp (`register-form.tsx`), bukan diminta login manual
// lagi (pilihan paket ikut hilang di jalur lama). Token verifikasi
// (`createEmailVerificationToken`, JWT self-contained, § lib/auth.ts
// `sendVerificationEmail`) TIDAK tersimpan di tabel `verification` sama
// sekali (beda dari reset-password di atas) — diambil dari HTML job
// `pgboss.job` yang di-enqueue `sendVerificationEmail` (satu-satunya
// titik intercept, sama semangatnya "baca email" di test lupa-password).
describe("GET /api/auth/verify-email — auto sign-in & redirect callbackURL", () => {
  const ip = { "x-real-ip": "203.0.113.211" };

  test("klik link verifikasi = auto login + redirect ke callbackURL (bawa plans dari landing)", async () => {
    const email = `verify-autologin-${runId}@test.local`;
    const callbackURL = "http://app.localhost:6209/subscribe?plans=mock-plan-id";

    const signUpRes = await app.handle(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ip },
        body: JSON.stringify({ email, password: "TestPassword123!", name: "Verify Autologin Test", callbackURL }),
      }),
    );
    expect(signUpRes.status).toBe(200);

    const [job] = await db.execute<{ data: { html: string } }>(
      sql`SELECT data FROM pgboss.job WHERE name = 'send-email' AND data->>'to' = ${email} ORDER BY created_on DESC LIMIT 1`,
    );
    expect(job).toBeTruthy();
    const token = job!.data.html.match(/token=([^&"]+)/)?.[1];
    expect(token).toBeTruthy();

    const verifyRes = await app.handle(
      new Request(
        `http://localhost/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`,
        { headers: { ...ip } },
      ),
    );
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("location")).toBe(callbackURL);
    expect(verifyRes.headers.get("set-cookie")).toBeTruthy();
  });
});

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

// § Fase 29, ADR-0027 — cegat login SEBELUM `.mount(auth.handler)`, satu
// dari 2 lapis penegakan "nonaktifkan user" (lapis lain: hapus sesi saat
// di-nonaktifkan, § admin/users.route.test.ts). Test ini lewat `app`
// PENUH (bukan mount parsial per-route) — SATU-SATUNYA cara nge-tes
// intercept ini beneran jalan sebelum request diteruskan ke Better Auth.
describe("POST /api/auth/sign-in/email — akun disabled ditolak", () => {
  test("403 ACCOUNT_DISABLED kalau user.disabled=true, walau password benar", async () => {
    const email = `disabled-user-${runId}@test.local`;
    const { userId } = await signUp(email, "TestPassword123!", "Disabled Test");
    await db.update(userTable).set({ disabled: true }).where(eq(userTable.id, userId));

    const { status } = await signIn(email, "TestPassword123!");
    expect(status).toBe(403);
  });

  test("200 tetap normal kalau user.disabled=false (perilaku lama tidak berubah)", async () => {
    const email = `enabled-user-${runId}@test.local`;
    await signUp(email, "TestPassword123!", "Enabled Test");
    const { status, cookie } = await signIn(email, "TestPassword123!");
    expect(status).toBe(200);
    expect(cookie).toBeTruthy();
  });
});

// § diminta user 2026-09-05 — sebelumnya TIDAK ADA jalur pemulihan
// password mandiri sama sekali (gap ditemukan saat audit fondasi).
// Test ini END-TO-END lewat `app` PENUH: request-reset → ambil token
// ASLI dari tabel `verification` (simulasi "baca email", tidak ada cara
// lain intercept email di test) → reset-password → login pakai password
// BARU berhasil, password LAMA ditolak.
describe("Lupa Password — request-password-reset → reset-password", () => {
  // § `rateLimitPlugin({pathPrefix:"/api/auth",...})` mengunci SEMUA
  // request test di file ini (fetch in-memory `app.handle()` TIDAK
  // pernah kirim `x-real-ip`, jadi default ke IP "unknown" YANG SAMA
  // buat SEMUA test) ke 1 bucket bersama — sengaja dikasih `x-real-ip`
  // UNIK per describe block ini, supaya tidak numpuk ke bucket "unknown"
  // yang sudah dipakai test lain di file ini (persis seperti client
  // beda IP di dunia nyata, bukan workaround yang melemahkan test).
  const ip1 = { "x-real-ip": "203.0.113.201" };
  const ip2 = { "x-real-ip": "203.0.113.202" };

  test("end-to-end: token asli dari verification table, password baru menggantikan yang lama", async () => {
    const email = `forgot-password-${runId}@test.local`;
    const { userId } = await signUp(email, "OldPassword123!", "Forgot Password Test", ip1);

    const reqRes = await app.handle(
      new Request("http://localhost/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: "http://app.localhost:6209", ...ip1 },
        body: JSON.stringify({ email, redirectTo: "http://app.localhost:6209/reset-password" }),
      }),
    );
    expect(reqRes.status).toBe(200);

    // § `value` = userId (§ better-auth `internal-adapter`, diverifikasi
    // langsung ke source terpasang) — filter PRESISI ke user ini, bukan
    // asumsi "baris reset-password terbaru di seluruh tabel" (bisa salah
    // kalau ada request reset lain yang konkuren/basi belum ke-bersihkan).
    const [row] = await db
      .select()
      .from(verification)
      .where(and(like(verification.identifier, "reset-password:%"), eq(verification.value, userId!)))
      .orderBy(desc(verification.createdAt))
      .limit(1);
    expect(row).toBeTruthy();
    const token = row!.identifier.replace("reset-password:", "");

    const resetRes = await app.handle(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ip1 },
        body: JSON.stringify({ newPassword: "NewPassword456!", token }),
      }),
    );
    expect(resetRes.status).toBe(200);

    const oldLogin = await signIn(email, "OldPassword123!", ip1);
    expect(oldLogin.status).not.toBe(200);

    const newLogin = await signIn(email, "NewPassword456!", ip1);
    expect(newLogin.status).toBe(200);
  });

  test("200 generik (tidak bocor info) walau email TIDAK terdaftar", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: "http://app.localhost:6209", ...ip2 },
        body: JSON.stringify({ email: `tidak-ada-${runId}@test.local`, redirectTo: "http://app.localhost:6209/reset-password" }),
      }),
    );
    expect(res.status).toBe(200);
  });
});
