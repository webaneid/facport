import { describe, test, expect } from "bun:test";
import { adminInsightsRoute } from "./insights.route";
import { DAY, insertAccount, insertDataUsaha, insertPaidInvoice, insertPlan, insertSub, loginAs, makeTestApp, runId } from "./insights.fixtures";
import { db } from "../../lib/db";
import { eq } from "drizzle-orm";
import { dataUsaha, memberSeats, user as userTable } from "../../db/schema";
import { createTestSeat } from "../../lib/test-fixtures";

// § Fase 189C — API Insight (read-only). Izin `insights.view` = Super Admin & Admin (D6). DB dev dipakai bersama → asersi lewat pelanggan uji (pencarian `q` unik) atau DELTA.
const app = makeTestApp(adminInsightsRoute);
const get = (cookie: string | null, path: string) => app.handle(new Request(`http://localhost/admin/insights${path}`, { headers: cookie ? { cookie } : {} }));
const json = async <T>(res: Response) => (await res.json()) as T;

describe("izin", () => {
  test("tanpa login 401; customer 403; Super Admin dan Admin (staff) 200 — untuk setiap endpoint E1", async () => {
    const customer = await loginAs(app, "customer");
    const admin = await loginAs(app, "admin");
    const staff = await loginAs(app, "staff");
    const owner = await insertAccount("izin");
    for (const path of ["/summary", "/customers", `/customers/${owner.id}/access`]) {
      expect((await get(null, path)).status).toBe(401);
      expect((await get(customer.cookie, path)).status).toBe(403);
      expect((await get(admin.cookie, path)).status).toBe(200);
      expect((await get(staff.cookie, path)).status).toBe(200);
    }
  });
});

describe("GET /summary", () => {
  type Summary = {
    accounts: { commercial: number; internal: number; disabled: number };
    dataUsaha: { total: number; connected: number };
    customers: { active: number; activeFeatures: number };
    expiring: { owners14: number; subscriptions14: number; owners30: number; subscriptions30: number };
    money: { thisMonth: { verified: number; adminSettled: number; total: number }; thisYear: { verified: number; adminSettled: number; total: number } };
  };

  test("DELTA: akun komersil vs internal, Data Usaha, pelanggan aktif, akan berakhir 14/30 hari, uang terverifikasi vs dilunasi admin (akun internal TIDAK dihitung)", async () => {
    const admin = await loginAs(app, "admin");
    const before = await json<Summary>(await get(admin.cookie, "/summary"));

    const commercial = await insertAccount("sum-komersil");
    const internal = await insertAccount("sum-internal", { isInternal: true });
    const disabled = await insertAccount("sum-nonaktif", { disabled: true });
    void disabled;
    const duC = await insertDataUsaha(commercial.id, "DU Komersil");
    await insertDataUsaha(internal.id, "DU Internal");
    const plan = await insertPlan("sales_invoice");
    const plan2 = await insertPlan("purchase_invoice");
    // 2 langganan komersil: satu berakhir 10 hari lagi, satu 25 hari lagi; internal juga punya langganan berakhir 5 hari (TIDAK dihitung)
    await insertSub({ ownerId: commercial.id, dataUsahaId: duC, planId: plan.id, start: new Date(Date.now() - 20 * DAY), end: new Date(Date.now() + 10 * DAY) });
    await insertSub({ ownerId: commercial.id, dataUsahaId: duC, planId: plan2.id, start: new Date(Date.now() - 5 * DAY), end: new Date(Date.now() + 25 * DAY) });
    await insertSub({ ownerId: internal.id, dataUsahaId: (await db.select().from(dataUsaha).where(eq(dataUsaha.userId, internal.id)))[0]!.id, planId: plan.id, start: new Date(Date.now() - 1 * DAY), end: new Date(Date.now() + 5 * DAY) });
    await insertPaidInvoice(commercial.id, 500_000, { method: "bank_transfer" });
    await insertPaidInvoice(commercial.id, 200_000, { method: "manual" });
    await insertPaidInvoice(commercial.id, 999_000, { status: "void" }); // tidak lunas → tidak dihitung
    await insertPaidInvoice(internal.id, 7_000_000, { method: "bank_transfer" }); // akun internal → keluar dari uang

    const after = await json<Summary>(await get(admin.cookie, "/summary"));
    // akun nonaktif tetap akun komersil (`disabled` adalah himpunan bagian, bukan kategori terpisah): pemilik + akun nonaktif = +2
    expect(after.accounts.commercial - before.accounts.commercial).toBe(2);
    expect(after.accounts.internal - before.accounts.internal).toBe(1);
    expect(after.accounts.disabled - before.accounts.disabled).toBe(1);
    expect(after.dataUsaha.total - before.dataUsaha.total).toBe(2);
    expect(after.customers.active - before.customers.active).toBe(1); // satu pemilik komersil
    expect(after.customers.activeFeatures - before.customers.activeFeatures).toBe(2);
    expect(after.expiring.subscriptions14 - before.expiring.subscriptions14).toBe(1);
    expect(after.expiring.owners14 - before.expiring.owners14).toBe(1);
    expect(after.expiring.subscriptions30 - before.expiring.subscriptions30).toBe(2);
    expect(after.expiring.owners30 - before.expiring.owners30).toBe(1);
    expect(after.money.thisMonth.verified - before.money.thisMonth.verified).toBe(500_000);
    expect(after.money.thisMonth.adminSettled - before.money.thisMonth.adminSettled).toBe(200_000);
    expect(after.money.thisMonth.total - before.money.thisMonth.total).toBe(700_000);
    expect(after.money.thisYear.total - before.money.thisYear.total).toBe(700_000);
  });
});

