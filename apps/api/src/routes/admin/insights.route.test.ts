import { describe, test, expect } from "bun:test";
import { adminInsightsRoute } from "./insights.route";
import { DAY, insertAccount, insertDataUsaha, insertDataUsahaEventRow, insertOpenRenewalOrder, insertPaidInvoice, insertPlan, insertSub, loginAs, makeTestApp, runId, wib } from "./insights.fixtures";
import { db } from "../../lib/db";
import { and, desc, eq } from "drizzle-orm";
import { auditLogs, dataUsaha, memberSeats, user as userTable } from "../../db/schema";
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
    for (const path of ["/summary", "/customers", `/customers/${owner.id}/access`, "/features", "/features/other_deposit/customers", "/new?from=2026-01-01&to=2026-01-31", "/expiring?window=14", "/trend?year=2021&metric=active", "/tenure?month=2024-10", "/connection-history", "/export/customers"]) {
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
    expect((await get(admin.cookie, "/customers?page=2001")).status).toBe(422); // OFFSET dibatasi (maks 2.000 halaman)
    expect((await get(admin.cookie, "/customers?page=2000")).status).toBe(200);
  });
});

describe("GET /customers — jumlah slot User Tambahan & filter jenis akun (tab Akses)", () => {
  type Row = { id: string; kind: string; seats: { active: number; invited: number; available: number } };
  test("pemilik membawa ringkasan slot (aktif/diundang/tersedia) lintas Data Usaha miliknya; filter kind memisahkan pemilik/tambahan/belum", async () => {
    const admin = await loginAs(app, "admin");
    const tag = `slot${runId}`;
    const owner = await insertAccount(`${tag}-pemilik`);
    const member = await insertAccount(`${tag}-anggota`);
    const lone = await insertAccount(`${tag}-belum`);
    const du1 = await insertDataUsaha(owner.id, "Slot DU Satu");
    const du2 = await insertDataUsaha(owner.id, "Slot DU Dua");
    const active = await createTestSeat(owner.id, du1);
    await db.update(memberSeats).set({ status: "active", memberUserId: member.id }).where(eq(memberSeats.id, active));
    const invited = await createTestSeat(owner.id, du1);
    await db.update(memberSeats).set({ status: "invited", invitedEmail: "undangan@test.local" }).where(eq(memberSeats.id, invited));
    await createTestSeat(owner.id, du1); // tersedia
    await createTestSeat(owner.id, du2); // tersedia

    const list = async (kind: string) => json<{ items: Row[]; total: number }>(await get(admin.cookie, `/customers?q=${tag}&kind=${kind}&pageSize=50`));
    const owners = await list("pemilik");
    expect(owners.items.map((i) => i.id)).toEqual([owner.id]);
    expect(owners.items[0]!.seats).toEqual({ active: 1, invited: 1, available: 2 });
    expect((await list("tambahan")).items.map((i) => i.id)).toEqual([member.id]);
    expect((await list("belum")).items.map((i) => i.id)).toEqual([lone.id]);
    const all = await list("semua");
    expect(all.total).toBe(3);
    expect(all.items.find((i) => i.id === lone.id)!.seats).toEqual({ active: 0, invited: 0, available: 0 });
    expect((await get(admin.cookie, "/customers?kind=lain")).status).toBe(422);
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
    // hanya akun customer: akun admin/staf tidak bisa ditelusuri lewat endpoint pelanggan
    const staffAccount = await insertAccount("akses-staf", { roleName: "staff" });
    expect((await get(admin.cookie, `/customers/${staffAccount.id}/access`)).status).toBe(404);
    const lone = await insertAccount("akses-sendiri");
    expect(await json<{ dataUsaha: unknown[] }>(await get(admin.cookie, `/customers/${lone.id}/access`))).toMatchObject({ dataUsaha: [] });
    void userTable;
  });
});

