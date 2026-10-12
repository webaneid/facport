import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { and, eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { adminInternalGrantsRoute } from "./internal-grants.route";
import { adminUsersRoute } from "./users.route";
import { adminUserRolesRoute } from "./user-roles.route";
import { adminDataUsahaRoute } from "./data-usaha.route";
import { adminSubscriptionsRoute } from "./subscriptions.route";
import { adminUserErasureRoute } from "./user-erasure.route";
import { auditLogs, dataUsaha, plans, roles, subscriptions, userRoles } from "../../db/schema";
import { getOwnedSubscriptionsWithPlans } from "../../lib/subscription-gate";
import { insertAccount, insertDataUsaha, insertPlan, insertSub, loginAs } from "./insights.fixtures";
import { resolveGrantModules } from "../../lib/internal-grants";
import { COUNTED_SUBSCRIPTION } from "../../lib/insights-data";
import { sql } from "drizzle-orm";

// § Fase 191, D9 Lapis 2 — hibah akses internal tanpa tanggal akhir: hanya akun internal, hanya Data Usaha miliknya, `end_at` NULL + penanda, tanpa order, audit, idempoten,
// gerbang akses terbuka, dan dicabut otomatis saat akun kembali komersil (aksi massal internal & aksi peran).
const app = new Elysia().mount(auth.handler).use(adminInternalGrantsRoute).use(adminUsersRoute).use(adminUserRolesRoute).use(adminDataUsahaRoute).use(adminSubscriptionsRoute).use(adminUserErasureRoute);
const post = (cookie: string | null, path: string, body: unknown) =>
  app.handle(new Request(`http://localhost/admin/users${path}`, { method: "POST", headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const KEYS = ["purchase_invoice", "sales_invoice"];

async function setup(opts: { internal?: boolean } = {}) {
  const owner = await insertAccount("grant", { isInternal: opts.internal ?? true });
  const duId = await insertDataUsaha(owner.id, "DU Internal");
  for (const key of KEYS) await insertPlan(key, { price: 1 });
  return { owner, duId };
}
const subsOf = (dataUsahaId: string) => db.select().from(subscriptions).where(eq(subscriptions.dataUsahaId, dataUsahaId));

describe("izin & validasi", () => {
  test("401 tanpa login, 403 untuk customer; pemilik KOMERSIL → 409 NOT_INTERNAL dan tidak ada langganan dibuat", async () => {
    const { owner, duId } = await setup({ internal: false });
    const admin = await loginAs(app as never, "admin");
    const customer = await loginAs(app as never, "customer");
    expect((await post(null, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS })).status).toBe(401);
    expect((await post(customer.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS })).status).toBe(403);
    const res = await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_INTERNAL");
    expect(await subsOf(duId)).toHaveLength(0);
  });
  test("Data Usaha milik akun lain → 404; modul tak dikenal → 422; daftar kosong → 422", async () => {
    const { owner } = await setup();
    const other = await insertAccount("other");
    const otherDu = await insertDataUsaha(other.id, "DU Lain");
    const admin = await loginAs(app as never, "admin");
    expect((await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: otherDu, moduleKeys: KEYS })).status).toBe(404);
    const own = await insertDataUsaha(owner.id, "DU Sendiri");
    expect((await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: own, moduleKeys: ["modul_ngawur"] })).status).toBe(422);
    expect((await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: own, moduleKeys: [] })).status).toBe(422);
  });
});

