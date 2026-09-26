import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { dataUsaha, memberSeats, user as userTable } from "../db/schema";
import { hasAccessToDataUsaha, addCumulativeSuccessfulRows } from "./data-usaha";
import { createTestDataUsaha, createTestSeat } from "./test-fixtures";

// § Fase 113, security review — `hasAccessToDataUsaha` dibuat SPESIFIK
// untuk menutup celah yang tidak tertutup filter `userId` biasa: kolom
// `userId` di tabel lain (`importBatches`, `accurateConnections`) DIBEKUKAN
// ke pelaku asli, TIDAK ikut berubah saat kepemilikan Data Usaha
// ditransfer atau seat di-revoke. Test ini fokus ke skenario itu — bukan
// cuma "user tidak berkaitan sama sekali" (sudah dites tidak langsung di
// level route lain).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Data Usaha Access Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

describe("hasAccessToDataUsaha", () => {
  test("true untuk pemilik SEKARANG", async () => {
    const ownerId = await signUp(`du-access-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    expect(await hasAccessToDataUsaha(ownerId, dataUsahaId)).toBe(true);
  });

  test("true untuk member seat AKTIF sekarang", async () => {
    const ownerId = await signUp(`du-access-seatowner-${runId}@test.local`);
    const memberId = await signUp(`du-access-member-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const seatId = await createTestSeat(ownerId, dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    expect(await hasAccessToDataUsaha(memberId, dataUsahaId)).toBe(true);
  });

  test("false untuk user yang TIDAK PERNAH berkaitan sama sekali", async () => {
    const ownerId = await signUp(`du-access-unrelated-owner-${runId}@test.local`);
    const strangerId = await signUp(`du-access-unrelated-stranger-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);

    expect(await hasAccessToDataUsaha(strangerId, dataUsahaId)).toBe(false);
  });

  // § skenario UTAMA temuan security review: seat pernah aktif, lalu
  // di-revoke (status bukan "active" lagi) — kolom histori lain
  // (mis. `importBatches.userId`) tetap menunjuk ke member ini, tapi dia
  // TIDAK BOLEH lagi dianggap "berhak akses" Data Usaha itu.
  test("false untuk member seat yang SUDAH di-revoke", async () => {
    const ownerId = await signUp(`du-access-revoked-owner-${runId}@test.local`);
    const memberId = await signUp(`du-access-revoked-member-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const seatId = await createTestSeat(ownerId, dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));
    await db.update(memberSeats).set({ status: "revoked" }).where(eq(memberSeats.id, seatId));

    expect(await hasAccessToDataUsaha(memberId, dataUsahaId)).toBe(false);
  });

  // § skenario UTAMA lain: mantan pemilik SETELAH transfer kepemilikan
  // (`dataUsaha.userId` sudah pindah ke pemilik baru) — mantan pemilik
  // TIDAK BOLEH lagi dianggap berhak, meski dia yang dulu bikin baris
  // histori di tabel lain.
  test("false untuk mantan pemilik SETELAH kepemilikan Data Usaha ditransfer", async () => {
    const formerOwnerId = await signUp(`du-access-former-owner-${runId}@test.local`);
    const newOwnerId = await signUp(`du-access-new-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(formerOwnerId);

    // § simulasi hasil `executeOwnershipTransfer` (lib/ownership-transfer.ts)
    // — cuma `dataUsaha.userId` yang berubah.
    await db.update(dataUsaha).set({ userId: newOwnerId }).where(eq(dataUsaha.id, dataUsahaId));

    expect(await hasAccessToDataUsaha(formerOwnerId, dataUsahaId)).toBe(false);
    expect(await hasAccessToDataUsaha(newOwnerId, dataUsahaId)).toBe(true);
  });
});

// § diminta user 2026-09-27 — counter PERMANEN "efisiensi waktu kerja"
// (§ komentar kolom `data_usaha.cumulativeSuccessfulRowCount`), dipanggil
// dari `workers/index.ts` (increment di `IMPORT_TO_ACCURATE`, decrement di
// `CANCEL_IMPORT`) TIDAK di-mock/di-integration-test di sini (butuh koneksi
// Accurate nyata/mock berat, di luar scope) — test ini kunci PERILAKU
// FUNGSI ATOMIKNYA sendiri, terpisah dari logic delta di worker.
describe("addCumulativeSuccessfulRows", () => {
  test("delta positif menambah counter", async () => {
    const ownerId = await signUp(`du-cumulative-add-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);

    await addCumulativeSuccessfulRows(dataUsahaId, 5);
    const [row] = await db.select({ n: dataUsaha.cumulativeSuccessfulRowCount }).from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(row?.n).toBe(5);

    // § dipanggil lagi (simulasi batch KEDUA sukses) — AKUMULASI, bukan menimpa.
    await addCumulativeSuccessfulRows(dataUsahaId, 3);
    const [row2] = await db.select({ n: dataUsaha.cumulativeSuccessfulRowCount }).from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(row2?.n).toBe(8);
  });

  test("delta negatif mengurangi counter (simulasi Batal Import)", async () => {
    const ownerId = await signUp(`du-cumulative-sub-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    await addCumulativeSuccessfulRows(dataUsahaId, 10);

    await addCumulativeSuccessfulRows(dataUsahaId, -4);
    const [row] = await db.select({ n: dataUsaha.cumulativeSuccessfulRowCount }).from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(row?.n).toBe(6);
  });

  // § defensif — counter TIDAK BOLEH negatif walau ada skenario tak
  // terduga (mis. urutan job aneh) yang bikin decrement lebih besar dari
  // yang pernah di-increment.
  test("tidak pernah turun di bawah 0 walau delta negatif lebih besar dari nilai saat ini", async () => {
    const ownerId = await signUp(`du-cumulative-floor-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    await addCumulativeSuccessfulRows(dataUsahaId, 2);

    await addCumulativeSuccessfulRows(dataUsahaId, -100);
    const [row] = await db.select({ n: dataUsaha.cumulativeSuccessfulRowCount }).from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(row?.n).toBe(0);
  });

  test("delta 0 tidak melakukan apa-apa (no-op, tidak menyentuh DB)", async () => {
    const ownerId = await signUp(`du-cumulative-noop-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    await addCumulativeSuccessfulRows(dataUsahaId, 7);

    await addCumulativeSuccessfulRows(dataUsahaId, 0);
    const [row] = await db.select({ n: dataUsaha.cumulativeSuccessfulRowCount }).from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(row?.n).toBe(7);
  });
});
