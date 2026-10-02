import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, autoproduksiFormulas, autoproduksiFormulaItems, autoproduksiProductionEntries } from "../db/schema";
import { autoproduksiRoute } from "./autoproduksi.route";
import { createTestDataUsaha } from "../lib/test-fixtures";

// § Fase 159 — mirror pola `createProvisionedUser` yang sudah dipakai
// puluhan test route modul lain (§ purchase-invoice-import.route.test.ts,
// dst) — role customer (punya `import.create`) + subscription aktif
// modul "autoproduksi_production".
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(autoproduksiRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "AutoProduksi Test" }),
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

async function createProvisionedUser(email: string) {
  const userId = await signUp(email);
  const cookie = await signIn(email);

  const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
  await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();

  const [plan] = await db
    .insert(plans)
    .values({ name: `AutoProduksi Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["autoproduksi_production"], productLine: "autoproduksi" })
    .returning();
  const dataUsahaId = await createTestDataUsaha(userId);
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    })
    .returning();

  return { userId, cookie, subscriptionId: subscription!.id, dataUsahaId };
}

const validFormulaBody = {
  name: "Bolu Kukus SP (Spesial BGT)",
  finishedGoodItemNo: "100011",
  finishedGoodItemUnitName: "Loyang",
  standardCost: 20000,
  adjustmentAccountNo: "11078",
  branchName: "JAKARTA",
  items: [
    { itemNo: "100012", itemUnitName: "KG", quantity: 0.5 },
    { itemNo: "100013", itemUnitName: "KG", quantity: 0.5 },
  ],
};

describe("POST /autoproduksi/formulas", () => {
  test("200 — berhasil bikin formula + bahan baku (form-based, bukan Excel)", async () => {
    const owner = await createProvisionedUser(`ap-formula-create-${runId}@test.local`);
    const res = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validFormulaBody),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { formula: { id: string; name: string; dataUsahaId: string } };
    expect(body.formula.name).toBe(validFormulaBody.name);
    expect(body.formula.dataUsahaId).toBe(owner.dataUsahaId);

    const items = await db.select().from(autoproduksiFormulaItems).where(eq(autoproduksiFormulaItems.formulaId, body.formula.id));
    expect(items).toHaveLength(2);
  });

  test("422 kalau itemNo lebih panjang dari batas kolom (§ security review — bukan 500 Postgres mentah)", async () => {
    const owner = await createProvisionedUser(`ap-formula-toolong-${runId}@test.local`);
    const res = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...validFormulaBody, adjustmentAccountNo: "A".repeat(51) }),
      }),
    );
    expect(res.status).toBe(422);
  });

  test("403 tanpa subscription modul autoproduksi_production", async () => {
    const userId = await signUp(`ap-formula-noaccess-${runId}@test.local`);
    const cookie = await signIn(`ap-formula-noaccess-${runId}@test.local`);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();

    const res = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validFormulaBody),
      }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("MODULE_NOT_SUBSCRIBED");
  });
});

describe("GET/PUT/DELETE /autoproduksi/formulas/:id — ownership", () => {
  test("user lain (subscription berbeda) TIDAK BISA lihat/ubah/hapus formula orang lain", async () => {
    const owner = await createProvisionedUser(`ap-formula-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`ap-formula-other-${runId}@test.local`);

    const createRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validFormulaBody),
      }),
    );
    const { formula } = (await createRes.json()) as { formula: { id: string } };

    const getRes = await testApp.handle(new Request(`http://localhost/autoproduksi/formulas/${formula.id}`, { headers: { cookie: other.cookie } }));
    expect(getRes.status).toBe(404);
    expect(((await getRes.json()) as { code: string }).code).toBe("FORMULA_NOT_FOUND");

    const deleteRes = await testApp.handle(new Request(`http://localhost/autoproduksi/formulas/${formula.id}`, { method: "DELETE", headers: { cookie: other.cookie } }));
    expect(deleteRes.status).toBe(404);

    // Punya sendiri tetap bisa
    const ownGetRes = await testApp.handle(new Request(`http://localhost/autoproduksi/formulas/${formula.id}`, { headers: { cookie: owner.cookie } }));
    expect(ownGetRes.status).toBe(200);
  });

  test("PUT ganti-total item (hapus lama, insert baru)", async () => {
    const owner = await createProvisionedUser(`ap-formula-put-${runId}@test.local`);
    const createRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validFormulaBody),
      }),
    );
    const { formula } = (await createRes.json()) as { formula: { id: string } };

    const putRes = await testApp.handle(
      new Request(`http://localhost/autoproduksi/formulas/${formula.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...validFormulaBody, items: [{ itemNo: "999999", itemUnitName: "PCS", quantity: 3 }] }),
      }),
    );
    expect(putRes.status).toBe(200);

    const items = await db.select().from(autoproduksiFormulaItems).where(eq(autoproduksiFormulaItems.formulaId, formula.id));
    expect(items).toHaveLength(1);
    expect(items[0]!.itemNo).toBe("999999");
  });

  test("DELETE formula ikut hapus item (FK cascade)", async () => {
    const owner = await createProvisionedUser(`ap-formula-delete-${runId}@test.local`);
    const createRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validFormulaBody),
      }),
    );
    const { formula } = (await createRes.json()) as { formula: { id: string } };

    const deleteRes = await testApp.handle(new Request(`http://localhost/autoproduksi/formulas/${formula.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }));
    expect(deleteRes.status).toBe(200);

    const items = await db.select().from(autoproduksiFormulaItems).where(eq(autoproduksiFormulaItems.formulaId, formula.id));
    expect(items).toHaveLength(0);
  });
});

