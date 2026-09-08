import { describe, test, expect } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, roles, userRoles } from "../db/schema";
import { assignCustomerRole } from "./assign-customer-role";

// § Fase 62 — dites LANGSUNG (bukan lewat HTTP/OAuth flow sungguhan,
// tidak praktis mock provider Google) karena diekstrak jadi fungsi
// murni terpisah dari `databaseHooks.user.create.after` (lib/auth.ts).
const runId = Date.now();

async function makeUser() {
  const [u] = await db
    .insert(userTable)
    .values({
      id: `assign-role-test-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      email: `assign-role-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: "Assign Role Test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return u!.id;
}

describe("assignCustomerRole", () => {
  test("assign role customer ke user yang belum punya role apa pun", async () => {
    const userId = await makeUser();
    await assignCustomerRole(userId);

    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    const [assigned] = await db.select().from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, customerRole!.id)));
    expect(assigned).toBeTruthy();
  });

  test("idempotent — panggil 2x TIDAK error, tidak bikin baris duplikat", async () => {
    const userId = await makeUser();
    await assignCustomerRole(userId);
    await assignCustomerRole(userId); // panggil ke-2, tidak boleh throw

    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    const rows = await db.select().from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, customerRole!.id)));
    expect(rows).toHaveLength(1);
  });
});
