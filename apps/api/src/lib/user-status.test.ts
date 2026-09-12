import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable } from "../db/schema";
import { isDisabled } from "./user-status";

// § Fase 106 — `isDisabled()` diekstrak dari `permission.ts` ke sini
// (dipakai juga `lib/auth.ts`). Test dipindah dari cakupan implisit
// `permission.test.ts` (kalau ada) ke sini, mengikuti lokasi fungsinya.
const runId = Date.now();

describe("isDisabled", () => {
  test("true kalau user.disabled = true", async () => {
    const [row] = await db
      .insert(userTable)
      .values({
        id: randomUUID(),
        email: `disabled-status-${runId}@test.local`,
        name: "Disabled",
        emailVerified: true,
        disabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    expect(await isDisabled(row!.id)).toBe(true);
  });

  test("false kalau user.disabled = false", async () => {
    const [row] = await db
      .insert(userTable)
      .values({
        id: randomUUID(),
        email: `enabled-status-${runId}@test.local`,
        name: "Enabled",
        emailVerified: true,
        disabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    expect(await isDisabled(row!.id)).toBe(false);
  });

  test("false kalau userId tidak ditemukan (bukan throw)", async () => {
    expect(await isDisabled(randomUUID())).toBe(false);
  });
});