describe("GET /features & /features/:moduleKey/customers", () => {
  type Features = { features: { moduleKey: string; label: string; dataUsaha: number; customers: number; subscriptions: number }[] };
  const row = (f: Features, key: string) => f.features.find((x) => x.moduleKey === key) ?? { dataUsaha: 0, customers: 0, subscriptions: 0, label: "" };

  test("DELTA per fitur: pemilik KOMERSIL dengan langganan aktif; internal, kedaluwarsa, trial, seat dikecualikan; satu pemilik dengan 2 Data Usaha = 1 pelanggan, 2 Data Usaha", async () => {
    const admin = await loginAs(app, "admin");
    const before = await json<Features>(await get(admin.cookie, "/features"));
    const key = "other_deposit";

    const a = await insertAccount("fitur-a", { companyName: "PT Fitur A" });
    const b = await insertAccount("fitur-b");
    const internal = await insertAccount("fitur-int", { isInternal: true });
    const d = await insertAccount("fitur-exp");
    const plan = await insertPlan(key);
    const a1 = await insertDataUsaha(a.id, "A Satu");
    const a2 = await insertDataUsaha(a.id, "A Dua");
    const b1 = await insertDataUsaha(b.id, "B Satu");
    const i1 = await insertDataUsaha(internal.id, "Int Satu");
    const d1 = await insertDataUsaha(d.id, "D Satu");
    const start = new Date(Date.now() - 10 * DAY);
    const end = new Date(Date.now() + 20 * DAY);
    await insertSub({ ownerId: a.id, dataUsahaId: a1, planId: plan.id, start, end });
    await insertSub({ ownerId: a.id, dataUsahaId: a2, planId: plan.id, start, end });
    await insertSub({ ownerId: b.id, dataUsahaId: b1, planId: plan.id, start, end });
    await insertSub({ ownerId: internal.id, dataUsahaId: i1, planId: plan.id, start, end });
    await insertSub({ ownerId: d.id, dataUsahaId: d1, planId: plan.id, start: new Date(Date.now() - 60 * DAY), end: new Date(Date.now() - 30 * DAY), status: "expired" });
    await insertSub({ ownerId: d.id, dataUsahaId: d1, planId: plan.id, start, end, isTrial: true });
    const seatPlan = await insertPlan(null, { kind: "seat_addon" });
    await insertSub({ ownerId: b.id, dataUsahaId: b1, planId: seatPlan.id, start, end });

    const after = await json<Features>(await get(admin.cookie, "/features"));
    expect(row(after, key).customers - row(before, key).customers).toBe(2);
    expect(row(after, key).dataUsaha - row(before, key).dataUsaha).toBe(3);
    expect(row(after, key).subscriptions - row(before, key).subscriptions).toBe(3);
    expect(row(after, key).label).toBe("Other Deposit (Cash/Bank Receipt)");
    expect(after.features.every((f) => f.moduleKey !== "")).toBe(true); // seat (tanpa modul) tidak muncul sebagai fitur
  });

  test("daftar pemakai satu fitur: baris per Data Usaha dengan kontak pemilik, paket, masa berlaku; internal/kedaluwarsa/trial tidak masuk; modul tak dikenal 404", async () => {
    const admin = await loginAs(app, "admin");
    const key = "purchase_order";
    const a = await insertAccount("pakai-a", { companyName: "PT Pemakai A", phone: "+6281200000001", whatsapp: "+6281200000002" });
    const internal = await insertAccount("pakai-int", { isInternal: true });
    const plan = await insertPlan(key);
    const a1 = await insertDataUsaha(a.id, "Pemakai A Satu");
    const a2 = await insertDataUsaha(a.id, "Pemakai A Dua");
    const i1 = await insertDataUsaha(internal.id, "Pemakai Int");
    const end1 = new Date(Date.now() + 5 * DAY);
    await insertSub({ ownerId: a.id, dataUsahaId: a1, planId: plan.id, start: new Date(Date.now() - DAY), end: end1, renewalInterval: "monthly" });
    await insertSub({ ownerId: a.id, dataUsahaId: a2, planId: plan.id, start: new Date(Date.now() - DAY), end: new Date(Date.now() + 15 * DAY) });
    await insertSub({ ownerId: internal.id, dataUsahaId: i1, planId: plan.id, start: new Date(Date.now() - DAY), end: end1 });

    type Users = { moduleKey: string; label: string; items: { owner: { id: string; name: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null }; dataUsahaName: string; planName: string; startAt: string; endAt: string | null; renewalInterval: string | null }[]; total: number };
    const res = await json<Users>(await get(admin.cookie, `/features/${key}/customers?pageSize=100`));
    expect(res).toMatchObject({ moduleKey: key, label: "Purchase Order" });
    const mine = res.items.filter((i) => i.owner.id === a.id);
    expect(mine.map((i) => i.dataUsahaName).sort()).toEqual(["Pemakai A Dua", "Pemakai A Satu"]);
    expect(mine[0]!.owner).toMatchObject({ companyName: "PT Pemakai A", phone: "+6281200000001", whatsapp: "+6281200000002", email: a.email });
    expect(mine.find((i) => i.dataUsahaName === "Pemakai A Satu")).toMatchObject({ renewalInterval: "monthly", planName: plan.name });
    expect(res.items.some((i) => i.owner.id === internal.id)).toBe(false);

    expect((await get(admin.cookie, "/features/tidak_ada_modul/customers")).status).toBe(404);
  });
});

