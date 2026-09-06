import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { eq, inArray } from "drizzle-orm";
import { auth } from "../lib/auth";
import { settingsRoute } from "./settings.route";
import { db } from "../lib/db";
import { roles, userRoles, user as userTable, settings as settingsTable } from "../db/schema";

// § ketemu 2026-09-06 — test di file ini PUT nilai LANGSUNG ke row
// settings GLOBAL (`company.bankAccounts`/`company.qrisAccounts`/
// `data.manualInputSecondsPerRow` — SATU baris per key, dipakai
// BERSAMA seluruh DB, bukan data per-test) TANPA pernah mengembalikannya
// — akibatnya QRIS/rekening ASLI yang sudah dikonfigurasi admin di DB
// dev ke-timpa data dummy test SETIAP `bun run test` dijalankan
// (kejadian nyata: QRIS wakaf customer ke-overwrite 3x dalam 1 sesi).
// Fix: snapshot nilai ASLI sebelum test manapun jalan, kembalikan lagi
// di `afterAll` — jalan APAPUN hasil testnya (pass/fail), § bun:test
// `afterAll` tetap dieksekusi walau ada test yang gagal di file ini.
const SETTINGS_KEYS_MUTATED_BY_THIS_FILE = ["company.bankAccounts", "company.qrisAccounts", "data.manualInputSecondsPerRow"] as const;
let originalSettingsSnapshot: Map<string, unknown>;

beforeAll(async () => {
  const rows = await db.select().from(settingsTable).where(inArray(settingsTable.key, [...SETTINGS_KEYS_MUTATED_BY_THIS_FILE]));
  originalSettingsSnapshot = new Map(rows.map((r) => [r.key, r.value]));
});

afterAll(async () => {
  for (const key of SETTINGS_KEYS_MUTATED_BY_THIS_FILE) {
    if (originalSettingsSnapshot.has(key)) {
      await db.update(settingsTable).set({ value: originalSettingsSnapshot.get(key) }).where(eq(settingsTable.key, key));
    } else {
      await db.delete(settingsTable).where(eq(settingsTable.key, key));
    }
  }
});

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

  // § ketemu 2026-09-06 — payload EMV valid disalin dari alat scan/decode
  // eksternal HAMPIR SELALU ikut bawa whitespace/newline di awal/akhir.
  // SEBELUM fix: payload ini ditolak (regex `$`-anchored, nol toleransi)
  // dengan pesan generik "Gagal menyimpan pengaturan" walau payload
  // aslinya valid. Fix: trim SEBELUM validasi & SEBELUM simpan.
  test("200 kalau emvPayload valid tapi ada whitespace/newline — di-trim SEBELUM validasi & SEBELUM disimpan", async () => {
    const cookie = await makeAdminCookie();
    const validPayload = "000201" + "6304" + "ABCD"; // struktural valid: mulai "0002", akhir "6304"+4 hex
    const res = await putSettings(cookie, [
      {
        key: "company.qrisAccounts",
        value: [
          {
            id: "q3-whitespace",
            name: "QRIS Dinamis Copy-Paste",
            imageUrl: "https://example.test/q3.png",
            isDynamic: true,
            emvPayload: `  \n${validPayload}\n  `, // whitespace/newline dari copy-paste
          },
        ],
        group: "billing",
      },
    ]);
    expect(res.status).toBe(200);

    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "company.qrisAccounts"));
    const stored = row!.value as { id: string; emvPayload: string }[];
    // § disimpan versi TRIM, bukan versi mentah dengan whitespace.
    expect(stored.find((a) => a.id === "q3-whitespace")?.emvPayload).toBe(validPayload);
  });

  test("400 INVALID_QRIS_ACCOUNTS + qrisId kalau payload BENERAN tidak valid (bukan cuma whitespace)", async () => {
    const cookie = await makeAdminCookie();
    const res = await putSettings(cookie, [
      {
        key: "company.qrisAccounts",
        value: [{ id: "q4-invalid", name: "QRIS Rusak", imageUrl: "https://example.test/q4.png", isDynamic: true, emvPayload: "bukan-payload-emv-valid" }],
        group: "billing",
      },
    ]);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; qrisId?: string };
    expect(body.code).toBe("INVALID_QRIS_ACCOUNTS");
    expect(body.qrisId).toBe("q4-invalid");
  });
});

// § diminta user 2026-09-06 — angka ini dipakai LANGSUNG untuk hitung
// "estimasi efisiensi waktu kerja" yang ditampilkan ke SEMUA customer
// (`GET /me/stats`), jadi validasi server WAJIB dites (nilai cacat akan
// menghasilkan klaim yang salah/menyesatkan ke semua pelanggan).
describe("PUT /settings — validasi data.manualInputSecondsPerRow", () => {
  test("400 INVALID_MANUAL_INPUT_SECONDS kalau bukan integer positif dalam batas", async () => {
    const cookie = await makeAdminCookie();

    const zero = await putSettings(cookie, [{ key: "data.manualInputSecondsPerRow", value: 0, group: "data" }]);
    expect(zero.status).toBe(400);
    expect(((await zero.json()) as { code: string }).code).toBe("INVALID_MANUAL_INPUT_SECONDS");

    const tooHigh = await putSettings(cookie, [{ key: "data.manualInputSecondsPerRow", value: 3601, group: "data" }]);
    expect(tooHigh.status).toBe(400);

    const notInteger = await putSettings(cookie, [{ key: "data.manualInputSecondsPerRow", value: 30.5, group: "data" }]);
    expect(notInteger.status).toBe(400);
  });

  test("200 kalau angka valid (30 detik, default)", async () => {
    const cookie = await makeAdminCookie();
    const res = await putSettings(cookie, [{ key: "data.manualInputSecondsPerRow", value: 30, group: "data" }]);
    expect(res.status).toBe(200);
  });
});