describe("hibah", () => {
  test("membuat langganan aktif TANPA tanggal akhir, bertanda hibah, tanpa order, paket aktif termurah, audit; gerbang akses terbuka; pratinjau tidak mengubah", async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    const prev = (await (await post(admin.cookie, `/${owner.id}/internal-grant/preview`, { dataUsahaId: duId, moduleKeys: KEYS })).json()) as { internal: boolean; modules: { key: string; status: string }[] };
    expect(prev.internal).toBe(true);
    expect(prev.modules.map((m) => m.status)).toEqual(["will_grant", "will_grant"]);
    expect(await subsOf(duId)).toHaveLength(0);

    const res = await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { granted: string[] }).granted.sort()).toEqual([...KEYS].sort());
    const rows = await subsOf(duId);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ status: "active", endAt: null, internalGrant: true, isTrial: false, renewalInterval: null, orderId: null, userId: owner.id });
      const [plan] = await db.select().from(plans).where(eq(plans.id, r.planId));
      expect(plan?.isActive && plan.kind === "module").toBe(true);
      const key = plan!.modules[0]!;
      expect(KEYS).toContain(key);
    }
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "subscription"), eq(auditLogs.entityId, rows[0]!.id)));
    expect(logs[0]?.changes).toMatchObject({ internalGrant: true, endAt: null });
    expect(logs[0]?.actorId).toBe(admin.id);
    const gate = await getOwnedSubscriptionsWithPlans(owner.id);
    expect(gate.map((g) => g.plan.modules[0]).sort()).toEqual([...KEYS].sort());
  });

  test("idempoten: hibah aktif yang sudah ada dilewati; langganan aktif lain modul yang sama diganti (dibatalkan)", async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    const plan = await insertPlan("purchase_invoice", { price: 500_000 });
    const old = await insertSub({ ownerId: owner.id, dataUsahaId: duId, planId: plan.id, start: new Date(), end: new Date(Date.now() + 86_400_000) });
    const first = (await (await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: ["purchase_invoice"] })).json()) as { granted: string[] };
    expect(first.granted).toEqual(["purchase_invoice"]);
    const [oldAfter] = await db.select().from(subscriptions).where(eq(subscriptions.id, old.id));
    expect(oldAfter?.status).toBe("cancelled");
    const second = (await (await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: ["purchase_invoice"] })).json()) as { granted: string[]; alreadyGranted: string[] };
    expect(second).toMatchObject({ granted: [], alreadyGranted: ["purchase_invoice"] });
    expect((await subsOf(duId)).filter((s) => s.status === "active")).toHaveLength(1);
  });

  test('"all": semua modul yang punya paket aktif; yang tidak punya paket dilewati (skippedNoPlan), tidak gagal', async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    const res = (await (await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: "all" })).json()) as { granted: string[]; skippedNoPlan: string[] };
    expect(res.granted.length).toBeGreaterThanOrEqual(2);
    expect(res.granted.length + res.skippedNoPlan.length).toBe(resolveGrantModules("all")!.length);
    for (const s of await subsOf(duId)) expect(s.endAt).toBeNull();
  });

  test("cabut: status cancelled + end_at diisi; audit; hanya Data Usaha yang diminta", async () => {
    const { owner, duId } = await setup();
    const du2 = await insertDataUsaha(owner.id, "DU Kedua");
    const admin = await loginAs(app as never, "admin");
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: du2, moduleKeys: ["purchase_invoice"] });
    const res = (await (await post(admin.cookie, `/${owner.id}/internal-grant/revoke`, { dataUsahaId: duId })).json()) as { revoked: number };
    expect(res.revoked).toBe(2);
    for (const s of await subsOf(duId)) expect(s).toMatchObject({ status: "cancelled" });
    expect((await subsOf(du2)).every((s) => s.status === "active")).toBe(true);
  });
});

describe("pencabutan otomatis saat kembali komersil", () => {
  test("cabut tanda internal (aksi massal) mencabut hibah; pratinjau menampilkan jumlahnya", async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    const prev = (await (await post(admin.cookie, "/internal/preview", { userIds: [owner.id], isInternal: false })).json()) as { impact: { activeInternalGrants: number } };
    expect(prev.impact.activeInternalGrants).toBe(2);
    expect((await post(admin.cookie, "/internal", { userIds: [owner.id], isInternal: false })).status).toBe(200);
    for (const s of await subsOf(duId)) expect(s.status).toBe("cancelled");
  });

  test("cabut role admin/staf (aksi peran) pada akun customer+staf mencabut hibah", async () => {
    const owner = await insertAccount("rolegrant", { isInternal: false });
    const [staff] = await db.select().from(roles).where(eq(roles.name, "staff"));
    await db.insert(userRoles).values({ userId: owner.id, roleId: staff!.id });
    const duId = await insertDataUsaha(owner.id, "DU Role");
    for (const key of KEYS) await insertPlan(key, { price: 1 });
    const admin = await loginAs(app as never, "admin");
    expect((await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS })).status).toBe(200);
    expect((await post(admin.cookie, `/${owner.id}/roles`, { action: "revoke_staff", confirm: owner.email })).status).toBe(200);
    for (const s of await subsOf(duId)) expect(s.status).toBe("cancelled");
  });

  test("akun yang tetap internal karena role tidak kehilangan hibah saat flag dicabut", async () => {
    const owner = await insertAccount("keep", { isInternal: true });
    const [staff] = await db.select().from(roles).where(eq(roles.name, "staff"));
    await db.insert(userRoles).values({ userId: owner.id, roleId: staff!.id });
    const duId = await insertDataUsaha(owner.id, "DU Keep");
    for (const key of KEYS) await insertPlan(key, { price: 1 });
    const admin = await loginAs(app as never, "admin");
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    await post(admin.cookie, "/internal", { userIds: [owner.id], isInternal: false });
    expect((await subsOf(duId)).every((s) => s.status === "active")).toBe(true);
  });
});