describe("GET /new (pelanggan/langganan baru dalam rentang)", () => {
  type NewRes = {
    range: { from: string; to: string };
    summary: { customers: number; newCustomers: number; subscriptions: number };
    items: { owner: { id: string; email: string; companyName: string | null; phone: string | null }; isNewCustomer: boolean; firstStartAt: string; features: { moduleKey: string; label: string; dataUsahaName: string; startAt: string }[] }[];
    total: number;
  };
  // rentang masa lalu yang tidak bertabrakan dengan data tes lain: Maret 2020 (WIB)
  const range = "from=2020-03-01&to=2020-03-31&pageSize=100";

  test("pelanggan baru vs lama; trial/internal/di luar rentang/dibatalkan dikecualikan; batas tengah malam zona perusahaan", async () => {
    const admin = await loginAs(app, "admin");
    const fresh = await insertAccount("baru-fresh", { companyName: "PT Baru" });
    const old = await insertAccount("baru-lama");
    const internal = await insertAccount("baru-int", { isInternal: true });
    const edge = await insertAccount("baru-tepi");
    const planA = await insertPlan("sales_invoice");
    const planB = await insertPlan("purchase_invoice");
    const duFresh = await insertDataUsaha(fresh.id, "DU Fresh");
    const duOld = await insertDataUsaha(old.id, "DU Lama");
    const duInt = await insertDataUsaha(internal.id, "DU Int");
    const duEdge = await insertDataUsaha(edge.id, "DU Tepi");
    // fresh: 2 fitur dimulai di Maret 2020 (pertama kali)
    await insertSub({ ownerId: fresh.id, dataUsahaId: duFresh, planId: planA.id, start: wib(2020, 3, 10, 9), end: wib(2020, 4, 10, 9), status: "expired" });
    await insertSub({ ownerId: fresh.id, dataUsahaId: duFresh, planId: planB.id, start: wib(2020, 3, 12, 9), end: wib(2020, 4, 12, 9), status: "expired" });
    // lama: pernah berlangganan 2019, fitur tambahan Maret 2020 → bukan pelanggan baru
    await insertSub({ ownerId: old.id, dataUsahaId: duOld, planId: planA.id, start: wib(2019, 6, 1), end: wib(2019, 7, 1), status: "expired" });
    await insertSub({ ownerId: old.id, dataUsahaId: duOld, planId: planB.id, start: wib(2020, 3, 20), end: wib(2020, 4, 20), status: "expired" });
    // dikecualikan: internal, trial, dibatalkan, di luar rentang
    await insertSub({ ownerId: internal.id, dataUsahaId: duInt, planId: planA.id, start: wib(2020, 3, 5), end: wib(2020, 4, 5), status: "expired" });
    await insertSub({ ownerId: fresh.id, dataUsahaId: duFresh, planId: planA.id, start: wib(2020, 3, 15), end: wib(2020, 3, 20), status: "expired", isTrial: true });
    await insertSub({ ownerId: fresh.id, dataUsahaId: duFresh, planId: planA.id, start: wib(2020, 3, 16), end: wib(2020, 4, 16), status: "cancelled" });
    // tepi: 31 Mar 23:30 WIB masuk Maret; 1 Apr 00:00 WIB tidak
    await insertSub({ ownerId: edge.id, dataUsahaId: duEdge, planId: planA.id, start: wib(2020, 3, 31, 23, 30), end: wib(2020, 4, 30), status: "expired" });
    await insertSub({ ownerId: edge.id, dataUsahaId: duEdge, planId: planB.id, start: wib(2020, 4, 1, 0, 0), end: wib(2020, 5, 1), status: "expired" });

    const res = await json<NewRes>(await get(admin.cookie, `/new?${range}`));
    expect(res.range).toEqual({ from: "2020-03-01", to: "2020-03-31" });
    const mine = new Map(res.items.filter((i) => [fresh.id, old.id, internal.id, edge.id].includes(i.owner.id)).map((i) => [i.owner.id, i]));
    expect([...mine.keys()].sort()).toEqual([fresh.id, old.id, edge.id].sort());
    expect(mine.get(fresh.id)).toMatchObject({ isNewCustomer: true, owner: { companyName: "PT Baru", email: fresh.email } });
    expect(mine.get(fresh.id)!.features.map((f) => f.moduleKey).sort()).toEqual(["purchase_invoice", "sales_invoice"]);
    expect(mine.get(old.id)).toMatchObject({ isNewCustomer: false });
    expect(mine.get(old.id)!.features.map((f) => f.moduleKey)).toEqual(["purchase_invoice"]); // fitur 2019 di luar rentang
    expect(mine.get(edge.id)!.features.map((f) => f.moduleKey)).toEqual(["sales_invoice"]); // hanya yang 31 Mar 23:30
    expect(mine.get(edge.id)!.isNewCustomer).toBe(true);
    // ringkasan konsisten dengan daftar
    expect(res.summary.customers).toBe(res.total);
    expect(res.summary.newCustomers).toBe(res.items.filter((i) => i.isNewCustomer).length);
    expect(res.summary.subscriptions).toBe(res.items.reduce((s, i) => s + i.features.length, 0));
  });

  test("validasi rentang: format salah / mustahil / terbalik / >24 bulan / tanpa parameter → 422 dengan kode", async () => {
    const admin = await loginAs(app, "admin");
    const code = async (q: string) => ({ status: (await get(admin.cookie, `/new?${q}`)).status });
    expect(await code("from=2026-1-1&to=2026-01-31")).toEqual({ status: 422 });
    expect(await code("from=2026-02-30&to=2026-03-01")).toEqual({ status: 422 });
    expect(await code("from=2026-03-02&to=2026-03-01")).toEqual({ status: 422 });
    expect(await code("from=2020-01-01&to=2023-01-01")).toEqual({ status: 422 });
    expect(await code("")).toEqual({ status: 422 });
    const body = await json<{ code: string }>(await get(admin.cookie, "/new?from=2026-03-02&to=2026-03-01"));
    expect(body.code).toBe("RANGE_ORDER");
  });
});

