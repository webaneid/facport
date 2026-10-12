import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable } from "../db/schema";
import { meRoute } from "./me.route";

// § Fase 189A, ADR-0044 — kontak AKUN di `GET /me` (+ `profileComplete`) dan `PATCH /me/contact` (hanya diri sendiri).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(meRoute);

async function makeUser(label: string) {
  const email = `me-contact-${label}-${runId}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: `Me Contact ${label}` }),
    }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  const signIn = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    }),
  );
  return { id: user.id, cookie: signIn.headers.get("set-cookie") ?? "" };
}

const getMe = (cookie: string) => testApp.handle(new Request("http://localhost/me", { headers: { cookie } }));
const patch = (cookie: string, body: unknown) =>
  testApp.handle(new Request("http://localhost/me/contact", { method: "PATCH", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const valid = { companyName: "  PT  Maju  Jaya ", phone: "0812-3456-789", whatsapp: "+6281298765432" };

describe("GET /me & PATCH /me/contact", () => {
  test("PATCH tanpa login → 401", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/contact", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid) }));
    expect(res.status).toBe(401);
  });

  test("akun baru: kontak kosong, profileComplete=false; setelah PATCH sah → tersimpan ternormalisasi dan profileComplete=true", async () => {
    const u = await makeUser("flow");
    const before = (await (await getMe(u.cookie)).json()) as { companyName: string | null; phone: string | null; whatsapp: string | null; profileComplete: boolean };
    expect(before).toMatchObject({ companyName: null, phone: null, whatsapp: null, profileComplete: false });

    const res = await patch(u.cookie, valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ companyName: "PT Maju Jaya", phone: "+628123456789", whatsapp: "+6281298765432", profileComplete: true });

    const after = (await (await getMe(u.cookie)).json()) as { companyName: string; phone: string; whatsapp: string; profileComplete: boolean };
    expect(after).toMatchObject({ companyName: "PT Maju Jaya", phone: "+628123456789", whatsapp: "+6281298765432", profileComplete: true });
  });

  test("kontak tidak sah → 422 INVALID_CONTACT dengan field yang salah, data TIDAK berubah", async () => {
    const u = await makeUser("invalid");
    expect((await patch(u.cookie, valid)).status).toBe(200);

    const badPhone = await patch(u.cookie, { ...valid, phone: "abc" });
    expect(badPhone.status).toBe(422);
    expect(await badPhone.json()).toEqual({ code: "INVALID_CONTACT", field: "phone" });
    const badCompany = await patch(u.cookie, { ...valid, companyName: "   " });
    expect(badCompany.status).toBe(422);
    expect(await badCompany.json()).toEqual({ code: "INVALID_CONTACT", field: "companyName" });

    const me = (await (await getMe(u.cookie)).json()) as { phone: string };
    expect(me.phone).toBe("+628123456789");
  });

  test("body tak lengkap / terlalu panjang ditolak validasi skema (422), tidak sampai ke DB", async () => {
    const u = await makeUser("schema");
    expect((await patch(u.cookie, { phone: "08123456789" })).status).toBe(422);
    expect((await patch(u.cookie, { ...valid, companyName: "a".repeat(401) })).status).toBe(422);
  });

  test("hanya diri sendiri: PATCH oleh A tidak mengubah B (id tidak bisa dipilih klien)", async () => {
    const a = await makeUser("owner-a");
    const b = await makeUser("owner-b");
    expect((await patch(b.cookie, { ...valid, companyName: "PT Milik B" })).status).toBe(200);
    // upaya IDOR: menyisipkan id/userId di body diabaikan — yang berubah tetap akun pemanggil
    const res = await patch(a.cookie, { ...valid, companyName: "PT Milik A", id: b.id, userId: b.id });
    expect([200, 422]).toContain(res.status);
    const [rowB] = await db.select({ companyName: userTable.companyName }).from(userTable).where(eq(userTable.id, b.id));
    expect(rowB!.companyName).toBe("PT Milik B");
  });
});