describe("POST /autoproduksi/production-entries", () => {
  test("200 — submit input produksi, insert status 'pending' (job dijadwalkan async)", async () => {
    const owner = await createProvisionedUser(`ap-entry-create-${runId}@test.local`);
    const createRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validFormulaBody),
      }),
    );
    const { formula } = (await createRes.json()) as { formula: { id: string } };

    const entryRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/production-entries", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ formulaId: formula.id, producedQty: 5, transDate: "2026-09-28" }),
      }),
    );
    expect(entryRes.status).toBe(200);
    const body = (await entryRes.json()) as { entry: { id: string; status: string; producedQty: string } };
    expect(body.entry.status).toBe("pending");

    const [reloaded] = await db.select().from(autoproduksiProductionEntries).where(eq(autoproduksiProductionEntries.id, body.entry.id));
    expect(reloaded!.dataUsahaId).toBe(owner.dataUsahaId);
  });

  test("404 kalau formulaId bukan milik subscription ini", async () => {
    const owner = await createProvisionedUser(`ap-entry-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`ap-entry-other-${runId}@test.local`);
    const createRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validFormulaBody),
      }),
    );
    const { formula } = (await createRes.json()) as { formula: { id: string } };

    const entryRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/production-entries", {
        method: "POST",
        headers: { cookie: other.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ formulaId: formula.id, producedQty: 1, transDate: "2026-09-28" }),
      }),
    );
    expect(entryRes.status).toBe(404);
    expect(((await entryRes.json()) as { code: string }).code).toBe("FORMULA_NOT_FOUND");
  });
});

describe("GET /autoproduksi/production-entries — riwayat", () => {
  test("balikin entry berikut nama formula (join), diurutkan terbaru dulu", async () => {
    const owner = await createProvisionedUser(`ap-entry-list-${runId}@test.local`);
    const createRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(validFormulaBody),
      }),
    );
    const { formula } = (await createRes.json()) as { formula: { id: string } };

    await testApp.handle(
      new Request("http://localhost/autoproduksi/production-entries", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ formulaId: formula.id, producedQty: 2, transDate: "2026-09-28" }),
      }),
    );

    const listRes = await testApp.handle(new Request("http://localhost/autoproduksi/production-entries", { headers: { cookie: owner.cookie } }));
    expect(listRes.status).toBe(200);
    const { entries } = (await listRes.json()) as { entries: { formulaName: string }[] };
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]!.formulaName).toBe(validFormulaBody.name);
  });
});

// § diminta client 2026-10-02 — Akun Perantara jadi master data lokal
// (bukan live-search Accurate lagi). 100% CRUD lokal, fokus test:
// tenant-isolation (subscriptionId difilter) + duplikat kode ditolak.
describe("CRUD /autoproduksi/accounts — Akun Perantara lokal", () => {
  test("POST lalu GET — akun baru muncul di daftar, ter-scope subscription sendiri", async () => {
    const owner = await createProvisionedUser(`ap-acc-crud-${runId}@test.local`);
    const createRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/accounts", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo: "110501", accountName: "Perantara Produksi" }),
      }),
    );
    expect(createRes.status).toBe(200);

    const listRes = await testApp.handle(new Request("http://localhost/autoproduksi/accounts", { headers: { cookie: owner.cookie } }));
    const { accounts } = (await listRes.json()) as { accounts: { accountNo: string; accountName: string }[] };
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ accountNo: "110501", accountName: "Perantara Produksi" });
  });

  test("POST kode yang sudah ada -> 409 ACCOUNT_NO_DUPLICATE, bukan dibuat baris baru", async () => {
    const owner = await createProvisionedUser(`ap-acc-dup-${runId}@test.local`);
    await testApp.handle(
      new Request("http://localhost/autoproduksi/accounts", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo: "110501", accountName: "Perantara Produksi" }),
      }),
    );
    const dupRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/accounts", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo: "110501", accountName: "Nama Beda" }),
      }),
    );
    expect(dupRes.status).toBe(409);
    expect(((await dupRes.json()) as { code: string }).code).toBe("ACCOUNT_NO_DUPLICATE");

    const listRes = await testApp.handle(new Request("http://localhost/autoproduksi/accounts", { headers: { cookie: owner.cookie } }));
    const { accounts } = (await listRes.json()) as { accounts: unknown[] };
    expect(accounts).toHaveLength(1);
  });

  test("Data Usaha LAIN tidak lihat akun milik subscription ini (tenant isolation)", async () => {
    const owner = await createProvisionedUser(`ap-acc-tenant-a-${runId}@test.local`);
    const other = await createProvisionedUser(`ap-acc-tenant-b-${runId}@test.local`);
    await testApp.handle(
      new Request("http://localhost/autoproduksi/accounts", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo: "110501", accountName: "Punya Owner A" }),
      }),
    );
    const listRes = await testApp.handle(new Request("http://localhost/autoproduksi/accounts", { headers: { cookie: other.cookie } }));
    const { accounts } = (await listRes.json()) as { accounts: unknown[] };
    expect(accounts).toHaveLength(0);
  });

  test("PUT ubah kode ke kode yang SUDAH dipakai akun lain -> 409, bukan ganti kode lalu rusak", async () => {
    const owner = await createProvisionedUser(`ap-acc-put-dup-${runId}@test.local`);
    const res1 = await testApp.handle(
      new Request("http://localhost/autoproduksi/accounts", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo: "110501", accountName: "Akun A" }),
      }),
    );
    const res2 = await testApp.handle(
      new Request("http://localhost/autoproduksi/accounts", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo: "110502", accountName: "Akun B" }),
      }),
    );
    const { account: accountB } = (await res2.json()) as { account: { id: string } };
    void res1;

    const putRes = await testApp.handle(
      new Request(`http://localhost/autoproduksi/accounts/${accountB.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo: "110501", accountName: "Akun B Diubah" }),
      }),
    );
    expect(putRes.status).toBe(409);
    expect(((await putRes.json()) as { code: string }).code).toBe("ACCOUNT_NO_DUPLICATE");
  });

  test("DELETE akun TIDAK PERNAH menyentuh Formula yang sudah pakai nilai akun itu (snapshot independen)", async () => {
    const owner = await createProvisionedUser(`ap-acc-delete-${runId}@test.local`);
    const createAccRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/accounts", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ accountNo: "110501", accountName: "Perantara Produksi" }),
      }),
    );
    const { account } = (await createAccRes.json()) as { account: { id: string } };

    const formulaRes = await testApp.handle(
      new Request("http://localhost/autoproduksi/formulas", {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...validFormulaBody, adjustmentAccountNo: "110501", adjustmentAccountName: "Perantara Produksi" }),
      }),
    );
    expect(formulaRes.status).toBe(200);
    const { formula } = (await formulaRes.json()) as { formula: { id: string } };

    const deleteRes = await testApp.handle(new Request(`http://localhost/autoproduksi/accounts/${account.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }));
    expect(deleteRes.status).toBe(200);

    const formulaCheckRes = await testApp.handle(new Request(`http://localhost/autoproduksi/formulas/${formula.id}`, { headers: { cookie: owner.cookie } }));
    expect(formulaCheckRes.status).toBe(200);
    const detail = (await formulaCheckRes.json()) as { formula: { adjustmentAccountNo: string; adjustmentAccountName: string | null } };
    expect(detail.formula.adjustmentAccountNo).toBe("110501");
    expect(detail.formula.adjustmentAccountName).toBe("Perantara Produksi");
  });
});