describe("GET /expiring (akan berakhir 14/30 hari)", () => {
  type Exp = {
    window: number;
    summary: { owners: number; subscriptions: number };
    items: { owner: { id: string; email: string; phone: string | null; whatsapp: string | null; companyName: string | null }; nearestEndAt: string; subscriptions: { id: string; moduleKey: string; label: string; dataUsahaName: string; endAt: string; daysLeft: number; renewal: { status: "terbit" | "terjadwal" | "tidak_terjadwal"; invoiceNumber?: string; interval?: string } }[] }[];
  };

  test("jendela 14 vs 30 hari; hanya langganan aktif berbayar milik pemilik komersil; status tagihan perpanjangan; urut terdekat dulu", async () => {
    const admin = await loginAs(app, "admin");
    const owner = await insertAccount("exp-pemilik", { companyName: "PT Akan Habis", phone: "+6281300000001", whatsapp: "+6281300000002" });
    const other = await insertAccount("exp-lain");
    const internal = await insertAccount("exp-int", { isInternal: true });
    const du = await insertDataUsaha(owner.id, "DU Habis");
    const du2 = await insertDataUsaha(other.id, "DU Lain");
    const duI = await insertDataUsaha(internal.id, "DU Int");
    const sales = await insertPlan("sales_invoice");
    const purchase = await insertPlan("purchase_invoice");
    const journal = await insertPlan("journal_voucher");
    const deposit = await insertPlan("other_deposit");
    const start = new Date(Date.now() - 20 * DAY);
    const s3 = await insertSub({ ownerId: owner.id, dataUsahaId: du, planId: sales.id, start, end: new Date(Date.now() + 3 * DAY), renewalInterval: "monthly" }); // terjadwal
    const s13 = await insertSub({ ownerId: owner.id, dataUsahaId: du, planId: purchase.id, start, end: new Date(Date.now() + 13 * DAY) }); // tidak terjadwal
    await insertSub({ ownerId: owner.id, dataUsahaId: du, planId: journal.id, start, end: new Date(Date.now() + 20 * DAY) }); // hanya jendela 30
    await insertSub({ ownerId: owner.id, dataUsahaId: du, planId: deposit.id, start, end: new Date(Date.now() + 45 * DAY) }); // di luar 30 hari
    await insertSub({ ownerId: owner.id, dataUsahaId: du, planId: sales.id, start: new Date(Date.now() - 60 * DAY), end: new Date(Date.now() - DAY), status: "expired" }); // sudah berakhir
    await insertSub({ ownerId: owner.id, dataUsahaId: du, planId: sales.id, start, end: new Date(Date.now() + 2 * DAY), isTrial: true }); // trial
    await insertSub({ ownerId: internal.id, dataUsahaId: duI, planId: sales.id, start, end: new Date(Date.now() + 2 * DAY) }); // internal
    const sOther = await insertSub({ ownerId: other.id, dataUsahaId: du2, planId: sales.id, start, end: new Date(Date.now() + 1 * DAY) }); // terbit
    await insertOpenRenewalOrder(other.id, du2, sales.id, "sales_invoice", 250_000);

    const w14 = await json<Exp>(await get(admin.cookie, "/expiring?window=14&pageSize=100"));
    const mine14 = w14.items.find((i) => i.owner.id === owner.id)!;
    expect(mine14.owner).toMatchObject({ companyName: "PT Akan Habis", phone: "+6281300000001", whatsapp: "+6281300000002", email: owner.email });
    expect(mine14.subscriptions.map((s) => s.moduleKey)).toEqual(["sales_invoice", "purchase_invoice"]); // terdekat dulu
    expect(mine14.subscriptions[0]).toMatchObject({ id: s3.id, daysLeft: 3, renewal: { status: "terjadwal", interval: "monthly" }, dataUsahaName: "DU Habis" });
    expect(mine14.subscriptions[1]).toMatchObject({ id: s13.id, daysLeft: 13, renewal: { status: "tidak_terjadwal" } });
    expect(new Date(mine14.nearestEndAt).getTime()).toBe(new Date(mine14.subscriptions[0]!.endAt).getTime());
    expect(w14.items.some((i) => i.owner.id === internal.id)).toBe(false);
    const otherItem = w14.items.find((i) => i.owner.id === other.id)!;
    expect(otherItem.subscriptions[0]).toMatchObject({ id: sOther.id, renewal: { status: "terbit" } });
    expect(otherItem.subscriptions[0]!.renewal.invoiceNumber).toMatch(/^INV\/REN\//);
    expect(w14.window).toBe(14);

    const w30 = await json<Exp>(await get(admin.cookie, "/expiring?window=30&pageSize=100"));
    expect(w30.items.find((i) => i.owner.id === owner.id)!.subscriptions.map((s) => s.moduleKey)).toEqual(["sales_invoice", "purchase_invoice", "journal_voucher"]);
    // pemilik terdekat lebih dulu
    const order = w30.items.map((i) => i.owner.id);
    expect(order.indexOf(other.id)).toBeLessThan(order.indexOf(owner.id));
  });

  test("window selain 14/30 atau tanpa window → 422 (hanya dua preset, D14)", async () => {
    const admin = await loginAs(app, "admin");
    expect((await get(admin.cookie, "/expiring?window=7")).status).toBe(422);
    expect((await get(admin.cookie, "/expiring")).status).toBe(422);
    expect((await get(admin.cookie, "/expiring?window=14")).status).toBe(200);
  });
});

describe("GET /trend", () => {
  type Point = { month: string; value: number | null; previous: number | null; delta: number | null; percent: number | null; future: boolean };
  type Trend = { year: number; metric: string; points: Point[]; summary: { kind: "flow" | "stock"; value: number }; cumulative?: (number | null)[]; parts?: { verified: Point[]; adminSettled: Point[] } };
  const trend = async (cookie: string, year: number, metric: string) => json<Trend>(await get(cookie, `/trend?year=${year}&metric=${metric}`));
  // DB dev dipakai bersama dan data bertahun-lampau TIDAK ikut "bergeser" → asersi memakai SELISIH sebelum/sesudah per bulan (tahan sisa data run lain).
  const values = (t: Trend) => t.points.map((p) => p.value ?? 0);
  const diff = (after: Trend, before: Trend) => values(after).map((v, i) => v - values(before)[i]!);

  test("active / new / stopped (2021): aktif menyentuh bulan, baru = awal pertama, berhenti = aktif bulan lalu tapi tidak bulan ini; internal & trial dikecualikan; Januari membandingkan dengan Desember tahun lalu", async () => {
    const admin = await loginAs(app, "admin");
    const beforeActive = await trend(admin.cookie, 2021, "active");
    const beforeNew = await trend(admin.cookie, 2021, "new");
    const beforeStopped = await trend(admin.cookie, 2021, "stopped");
    const plan = await insertPlan("sales_invoice");
    const mk = async (tag: string, opts: { isInternal?: boolean } = {}) => {
      const acc = await insertAccount(`tren-${tag}`, opts);
      return { id: acc.id, du: await insertDataUsaha(acc.id, `DU ${tag}`) };
    };
    const A = await mk("a");
    const B = await mk("b");
    const C = await mk("c");
    const F = await mk("f");
    const I = await mk("int", { isInternal: true });
    const T = await mk("trial");
    const s = (o: { id: string; du: string }, start: Date, end: Date, extra: { isTrial?: boolean } = {}) => insertSub({ ownerId: o.id, dataUsahaId: o.du, planId: plan.id, start, end, status: "expired", ...extra });
    await s(A, wib(2021, 1, 15), wib(2021, 4, 20)); // aktif Jan-Apr
    await s(B, wib(2021, 2, 1), wib(2021, 12, 31)); // Feb-Des
    await s(C, wib(2021, 3, 10), wib(2021, 3, 25)); // Mar saja
    await s(F, wib(2020, 11, 1), wib(2021, 2, 10)); // Des 2020 - Feb 2021
    await s(I, wib(2021, 1, 1), wib(2021, 12, 31)); // internal
    await s(T, wib(2021, 3, 5), wib(2021, 4, 5), { isTrial: true }); // trial

    const active = await trend(admin.cookie, 2021, "active");
    expect(active.summary.kind).toBe("stock");
    // aktif per bulan (selisih): Jan A,F=2 · Feb A,B,F=3 · Mar A,B,C=3 · Apr A,B=2 · Mei s.d. Des B=1
    expect(diff(active, beforeActive)).toEqual([2, 3, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(active.points[0]).toMatchObject({ month: "2021-01", future: false });
    // Januari dibandingkan dengan Desember 2020 (F aktif di sana): previous naik 1 dibanding sebelum data ditambahkan
    expect(active.points[0]!.previous! - beforeActive.points[0]!.previous!).toBe(1);

    const fresh = await trend(admin.cookie, 2021, "new");
    expect(fresh.summary.kind).toBe("flow");
    expect(diff(fresh, beforeNew).slice(0, 5)).toEqual([1, 1, 1, 0, 0]); // A (Jan), B (Feb), C (Mar); F sudah berlangganan 2020; internal/trial tidak dihitung
    expect(fresh.summary.value - beforeNew.summary.value).toBe(3);

    const stopped = await trend(admin.cookie, 2021, "stopped");
    expect(diff(stopped, beforeStopped).slice(0, 6)).toEqual([0, 0, 1, 1, 1, 0]); // Mar: F berhenti, Apr: C, Mei: A
    expect(stopped.summary.value - beforeStopped.summary.value).toBe(3);
  });

  test("tahun depan → semua bulan future dengan nilai null; tahun/metrik tidak valid → 422", async () => {
    const admin = await loginAs(app, "admin");
    const nextYear = new Date().getUTCFullYear() + 1;
    const t = await trend(admin.cookie, nextYear, "active");
    expect(t.points.every((p) => p.future && p.value === null && p.delta === null)).toBe(true);
    expect((await get(admin.cookie, "/trend?year=2026&metric=lain")).status).toBe(422);
    expect((await get(admin.cookie, "/trend?year=1999&metric=active")).status).toBe(422);
    expect((await get(admin.cookie, "/trend?metric=active")).status).toBe(422);
  });

  test("registered (2022): akun KOMERSIL dibuat per bulan (internal & non-customer dikecualikan), kumulatif konsisten", async () => {
    const admin = await loginAs(app, "admin");
    const before = await trend(admin.cookie, 2022, "registered");
    await insertAccount("reg-des", { createdAt: wib(2021, 12, 20) });
    await insertAccount("reg-jan1", { createdAt: wib(2022, 1, 5) });
    await insertAccount("reg-jan2", { createdAt: wib(2022, 1, 20) });
    await insertAccount("reg-mar", { createdAt: wib(2022, 3, 3) });
    await insertAccount("reg-int", { createdAt: wib(2022, 2, 10), isInternal: true });
    await insertAccount("reg-staf", { createdAt: wib(2022, 2, 11), roleName: "staff" });
    const t = await trend(admin.cookie, 2022, "registered");
    expect(diff(t, before).slice(0, 3)).toEqual([2, 0, 1]); // internal & staf dikecualikan
    expect(t.points[0]!.previous! - before.points[0]!.previous!).toBe(1); // akun Des 2021
    expect(t.summary.kind).toBe("flow");
    expect(t.summary.value - before.summary.value).toBe(3);
    // kumulatif: naik 2 di Jan, tetap di Feb, naik 1 di Mar (relatif terhadap sebelum data ditambahkan)
    const c = t.cumulative!;
    expect(c).toHaveLength(12);
    const cb = before.cumulative!;
    expect([c[0]! - cb[0]!, c[1]! - cb[1]!, c[2]! - cb[2]!]).toEqual([3, 3, 4]); // +1 baseline (Des 2021) +2 Jan, lalu +0, lalu +1
  });

  test("money (2023): terverifikasi vs dilunasi admin per bulan; internal, tidak lunas, di luar tahun dikecualikan; pembanding Januari = Des 2022", async () => {
    const admin = await loginAs(app, "admin");
    const before = await trend(admin.cookie, 2023, "money");
    const c = await insertAccount("uang-komersil");
    const i = await insertAccount("uang-int", { isInternal: true });
    await insertPaidInvoice(c.id, 80_000, { method: "bank_transfer", paidAt: wib(2022, 12, 30) });
    await insertPaidInvoice(c.id, 100_000, { method: "bank_transfer", paidAt: wib(2023, 1, 10) });
    await insertPaidInvoice(c.id, 50_000, { method: "manual", paidAt: wib(2023, 1, 20) });
    await insertPaidInvoice(c.id, 200_000, { method: "qris", paidAt: wib(2023, 2, 5) });
    await insertPaidInvoice(c.id, 999_000, { status: "void", paidAt: wib(2023, 3, 1) });
    await insertPaidInvoice(i.id, 7_000_000, { method: "bank_transfer", paidAt: wib(2023, 1, 15) });
    await insertPaidInvoice(c.id, 5_000, { method: "bank_transfer", paidAt: wib(2024, 1, 1) });
    const t = await trend(admin.cookie, 2023, "money");
    expect(t.summary.kind).toBe("flow");
    expect(diff(t, before).slice(0, 3)).toEqual([150_000, 200_000, 0]); // void, internal, dan tahun 2024 tidak dihitung
    expect(t.points[0]!.previous! - before.points[0]!.previous!).toBe(80_000); // pembanding Januari = Desember 2022
    const parts = t.parts!;
    const partDiff = (after: Point[], b: Point[]) => after.map((p, i) => (p.value ?? 0) - (b[i]!.value ?? 0));
    expect(partDiff(parts.verified, before.parts!.verified).slice(0, 2)).toEqual([100_000, 200_000]);
    expect(partDiff(parts.adminSettled, before.parts!.adminSettled).slice(0, 2)).toEqual([50_000, 0]);
    expect(t.summary.value - before.summary.value).toBe(350_000);
  });
});

describe("GET /tenure", () => {
  type Tenure = { month: string; aktif: number; baru: number; lanjutanTahun1: number; byYear: { year: number; count: number }[]; berhenti: number; kembali: number };

  test("rincian menurut usia langganan di Okt 2024: baru, lanjutan tahun ke-1, tahun ke-2/3, berhenti, kembali; internal dikecualikan", async () => {
    const admin = await loginAs(app, "admin");
    const before = await json<Tenure>(await get(admin.cookie, "/tenure?month=2024-10"));
    const plan = await insertPlan("sales_invoice");
    const mk = async (tag: string, opts: { isInternal?: boolean } = {}) => {
      const acc = await insertAccount(`usia-${tag}`, opts);
      return { id: acc.id, du: await insertDataUsaha(acc.id, `DU ${tag}`) };
    };
    const s = (o: { id: string; du: string }, start: Date, end: Date) => insertSub({ ownerId: o.id, dataUsahaId: o.du, planId: plan.id, start, end, status: "expired" });
    const a = await mk("a"); await s(a, wib(2024, 10, 3), wib(2024, 11, 3));
    const b = await mk("b"); await s(b, wib(2024, 3, 1), wib(2024, 11, 1));
    const c = await mk("c"); await s(c, wib(2023, 3, 1), wib(2024, 12, 1));
    const d = await mk("d"); await s(d, wib(2022, 10, 2), wib(2024, 12, 1));
    const e = await mk("e"); await s(e, wib(2024, 1, 1), wib(2024, 10, 1));
    const f = await mk("f"); await s(f, wib(2023, 1, 1), wib(2024, 8, 31)); await s(f, wib(2024, 10, 5), wib(2024, 11, 5));
    const g = await mk("g", { isInternal: true }); await s(g, wib(2024, 1, 1), wib(2024, 12, 1));

    const t = await json<Tenure>(await get(admin.cookie, "/tenure?month=2024-10"));
    const yearCount = (r: Tenure, year: number) => r.byYear.find((y) => y.year === year)?.count ?? 0;
    expect({ aktif: t.aktif - before.aktif, baru: t.baru - before.baru, lanjutanTahun1: t.lanjutanTahun1 - before.lanjutanTahun1, berhenti: t.berhenti - before.berhenti, kembali: t.kembali - before.kembali }).toEqual({
      aktif: 5, baru: 1, lanjutanTahun1: 1, berhenti: 1, kembali: 1,
    });
    expect(yearCount(t, 2) - yearCount(before, 2)).toBe(2); // c (19 bulan) dan f (21 bulan sejak awal pertama)
    expect(yearCount(t, 3) - yearCount(before, 3)).toBe(1); // d (24 bulan)
    // kolom usia memartisi pelanggan aktif tepat satu kali
    expect(t.baru + t.lanjutanTahun1 + t.byYear.reduce((n, y) => n + y.count, 0)).toBe(t.aktif);
  });

  test("tanpa parameter → bulan berjalan; format salah atau bulan di masa depan → 422", async () => {
    const admin = await loginAs(app, "admin");
    const now = await json<Tenure>(await get(admin.cookie, "/tenure"));
    expect(now.month).toMatch(/^\d{4}-\d{2}$/);
    expect((await get(admin.cookie, "/tenure?month=2026-13")).status).toBe(422);
    expect((await get(admin.cookie, "/tenure?month=abc")).status).toBe(422);
    const future = `${new Date().getUTCFullYear() + 2}-01`;
    const res = await get(admin.cookie, `/tenure?month=${future}`);
    expect(res.status).toBe(422);
    expect(await json<{ code: string }>(res)).toMatchObject({ code: "FUTURE_MONTH" });
  });
});

describe("GET /connection-history (laporan lintas pelanggan)", () => {
  type Item = { id: string; action: string; createdAt: string; actor: { id: string; name: string } | null; changes: Record<string, unknown>; dataUsaha: { id: string; name: string }; owner: { id: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null } };
  type Report = {
    items: Item[];
    total: number;
    summary: { byAction: Record<string, number>; dataUsahaWithCorrection: number; ownersWithCorrection: number; repeatedCorrection: number };
  };
  // jendela masa lalu Mei 2019 (tidak bertabrakan dengan data tes lain); asersi tetap lewat DELTA + keanggotaan id
  const win = "from=2019-05-01&to=2019-05-31";
  const report = async (cookie: string, q = "") => json<Report>(await get(cookie, `/connection-history?${win}&pageSize=100${q}`));

  test("cerita salah → koreksi → benar; internal & di luar jendela & aksi non-koneksi dikecualikan; urut terbaru dulu; ringkasan koreksi", async () => {
    const admin = await loginAs(app, "admin");
    const before = await report(admin.cookie);
    const tag = `hist${runId}`;
    const owner = await insertAccount(`${tag}-a`, { companyName: "PT Salah Sambung", phone: "+6281400000001", whatsapp: "+6281400000002" });
    const owner2 = await insertAccount(`${tag}-b`);
    const internal = await insertAccount(`${tag}-int`, { isInternal: true });
    const du = await insertDataUsaha(owner.id, `${tag} DU Satu`);
    const du2 = await insertDataUsaha(owner2.id, `${tag} DU Dua`);
    const duI = await insertDataUsaha(internal.id, `${tag} DU Int`);
    const adminUser = await loginAs(app, "staff");

    await insertDataUsahaEventRow(du, "connect_accurate", owner.id, { via: "oauth", accountEmail: "akun@accurate.test" }, wib(2019, 5, 2, 9));
    await insertDataUsahaEventRow(du, "select_database", owner.id, { accurateDbId: "1", alias: "PT Salah" }, wib(2019, 5, 2, 9, 5));
    await insertDataUsahaEventRow(du, "reset_database", owner.id, { previousDbId: "1", previousAlias: "PT Salah" }, wib(2019, 5, 3, 10)); // koreksi mandiri
    await insertDataUsahaEventRow(du, "select_database", owner.id, { accurateDbId: "2", alias: "PT Benar" }, wib(2019, 5, 3, 10, 2));
    await insertDataUsahaEventRow(du2, "disconnect_accurate", adminUser.id, { previousAccurateDbAlias: "PT X", reason: { code: "salah_akun", note: null } }, wib(2019, 5, 10, 8));
    await insertDataUsahaEventRow(du2, "disconnect_accurate", adminUser.id, { previousAccurateDbAlias: "PT X", previousConnectionId: "conn-rahasia", affectedDataUsahaIds: ["a", "b"], reason: { code: "salah_database", note: null } }, wib(2019, 5, 20, 8)); // berulang
    await insertDataUsahaEventRow(du, "connect_accurate", owner.id, { via: "oauth" }, wib(2019, 4, 30, 23)); // di luar jendela (30 Apr)
    await insertDataUsahaEventRow(du, "update", owner.id, { name: "bukan koneksi" }, wib(2019, 5, 5)); // aksi lain
    await insertDataUsahaEventRow(duI, "reset_database", internal.id, { previousAlias: "PT Int" }, wib(2019, 5, 6)); // internal

    const after = await report(admin.cookie);
    const mine = after.items.filter((i) => [du, du2, duI].includes(i.dataUsaha.id));
    expect(mine.map((i) => i.action)).toEqual(["disconnect_accurate", "disconnect_accurate", "select_database", "reset_database", "select_database", "connect_accurate"]);
    // terbaru dulu
    const times = mine.map((i) => new Date(i.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const reset = mine.find((i) => i.action === "reset_database")!;
    expect(reset).toMatchObject({ dataUsaha: { id: du, name: `${tag} DU Satu` }, owner: { id: owner.id, email: owner.email, companyName: "PT Salah Sambung", phone: "+6281400000001", whatsapp: "+6281400000002" }, changes: { previousAlias: "PT Salah" } });
    expect(reset.actor?.id).toBe(owner.id);
    // proyeksi whitelist: id internal koneksi & daftar Data Usaha terdampak TIDAK ikut walau tersimpan di audit_logs
    const disc = mine.find((i) => i.action === "disconnect_accurate")!;
    expect(disc.changes).toEqual({ previousAccurateDbAlias: "PT X", reason: { code: "salah_database", note: null } });
    expect(JSON.stringify(mine.map((i) => i.changes))).not.toMatch(/ConnectionId|affectedDataUsahaIds/);
    expect(mine.find((i) => i.action === "disconnect_accurate")!.actor?.id).toBe(adminUser.id);
    // ringkasan (delta): byAction, DU dengan koreksi (du: reset; du2: 2x disconnect) = +2, pemilik +2, berulang +1 (du2)
    const byAction = (k: string) => (after.summary.byAction[k] ?? 0) - (before.summary.byAction[k] ?? 0);
    expect({ connect: byAction("connect_accurate"), select: byAction("select_database"), reset: byAction("reset_database"), disconnect: byAction("disconnect_accurate") }).toEqual({ connect: 1, select: 2, reset: 1, disconnect: 2 });
    expect(after.summary.dataUsahaWithCorrection - before.summary.dataUsahaWithCorrection).toBe(2);
    expect(after.summary.ownersWithCorrection - before.summary.ownersWithCorrection).toBe(2);
    expect(after.summary.repeatedCorrection - before.summary.repeatedCorrection).toBe(1);
  });

  test("filter koreksi (reset/putus saja), pencarian (nama Data Usaha/pemilik), dan paginasi", async () => {
    const admin = await loginAs(app, "admin");
    const tag = `filt${runId}`;
    const owner = await insertAccount(`${tag}-a`, { companyName: `PT ${tag} Unik` });
    const du = await insertDataUsaha(owner.id, `${tag} DU`);
    await insertDataUsahaEventRow(du, "connect_accurate", owner.id, {}, wib(2019, 5, 11));
    await insertDataUsahaEventRow(du, "reset_database", owner.id, {}, wib(2019, 5, 12));
    await insertDataUsahaEventRow(du, "disconnect_accurate", owner.id, {}, wib(2019, 5, 13));

    const koreksi = await report(admin.cookie, `&kind=koreksi&q=${tag}`);
    expect(koreksi.items.map((i) => i.action)).toEqual(["disconnect_accurate", "reset_database"]);
    expect(koreksi.total).toBe(2);
    const byOwner = await report(admin.cookie, `&q=${encodeURIComponent(`PT ${tag} Unik`)}`);
    expect(byOwner.total).toBe(3);
    const page2 = await json<Report>(await get(admin.cookie, `/connection-history?${win}&q=${tag}&pageSize=2&page=1`));
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);
  });

  test("tanpa rentang tanggal → semua waktu; rentang setengah (hanya from) atau tidak valid → 422; kind tidak dikenal → 422", async () => {
    const admin = await loginAs(app, "admin");
    expect((await get(admin.cookie, "/connection-history?pageSize=5")).status).toBe(200);
    expect((await get(admin.cookie, "/connection-history?from=2019-05-01")).status).toBe(422);
    expect((await get(admin.cookie, "/connection-history?from=2019-05-31&to=2019-05-01")).status).toBe(422);
    expect((await get(admin.cookie, "/connection-history?kind=lain")).status).toBe(422);
  });
});

describe("GET /export/:report (CSV, D5)", () => {
  const csvLines = (text: string) => text.replace(/\r\n$/, "").split("\r\n");

  test("customers: BOM UTF-8, header Indonesia, CRLF, sel berawalan = + - @ dinetralkan, telepon format lokal, header unduhan + jumlah baris; q membatasi; audit ekspor tercatat", async () => {
    const admin = await loginAs(app, "admin");
    const tag = `csv${runId}`;
    await insertAccount(`${tag}-a`, { name: `=HYPERLINK("http://x")`, companyName: "+PT Aneh", phone: "+6281234567890", whatsapp: "+6281234567891" });
    await insertAccount(`${tag}-b`, { name: "Budi Biasa", companyName: "PT Biasa" });
    const res = await get(admin.cookie, `/export/customers?q=${tag}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="facport-customers-\d{8}\.csv"$/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-export-rows")).toBe("2");
    expect(res.headers.get("x-export-truncated")).toBe("false");
    const text = await res.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = csvLines(text.slice(1));
    expect(lines).toHaveLength(3); // header + 2 baris
    expect(lines[0]).toBe("Nama,Email,Perusahaan,Telepon,WhatsApp,Tipe,Jenis akun,Nonaktif,Data Usaha,Terhubung Accurate,Fitur aktif,Berakhir terdekat,Terdaftar");
    const evil = lines.find((l) => l.includes("HYPERLINK"))!;
    expect(evil.startsWith(`"'=HYPERLINK(""http://x"")",`)).toBe(true); // rumus dinetralkan
    expect(evil).toContain(",'+PT Aneh,"); // perusahaan berawalan +
    expect(evil).toContain(",081234567890,081234567891,"); // telepon lokal, tanpa apostrof
    expect(evil).toContain(",Komersil,Belum punya Data Usaha,Tidak,0,0,");

    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "insight_export"), eq(auditLogs.actorId, admin.id))).orderBy(desc(auditLogs.createdAt)).limit(1);
    expect(log).toMatchObject({ action: "export", entityId: "customers" });
    // filter pencarian mentah (bisa berisi email/nama) TIDAK disimpan di audit — hanya penanda dan panjangnya
    expect(log!.changes).toMatchObject({ report: "customers", rows: 2, truncated: false, filters: { hasQ: true, qLength: tag.length } });
    expect(JSON.stringify(log!.changes)).not.toContain(tag);
  });

  test("Admin (staff) boleh; fitur/baru/akan berakhir/riwayat/tren menghasilkan CSV dengan header khas", async () => {
    const staff = await loginAs(app, "staff");
    const header = async (path: string) => {
      const res = await get(staff.cookie, path);
      expect(res.status).toBe(200);
      return csvLines((await res.text()).slice(1))[0]!;
    };
    expect(await header("/export/feature-users?moduleKey=other_deposit")).toBe("Fitur,Nama,Email,Perusahaan,Telepon,WhatsApp,Data Usaha,Paket,Mulai,Berakhir,Perpanjangan terjadwal");
    expect(await header("/export/new?from=2020-03-01&to=2020-03-31")).toBe("Nama,Email,Perusahaan,Telepon,WhatsApp,Pelanggan baru,Mulai pertama,Fitur,Data Usaha,Mulai,Berakhir");
    expect(await header("/export/expiring?window=30")).toBe("Nama,Email,Perusahaan,Telepon,WhatsApp,Fitur,Data Usaha,Berakhir,Sisa hari,Status tagihan perpanjangan,No. invoice,Jumlah tagihan");
    expect(await header("/export/connection-history?from=2019-05-01&to=2019-05-31")).toBe("Waktu,Data Usaha,Nama,Email,Perusahaan,Telepon,WhatsApp,Aksi,Keterangan,Pelaku");
    expect(await header("/export/trend?year=2023&metric=money")).toBe("Bulan,Nilai,Bulan sebelumnya,Selisih,Persen");
  });

  test("isi nyata: pemakai fitur memuat baris pelanggan uji; riwayat koneksi memuat kalimat peristiwa", async () => {
    const admin = await loginAs(app, "admin");
    const tag = `csvisi${runId}`;
    const owner = await insertAccount(`${tag}-pemilik`, { companyName: "PT Isi CSV" });
    const du = await insertDataUsaha(owner.id, `${tag} DU`);
    const plan = await insertPlan("receive_item");
    await insertSub({ ownerId: owner.id, dataUsahaId: du, planId: plan.id, start: new Date(Date.now() - DAY), end: new Date(Date.now() + 9 * DAY), renewalInterval: "yearly" });
    await insertDataUsahaEventRow(du, "reset_database", owner.id, { previousAlias: "PT Keliru" }, wib(2019, 5, 8));
    const fu = await (await get(admin.cookie, "/export/feature-users?moduleKey=receive_item")).text();
    const mine = csvLines(fu.slice(1)).find((l) => l.includes(`${tag} DU`))!;
    expect(mine.startsWith("Receive Item,")).toBe(true);
    expect(mine).toContain("PT Isi CSV");
    expect(mine.endsWith(",Tahunan")).toBe(true);
    const ch = await (await get(admin.cookie, `/export/connection-history?from=2019-05-01&to=2019-05-31&q=${tag}`)).text();
    expect(ch).toContain('Memilih database yang lain (sebelumnya ""PT Keliru"")');
  });

  test("parameter wajib per laporan: tanpa moduleKey/rentang/window/tahun → 422; modul tak dikenal 404; laporan tak dikenal 422; tanpa login 401, customer 403", async () => {
    const admin = await loginAs(app, "admin");
    const status = async (path: string) => (await get(admin.cookie, path)).status;
    expect(await status("/export/feature-users")).toBe(422);
    expect(await status("/export/feature-users?moduleKey=tidak_ada")).toBe(404);
    expect(await status("/export/new")).toBe(422);
    expect(await status("/export/new?from=2026-03-02&to=2026-03-01")).toBe(422);
    expect(await status("/export/expiring")).toBe(422);
    expect(await status("/export/trend")).toBe(422);
    expect(await status("/export/trend?year=2026")).toBe(422);
    expect(await status("/export/semua")).toBe(422);
    const customer = await loginAs(app, "customer");
    expect((await get(null, "/export/customers")).status).toBe(401);
    expect((await get(customer.cookie, "/export/customers")).status).toBe(403);
  });

  test("kuota ekspor PER AKUN (30/jam): akun yang sudah mencapai kuota ditolak 429 walau IP sama; akun lain tidak terpengaruh; ditolak tidak menambah audit", async () => {
    const busy = await loginAs(app, "admin", "busy");
    const other = await loginAs(app, "staff", "other");
    const now = Date.now();
    await db.insert(auditLogs).values(
      Array.from({ length: 30 }, (_, i) => ({ entityType: "insight_export", entityId: "customers", action: "export", changes: { seed: i }, actorId: busy.id, createdAt: new Date(now - 5 * 60 * 1000) })),
    );
    const blocked = await get(busy.cookie, "/export/trend?year=2023&metric=money");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "EXPORT_QUOTA_EXCEEDED" });
    expect((await get(other.cookie, "/export/trend?year=2023&metric=money")).status).toBe(200);
    const rows = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "insight_export"), eq(auditLogs.actorId, busy.id)));
    expect(rows).toHaveLength(30); // tidak bertambah

    // ekspor lama (>1 jam) tidak dihitung
    const old = await loginAs(app, "admin", "old");
    await db.insert(auditLogs).values(
      Array.from({ length: 30 }, (_, i) => ({ entityType: "insight_export", entityId: "customers", action: "export", changes: { seed: i }, actorId: old.id, createdAt: new Date(now - 2 * 60 * 60 * 1000) })),
    );
    expect((await get(old.cookie, "/export/trend?year=2023&metric=money")).status).toBe(200);
  });
});