describe("GET /customers", () => {
  type Item = {
    id: string; name: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null; disabled: boolean;
    internalReason: "role" | "flag" | null; kind: "pemilik" | "tambahan" | "belum"; ownedDataUsaha: number; connectedDataUsaha: number; activeFeatures: string[]; nearestEndAt: string | null; createdAt: string;
  };
  type List = { items: Item[]; total: number; page: number; pageSize: number };

  test("pencarian, tipe (komersil/internal), jenis akun (pemilik/tambahan/belum), kontak, fitur aktif, berakhir terdekat", async () => {
    const admin = await loginAs(app, "admin");
    const tag = `cust${runId}`;
    const owner = await insertAccount(`${tag}-pemilik`, { companyName: "PT Pemilik Uji", phone: "+6281234567890", whatsapp: "+6281234567891" });
    const trainer = await insertAccount(`${tag}-trainer`, { isInternal: true });
    const member = await insertAccount(`${tag}-anggota`);
    const lone = await insertAccount(`${tag}-belum`, { phone: null, whatsapp: null, companyName: null });
    const du1 = await insertDataUsaha(owner.id, "DU Satu");
    const du2 = await insertDataUsaha(owner.id, "DU Dua");
    await db.update(dataUsaha).set({ accurateConnectionId: null }).where(eq(dataUsaha.id, du2));
    const plan = await insertPlan("sales_invoice");
    const plan2 = await insertPlan("journal_voucher");
    const nearest = new Date(Date.now() + 8 * DAY);
    await insertSub({ ownerId: owner.id, dataUsahaId: du1, planId: plan.id, start: new Date(Date.now() - 20 * DAY), end: new Date(Date.now() + 20 * DAY) });
    await insertSub({ ownerId: owner.id, dataUsahaId: du2, planId: plan2.id, start: new Date(Date.now() - 20 * DAY), end: nearest });
    await insertSub({ ownerId: owner.id, dataUsahaId: du1, planId: plan.id, start: new Date(Date.now() - 90 * DAY), end: new Date(Date.now() - 60 * DAY), status: "expired" }); // sudah berakhir → bukan fitur aktif
    // akun tambahan: punya slot aktif di DU milik pemilik
    const seatId = await createTestSeat(owner.id, du1);
    await db.update(memberSeats).set({ status: "active", memberUserId: member.id }).where(eq(memberSeats.id, seatId));

    const all = await json<List>(await get(admin.cookie, `/customers?q=${tag}&pageSize=50`));
    expect(all.total).toBe(4);
    const byId = new Map(all.items.map((i) => [i.id, i]));
    const o = byId.get(owner.id)!;
    expect(o).toMatchObject({ companyName: "PT Pemilik Uji", phone: "+6281234567890", whatsapp: "+6281234567891", internalReason: null, kind: "pemilik", ownedDataUsaha: 2, disabled: false });
    expect([...o.activeFeatures].sort()).toEqual(["journal_voucher", "sales_invoice"]);
    expect(new Date(o.nearestEndAt!).getTime()).toBe(nearest.getTime());
    expect(byId.get(trainer.id)).toMatchObject({ internalReason: "flag", kind: "belum" });
    expect(byId.get(member.id)).toMatchObject({ kind: "tambahan", ownedDataUsaha: 0, activeFeatures: [] });
    expect(byId.get(lone.id)).toMatchObject({ kind: "belum", phone: null, companyName: null });

    const commercial = await json<List>(await get(admin.cookie, `/customers?q=${tag}&type=commercial&pageSize=50`));
    expect(commercial.items.map((i) => i.id).sort()).toEqual([owner.id, member.id, lone.id].sort());
    const internal = await json<List>(await get(admin.cookie, `/customers?q=${tag}&type=internal&pageSize=50`));
    expect(internal.items.map((i) => i.id)).toEqual([trainer.id]);
  });

  test("pencarian menjangkau nama, email, dan nama perusahaan; paginasi memotong tanpa kehilangan total; akun non-customer tidak masuk", async () => {
    const admin = await loginAs(app, "admin");
    const tag = `page${runId}`;
    for (let i = 0; i < 5; i++) await insertAccount(`${tag}-${i}`, { companyName: `Perusahaan ${tag} ${i}` });
    const adminLike = await insertAccount(`${tag}-staf`, { roleName: "staff" });
    const page1 = await json<List>(await get(admin.cookie, `/customers?q=${tag}&pageSize=2&page=0`));
    const page3 = await json<List>(await get(admin.cookie, `/customers?q=${tag}&pageSize=2&page=2`));
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    expect(page3.items).toHaveLength(1);
    expect([...page1.items, ...page3.items].some((i) => i.id === adminLike.id)).toBe(false);
    const byCompany = await json<List>(await get(admin.cookie, `/customers?q=${encodeURIComponent(`Perusahaan ${tag} 3`)}`));
    expect(byCompany.total).toBe(1);
  });

  test("validasi: pageSize >100 / type salah → 422", async () => {
    const admin = await loginAs(app, "admin");
    expect((await get(admin.cookie, "/customers?pageSize=101")).status).toBe(422);
    expect((await get(admin.cookie, "/customers?type=semua")).status).toBe(422);
    expect((await get(admin.cookie, "/customers?page=-1")).status).toBe(422);
  });
});

