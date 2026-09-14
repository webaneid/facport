import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, promos } from "../../db/schema";
import { adminPromosRoute } from "./promos.route";

// § Fase 116, architecture-promo.md — fokus: validasi all-or-nothing
// (title/description/buttonLabel), default sortOrder (MAX+1), permission
// gate, dan endpoint upload gambar (multipart, § handleImage di bawah).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminPromosRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Promos Test" }),
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

async function makeAdminCookie(suffix: string) {
  const email = `admin-promos-admin-${suffix}-${runId}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  return signIn(email);
}

function postPromo(cookie: string, body: Record<string, unknown>) {
  return testApp.handle(
    new Request("http://localhost/admin/promos", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /admin/promos", () => {
  test("401 kalau tidak login", async () => {
    const res = await postPromo("", { url: "https://example.com", imageUrl: "https://x/y.webp" });
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission promos.manage", async () => {
    const email = `promos-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await postPromo(cookie, { url: "https://example.com", imageUrl: "https://x/y.webp" });
    expect(res.status).toBe(403);
  });

  test("200 kalau title/description/buttonLabel KETIGANYA kosong (mode gambar-klik)", async () => {
    const cookie = await makeAdminCookie("empty-ok");
    const res = await postPromo(cookie, { url: "https://example.com/promo", imageUrl: "https://x/y.webp" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string | null; description: string | null; buttonLabel: string | null };
    expect(body.title).toBeNull();
    expect(body.description).toBeNull();
    expect(body.buttonLabel).toBeNull();
  });

  test("200 kalau title/description/buttonLabel KETIGANYA terisi (mode kartu+tombol)", async () => {
    const cookie = await makeAdminCookie("full-ok");
    const res = await postPromo(cookie, {
      title: "Promo Spesial",
      description: "Deskripsi promo",
      buttonLabel: "Klik Di Sini",
      url: "https://example.com/promo",
      imageUrl: "https://x/y.webp",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string | null };
    expect(body.title).toBe("Promo Spesial");
  });

  // § inti temuan risiko: title ada tapi description/buttonLabel kosong —
  // HARUS ditolak, cegah state ambigu di frontend (§ banner-slider.tsx
  // `isCardMode` butuh ketiganya konsisten).
  test("400 kalau CUMA sebagian title/description/buttonLabel terisi", async () => {
    const cookie = await makeAdminCookie("partial-fail");
    const res = await postPromo(cookie, { title: "Cuma title", url: "https://example.com", imageUrl: "https://x/y.webp" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TITLE_DESCRIPTION_BUTTON_LABEL_ALL_OR_NOTHING");
  });

  test("sortOrder default MAX(sortOrder)+1 kalau tidak dikirim (promo baru ke urutan terakhir)", async () => {
    const cookie = await makeAdminCookie("sortorder");
    const res1 = await postPromo(cookie, { url: "https://example.com/1", imageUrl: "https://x/1.webp" });
    const body1 = (await res1.json()) as { sortOrder: number };
    const res2 = await postPromo(cookie, { url: "https://example.com/2", imageUrl: "https://x/2.webp" });
    const body2 = (await res2.json()) as { sortOrder: number };
    expect(body2.sortOrder).toBe(body1.sortOrder + 1);
  });

  // § security review Fase 116 (Medium, DIPERBAIKI) — `url` sebelumnya
  // cuma divalidasi "tidak kosong", bisa diisi `javascript:...` yang
  // dieksekusi customer saat klik promo (§ GET /promos publik, tampil ke
  // SEMUA customer). WAJIB tolak skema selain http(s).
  test("400 URL_SCHEME_NOT_ALLOWED kalau url pakai skema javascript:", async () => {
    const cookie = await makeAdminCookie("url-js-scheme");
    const res = await postPromo(cookie, { url: "javascript:alert(document.cookie)", imageUrl: "https://x/y.webp" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("URL_SCHEME_NOT_ALLOWED");
  });

  test("400 URL_INVALID kalau url bukan URL yang valid sama sekali", async () => {
    const cookie = await makeAdminCookie("url-invalid");
    const res = await postPromo(cookie, { url: "bukan-url-sama-sekali", imageUrl: "https://x/y.webp" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("URL_INVALID");
  });
});

describe("PATCH /admin/promos/:id", () => {
  test("400 kalau hasil akhir (existing + body) jadi sebagian terisi", async () => {
    const cookie = await makeAdminCookie("patch-partial");
    const createRes = await postPromo(cookie, {
      title: "T",
      description: "D",
      buttonLabel: "B",
      url: "https://example.com",
      imageUrl: "https://x/y.webp",
    });
    const created = (await createRes.json()) as { id: string };

    // § kosongkan CUMA title lewat PATCH — description/buttonLabel lama
    // masih terisi di DB, hasil akhir jadi "sebagian" — WAJIB ditolak.
    const res = await testApp.handle(
      new Request(`http://localhost/admin/promos/${created.id}`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("200 update isActive & sortOrder", async () => {
    const cookie = await makeAdminCookie("patch-ok");
    const createRes = await postPromo(cookie, { url: "https://example.com", imageUrl: "https://x/y.webp" });
    const created = (await createRes.json()) as { id: string };

    const res = await testApp.handle(
      new Request(`http://localhost/admin/promos/${created.id}`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false, sortOrder: 99 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isActive: boolean; sortOrder: number };
    expect(body.isActive).toBe(false);
    expect(body.sortOrder).toBe(99);
  });

  test("404 kalau id tidak ada", async () => {
    const cookie = await makeAdminCookie("patch-404");
    const res = await testApp.handle(
      new Request("http://localhost/admin/promos/00000000-0000-0000-0000-000000000000", {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("400 URL_SCHEME_NOT_ALLOWED kalau PATCH ganti url ke skema javascript:", async () => {
    const cookie = await makeAdminCookie("patch-url-js-scheme");
    const createRes = await postPromo(cookie, { url: "https://example.com", imageUrl: "https://x/y.webp" });
    const created = (await createRes.json()) as { id: string };
    const res = await testApp.handle(
      new Request(`http://localhost/admin/promos/${created.id}`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "javascript:alert(1)" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("URL_SCHEME_NOT_ALLOWED");
  });
});

describe("DELETE /admin/promos/:id", () => {
  test("hard delete — baris benar-benar hilang dari DB", async () => {
    const cookie = await makeAdminCookie("delete");
    const createRes = await postPromo(cookie, { url: "https://example.com", imageUrl: "https://x/y.webp" });
    const created = (await createRes.json()) as { id: string };

    const res = await testApp.handle(new Request(`http://localhost/admin/promos/${created.id}`, { method: "DELETE", headers: { cookie } }));
    expect(res.status).toBe(200);

    const [row] = await db.select().from(promos).where(eq(promos.id, created.id));
    expect(row).toBeUndefined();
  });
});

describe("GET /admin/promos", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/admin/promos"));
    expect(res.status).toBe(401);
  });

  test("list mencakup promo NONAKTIF juga (beda dari GET /promos publik)", async () => {
    const cookie = await makeAdminCookie("list-inactive");
    const createRes = await postPromo(cookie, { url: "https://example.com/inactive", imageUrl: "https://x/y.webp" });
    const created = (await createRes.json()) as { id: string };
    await testApp.handle(
      new Request(`http://localhost/admin/promos/${created.id}`, {
        method: "PATCH",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
    );

    const res = await testApp.handle(new Request("http://localhost/admin/promos", { headers: { cookie } }));
    const body = (await res.json()) as { promos: { id: string; isActive: boolean }[] };
    const found = body.promos.find((p) => p.id === created.id);
    expect(found).toBeTruthy();
    expect(found!.isActive).toBe(false);
  });
});

// § tiny PNG 1x1 valid (base64) — dipakai test upload gambar SUNGGUHAN
// (bukan mock), pastikan `sharp` + MinIO benar-benar jalan end-to-end.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("POST /admin/promos/image", () => {
  test("401 kalau tidak login", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([Buffer.from(TINY_PNG_BASE64, "base64")], { type: "image/png" }), "test.png");
    const res = await testApp.handle(new Request("http://localhost/admin/promos/image", { method: "POST", body: formData }));
    expect(res.status).toBe(401);
  });

  test("200 upload PNG valid — balikin URL bucket publik", async () => {
    const cookie = await makeAdminCookie("upload-ok");
    const formData = new FormData();
    formData.append("file", new Blob([Buffer.from(TINY_PNG_BASE64, "base64")], { type: "image/png" }), "test.png");
    const res = await testApp.handle(new Request("http://localhost/admin/promos/image", { method: "POST", headers: { cookie }, body: formData }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain("promos/");
    expect(body.url).toMatch(/\.webp$/);
  });

  // § file "gambar" palsu (bukan byte gambar sungguhan, cuma di-label
  // `type: "image/png"`) ternyata SUDAH ditolak Elysia/TypeBox di layer
  // schema (`t.File`) sebelum sempat masuk handler — balikin 422 (bukan
  // 400 `INVALID_IMAGE_FILE` dari `sharp()` di handler, yang butuh file
  // yang lolos schema tapi tetap gagal di-decode). Kedua-duanya sama-sama
  // valid "file tidak sah ditolak", cuma beda layer mana yang nolak.
  test("422 kalau file bukan gambar valid (ditolak di layer schema Elysia)", async () => {
    const cookie = await makeAdminCookie("upload-invalid");
    const formData = new FormData();
    formData.append("file", new Blob([Buffer.from("bukan gambar sama sekali")], { type: "image/png" }), "fake.png");
    const res = await testApp.handle(new Request("http://localhost/admin/promos/image", { method: "POST", headers: { cookie }, body: formData }));
    expect(res.status).toBe(422);
  });
});
