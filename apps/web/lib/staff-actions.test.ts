import { describe, test, expect } from "bun:test";
import { otherTier, staffRoleError, staffResetError, TIER_LABEL } from "./staff-actions";

describe("staff-actions", () => {
  test("otherTier membalik admin ↔ staff, selain itu null", () => {
    expect(otherTier("admin")).toBe("staff");
    expect(otherTier("staff")).toBe("admin");
    expect(otherTier("customer")).toBeNull();
    expect(otherTier("")).toBeNull();
  });
  test("label tingkat: admin = Super Admin, staff = Admin", () => {
    expect(TIER_LABEL.admin).toBe("Super Admin");
    expect(TIER_LABEL.staff).toBe("Admin");
  });
  test("pesan galat dipetakan per kode; kode tak dikenal → pesan umum", () => {
    expect(staffRoleError("CANNOT_REMOVE_LAST_SUPER_ADMIN")).toMatch(/terakhir/);
    expect(staffRoleError("CONFIRM_MISMATCH")).toMatch(/tidak cocok/);
    expect(staffRoleError("???")).toMatch(/Gagal mengubah role/);
    expect(staffRoleError(undefined)).toMatch(/Gagal mengubah role/);
    expect(staffResetError("NO_PASSWORD_LOGIN")).toMatch(/Google/);
    expect(staffResetError("CANNOT_RESET_OWN_PASSWORD")).toMatch(/sendiri/);
    expect(staffResetError("???")).toMatch(/Gagal mereset/);
  });
});