describe("GET /customers/:userId/access", () => {
  test("per Data Usaha milik pelanggan: slot (member/undangan/tersedia) + info Data Usaha; user tak dikenal 404; tanpa Data Usaha → daftar kosong", async () => {
    const admin = await loginAs(app, "admin");
    const owner = await insertAccount("akses-pemilik");
    const member = await insertAccount("akses-anggota");
    const du1 = await insertDataUsaha(owner.id, "DU Akses Satu");
    const du2 = await insertDataUsaha(owner.id, "DU Akses Dua");
    const seat1 = await createTestSeat(owner.id, du1);
    await db.update(memberSeats).set({ status: "active", memberUserId: member.id }).where(eq(memberSeats.id, seat1));
    await createTestSeat(owner.id, du2); // tersedia

    const res = await get(admin.cookie, `/customers/${owner.id}/access`);
    expect(res.status).toBe(200);
    const body = await json<{ owner: { id: string; email: string }; dataUsaha: { id: string; name: string; seats: { status: string; memberEmail: string | null; seatExpired: boolean }[] }[] }>(res);
    expect(body.owner).toMatchObject({ id: owner.id, email: owner.email });
    const byName = new Map(body.dataUsaha.map((d) => [d.name, d]));
    expect(byName.get("DU Akses Satu")!.seats).toMatchObject([{ status: "active", memberEmail: member.email, seatExpired: false }]);
    expect(byName.get("DU Akses Dua")!.seats).toMatchObject([{ status: "available", memberEmail: null }]);

    expect((await get(admin.cookie, "/customers/tidak-ada/access")).status).toBe(404);
    const lone = await insertAccount("akses-sendiri");
    expect(await json<{ dataUsaha: unknown[] }>(await get(admin.cookie, `/customers/${lone.id}/access`))).toMatchObject({ dataUsaha: [] });
    void userTable;
  });
});