const raw = (cookie: string, method: string, path: string, body: unknown) =>
  app.handle(new Request(`http://localhost${path}`, { method, headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("audit Fase 191 — perpindahan pemilik & jalur lain", () => {
  test("transfer admin ke akun KOMERSIL mencabut hibah; gerbang tidak meloloskan; ke akun INTERNAL hibah tetap dan bisa dicabut oleh pemilik baru", async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    const commercial = await insertAccount("klien", { isInternal: false });
    const res = await raw(admin.cookie, "POST", `/admin/data-usaha/${duId}/transfer-ownership`, { toUserId: commercial.id });
    expect(res.status).toBe(200);
    for (const s of await subsOf(duId)) expect(s.status).toBe("cancelled");
    expect(await getOwnedSubscriptionsWithPlans(commercial.id)).toHaveLength(0);

    const { owner: o2, duId: du2 } = await setup();
    await post(admin.cookie, `/${o2.id}/internal-grant`, { dataUsahaId: du2, moduleKeys: KEYS });
    const colleague = await insertAccount("rekan", { isInternal: true });
    expect((await raw(admin.cookie, "POST", `/admin/data-usaha/${du2}/transfer-ownership`, { toUserId: colleague.id })).status).toBe(200);
    expect((await subsOf(du2)).every((s) => s.status === "active")).toBe(true);
    const revoked = (await (await post(admin.cookie, `/${colleague.id}/internal-grant/revoke`, { dataUsahaId: du2 })).json()) as { revoked: number };
    expect(revoked.revoked).toBe(2); // dicabut lewat PEMILIK SAAT INI walau subscriptions.user_id masih pemilik lama
  });

  test("pertahanan gerbang: hibah yatim (pemilik Data Usaha berpindah ke komersil tanpa pencabutan) tidak membuka akses", async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    expect(await getOwnedSubscriptionsWithPlans(owner.id)).toHaveLength(2);
    const commercial = await insertAccount("yatim", { isInternal: false });
    await db.update(dataUsaha).set({ userId: commercial.id }).where(eq(dataUsaha.id, duId)); // jalur tak terduga yang melewati kode transfer
    expect(await getOwnedSubscriptionsWithPlans(commercial.id)).toHaveLength(0);
  });

  test("Insight tidak menghitung hibah internal sebagai langganan komersil", async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    const rows = await db.select({ id: subscriptions.id }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(and(eq(subscriptions.dataUsahaId, duId), COUNTED_SUBSCRIPTION));
    expect(rows).toHaveLength(0);
    void sql;
  });

  test("PATCH tanggal akhir pada hibah ditolak (400 GRANT_NOT_EDITABLE); memberi hibah ke diri sendiri ditolak (400)", async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: ["purchase_invoice"] });
    const [grant] = await subsOf(duId);
    const res = await raw(admin.cookie, "PATCH", `/admin/subscriptions/${grant!.id}`, { endAt: new Date(Date.now() + 86_400_000 * 30).toISOString() });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("GRANT_NOT_EDITABLE");
    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, grant!.id));
    expect(after?.endAt).toBeNull();
    const self = await post(admin.cookie, `/${admin.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    expect(self.status).toBe(400);
    expect(((await self.json()) as { code: string }).code).toBe("CANNOT_GRANT_SELF");
  });

  test("anonimisasi akun internal mencabut hibahnya; penggantian langganan lain tercatat di audit per langganan", async () => {
    const { owner, duId } = await setup();
    const admin = await loginAs(app as never, "admin");
    const plan = await insertPlan("purchase_invoice", { price: 900_000 });
    const old = await insertSub({ ownerId: owner.id, dataUsahaId: duId, planId: plan.id, start: new Date(), end: new Date(Date.now() + 86_400_000) });
    await post(admin.cookie, `/${owner.id}/internal-grant`, { dataUsahaId: duId, moduleKeys: KEYS });
    const replacedLog = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, old.id), eq(auditLogs.action, "update")));
    expect(replacedLog[0]?.changes).toMatchObject({ replacedByInternalGrant: true, dataUsahaId: duId });
    const res = await raw(admin.cookie, "POST", "/admin/users/erase", { kind: "anonymize", userIds: [owner.id], confirm: "ANONIMKAN", reason: "uji" });
    expect(res.status).toBe(200);
    expect((await subsOf(duId)).filter((s) => s.internalGrant).every((s) => s.status === "cancelled")).toBe(true);
  });
});
