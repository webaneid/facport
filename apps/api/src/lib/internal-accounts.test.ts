import { describe, test, expect } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { roles, userRoles, user as userTable } from "../db/schema";
import {
  InternalAccountBillingError,
  assertBillable,
  commercialCustomerIdsSubquery,
  deriveInternalReason,
  getInternalReason,
  internalUserIdsSubquery,
} from "./internal-accounts";

// § Fase 189G, ADR-0044 — internal = flag `is_internal` ATAU role admin/staff (D16); komersil = akun role customer yang bukan internal.
const runId = Date.now();
let seq = 0;

async function makeUser(opts: { isInternal?: boolean; roleNames: ("customer" | "admin" | "staff")[] }) {
  const id = `internal-acc-${runId}-${seq++}`;
  const now = new Date();
  await db.insert(userTable).values({ id, name: "Internal Acc Test", email: `${id}@test.local`, emailVerified: true, isInternal: opts.isInternal ?? false, createdAt: now, updatedAt: now });
  if (opts.roleNames.length) {
    const roleRows = await db.select().from(roles).where(inArray(roles.name, opts.roleNames));
    await db.insert(userRoles).values(roleRows.map((r) => ({ userId: id, roleId: r.id })));
  }
  return id;
}

describe("deriveInternalReason (murni)", () => {
  test("role admin/staff mengalahkan flag; flag saja; tidak keduanya", () => {
    expect(deriveInternalReason(false, ["customer"])).toBeNull();
    expect(deriveInternalReason(true, ["customer"])).toBe("flag");
    expect(deriveInternalReason(false, ["admin"])).toBe("role");
    expect(deriveInternalReason(false, ["staff", "customer"])).toBe("role");
    expect(deriveInternalReason(true, ["admin"])).toBe("role");
    expect(deriveInternalReason(false, [])).toBeNull();
  });
});

describe("getInternalReason & subquery", () => {
  test("customer biasa = komersil; flag = internal(flag); admin/staff = internal(role); dual-role customer+admin = internal(role)", async () => {
    const plain = await makeUser({ roleNames: ["customer"] });
    const flagged = await makeUser({ isInternal: true, roleNames: ["customer"] });
    const admin = await makeUser({ roleNames: ["admin"] });
    const staff = await makeUser({ roleNames: ["staff"] });
    const dual = await makeUser({ roleNames: ["customer", "admin"] });

    expect(await getInternalReason(plain)).toBeNull();
    expect(await getInternalReason(flagged)).toBe("flag");
    expect(await getInternalReason(admin)).toBe("role");
    expect(await getInternalReason(staff)).toBe("role");
    expect(await getInternalReason(dual)).toBe("role");
    expect(await getInternalReason("tidak-ada")).toBeNull();

    const all = [plain, flagged, admin, staff, dual];
    const internalIds = (await db.select({ id: userTable.id }).from(userTable).where(inArray(userTable.id, internalUserIdsSubquery()))).map((r) => r.id);
    for (const id of [flagged, admin, staff, dual]) expect(internalIds).toContain(id);
    expect(internalIds).not.toContain(plain);

    // komersil = role customer DAN bukan internal: hanya `plain` dari kelima akun ini
    const commercialIds = (await db.select({ id: userTable.id }).from(userTable).where(inArray(userTable.id, commercialCustomerIdsSubquery()))).map((r) => r.id);
    expect(all.filter((id) => commercialIds.includes(id))).toEqual([plain]);
  });

  test("mencabut flag mengembalikan akun ke komersil (reversibel); role admin tetap internal walau flag dicabut", async () => {
    const id = await makeUser({ isInternal: true, roleNames: ["customer"] });
    expect(await getInternalReason(id)).toBe("flag");
    await db.update(userTable).set({ isInternal: false }).where(eq(userTable.id, id));
    expect(await getInternalReason(id)).toBeNull();

    const adminFlagged = await makeUser({ isInternal: true, roleNames: ["admin"] });
    await db.update(userTable).set({ isInternal: false }).where(eq(userTable.id, adminFlagged));
    expect(await getInternalReason(adminFlagged)).toBe("role");
  });
});

describe("assertBillable & InternalAccountBillingError", () => {
  test("akun komersil lolos; internal (flag/role) melempar InternalAccountBillingError 403", async () => {
    const plain = await makeUser({ roleNames: ["customer"] });
    await expect(assertBillable(db, plain)).resolves.toBeUndefined();
    const flagged = await makeUser({ isInternal: true, roleNames: ["customer"] });
    await expect(assertBillable(db, flagged)).rejects.toBeInstanceOf(InternalAccountBillingError);
    const admin = await makeUser({ roleNames: ["admin"] });
    await expect(assertBillable(db, admin)).rejects.toBeInstanceOf(InternalAccountBillingError);
  });

  test("error membawa status 403, kode stabil, dan respons JSON sendiri (aman di aplikasi tanpa .onError)", async () => {
    const err = new InternalAccountBillingError();
    expect(err.status).toBe(403);
    expect(err.code).toBe("INTERNAL_ACCOUNT_NO_BILLING");
    const res = err.toResponse();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "INTERNAL_ACCOUNT_NO_BILLING", message: err.message });
  });

  test("user tidak ada → tidak melempar (FK invoice yang menolak, bukan guard ini)", async () => {
    await expect(assertBillable(db, "tidak-ada")).resolves.toBeUndefined();
  });
});
