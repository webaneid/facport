import { describe, test, expect } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { app } from "./app";
import { db } from "./lib/db";
import { roles, userRoles, user as userTable } from "./db/schema";

// § Fase 189A, ADR-0044 — data kontak AKUN (Nama Perusahaan, Telepon, WhatsApp) ikut dikirim saat daftar email. Server memvalidasi + menormalisasi
// SEBELUM Better Auth dan menyimpannya ke baris user yang benar-benar ada. Body TANPA kunci kontak (klien lama/cache) tetap diterima — modal
// Lengkapi Profil yang menangkapnya. Email test `@test.local` (dibersihkan `db:cleanup-test-data`); `x-real-ip` unik per test (rate limit /api/auth).

const runId = Date.now();

const post = (body: Record<string, unknown>, ip: string) =>
  app.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": ip },
      body: JSON.stringify(body),
    }),
  );

const findUser = async (email: string) => (await db.select().from(userTable).where(eq(userTable.email, email)))[0];

describe("POST /api/auth/sign-up/email — data kontak akun", () => {
  test("kontak sah disimpan ternormalisasi (E.164), role customer tetap otomatis", async () => {
    const email = `signup-contact-ok-${runId}@test.local`;
    const res = await post(
      { email, password: "TestPassword123!", name: "Kontak OK", companyName: "  PT   Maju   Jaya ", phone: "0812-3456-789", whatsapp: "+6281298765432" },
      "203.0.113.230",
    );
    expect(res.status).toBe(200);

    const row = await findUser(email);
    expect(row).toBeTruthy();
    expect(row!.companyName).toBe("PT Maju Jaya");
    expect(row!.phone).toBe("+628123456789");
    expect(row!.whatsapp).toBe("+6281298765432");

    const roleRows = await db.select({ roleName: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, row!.id));
    expect(roleRows.map((r) => r.roleName)).toContain("customer");
  });

  test("telepon tidak valid → 422 INVALID_CONTACT (field phone) dan TIDAK ada user dibuat", async () => {
    const email = `signup-contact-badphone-${runId}@test.local`;
    const res = await post({ email, password: "TestPassword123!", name: "Bad Phone", companyName: "PT A", phone: "abc", whatsapp: "08123456789" }, "203.0.113.231");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "INVALID_CONTACT", field: "phone" });
    expect(await findUser(email)).toBeUndefined();
  });

  test("nama perusahaan kosong tapi nomor ada → 422 (field companyName); kontak sebagian tidak diterima", async () => {
    const email = `signup-contact-nocompany-${runId}@test.local`;
    const res = await post({ email, password: "TestPassword123!", name: "No Company", companyName: "   ", phone: "08123456789", whatsapp: "08123456789" }, "203.0.113.232");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "INVALID_CONTACT", field: "companyName" });
    expect(await findUser(email)).toBeUndefined();

    const partial = await post({ email: `signup-contact-partial-${runId}@test.local`, password: "TestPassword123!", name: "Partial", phone: "08123456789" }, "203.0.113.233");
    expect(partial.status).toBe(422); // kunci kontak ada → ketiganya wajib
  });

  test("body TANPA kunci kontak (klien lama) tetap sukses; kolom kontak null", async () => {
    const email = `signup-contact-legacy-${runId}@test.local`;
    const res = await post({ email, password: "TestPassword123!", name: "Legacy Client" }, "203.0.113.234");
    expect(res.status).toBe(200);
    const row = await findUser(email);
    expect(row!.companyName).toBeNull();
    expect(row!.phone).toBeNull();
    expect(row!.whatsapp).toBeNull();
  });

  test("email sudah terdaftar + kontak sah → tetap 409 USER_ALREADY_EXISTS, kontak akun lama TIDAK tertimpa", async () => {
    const email = `signup-contact-dup-${runId}@test.local`;
    const first = await post({ email, password: "TestPassword123!", name: "Dup", companyName: "PT Asli", phone: "08111111111", whatsapp: "08111111111" }, "203.0.113.235");
    expect(first.status).toBe(200);

    const again = await post({ email, password: "TestPassword123!", name: "Dup", companyName: "PT Penyusup", phone: "08222222222", whatsapp: "08222222222" }, "203.0.113.236");
    expect(again.status).toBe(409);
    expect(((await again.json()) as { code: string }).code).toBe("USER_ALREADY_EXISTS");

    const row = await findUser(email);
    expect(row!.companyName).toBe("PT Asli");
    expect(row!.phone).toBe("+628111111111");
    const count = await db.select({ id: userTable.id }).from(userTable).where(sql`lower(${userTable.email}) = ${email}`);
    expect(count).toHaveLength(1);
  });
});
