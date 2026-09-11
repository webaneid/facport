import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable, dataUsaha, ownershipTransfers } from "../db/schema";
import { generateTransferToken, linkGoogleSignupToPendingTransfer } from "./ownership-transfer";
import { createTestDataUsaha } from "./test-fixtures";

// § Fase 111 — jalur Google OAuth auto-complete transfer kepemilikan
// (`databaseHooks.user.create.after` di `lib/auth.ts` memanggil fungsi
// ini). Test LANGSUNG panggil fungsinya (bukan lewat HTTP OAuth callback
// asli — tidak bisa disimulasikan tanpa provider Google sungguhan), pola
// yang sama dipakai project ini untuk fungsi hook lain yang dipicu OAuth.
const runId = Date.now();

async function makeUser(email: string) {
  const now = new Date();
  const [row] = await db
    .insert(userTable)
    .values({ id: crypto.randomUUID(), email, name: "Transfer Google Test", emailVerified: true, createdAt: now, updatedAt: now })
    .returning();
  return row!.id;
}

async function makePendingTransfer(fromUserId: string, dataUsahaId: string, toEmail: string, overrides: { expiresAt?: Date } = {}) {
  const { tokenHash, expiresAt } = generateTransferToken();
  const [row] = await db
    .insert(ownershipTransfers)
    .values({ dataUsahaId, fromUserId, toEmail, tokenHash, tokenExpiresAt: overrides.expiresAt ?? expiresAt })
    .returning();
  return row!.id;
}

describe("linkGoogleSignupToPendingTransfer", () => {
  test("eksekusi transfer kalau ada baris pending dengan email cocok (case-insensitive)", async () => {
    const fromUserId = await makeUser(`og-transfer-from-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(fromUserId, `DU OG Transfer ${runId}`);
    const toEmail = `OG-Transfer-To-${runId}@test.local`;
    await makePendingTransfer(fromUserId, dataUsahaId, toEmail);

    const newUserId = await makeUser(toEmail.toLowerCase());
    await linkGoogleSignupToPendingTransfer(newUserId, toEmail.toLowerCase());

    const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(du!.userId).toBe(newUserId);
    const [transfer] = await db.select().from(ownershipTransfers).where(eq(ownershipTransfers.dataUsahaId, dataUsahaId));
    expect(transfer!.status).toBe("accepted");
  });

  test("TIDAK eksekusi kalau token sudah lewat expiry (celah yang sama dengan security review Fase 110, jangan berulang)", async () => {
    const fromUserId = await makeUser(`og-transfer-expired-from-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(fromUserId, `DU OG Expired ${runId}`);
    const toEmail = `og-transfer-expired-to-${runId}@test.local`;
    await makePendingTransfer(fromUserId, dataUsahaId, toEmail, { expiresAt: new Date(Date.now() - 1000) });

    const newUserId = await makeUser(toEmail);
    await linkGoogleSignupToPendingTransfer(newUserId, toEmail);

    const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(du!.userId).toBe(fromUserId);
  });

  test("TIDAK eksekusi kalau kepemilikan sudah berubah sejak transfer diinisiasi (stale)", async () => {
    const fromUserId = await makeUser(`og-transfer-stale-from-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(fromUserId, `DU OG Stale ${runId}`);
    const toEmail = `og-transfer-stale-to-${runId}@test.local`;
    await makePendingTransfer(fromUserId, dataUsahaId, toEmail);

    const otherOwnerId = await makeUser(`og-transfer-stale-other-${runId}@test.local`);
    await db.update(dataUsaha).set({ userId: otherOwnerId }).where(eq(dataUsaha.id, dataUsahaId));

    const newUserId = await makeUser(toEmail);
    await linkGoogleSignupToPendingTransfer(newUserId, toEmail);

    const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(du!.userId).toBe(otherOwnerId);
  });
});
