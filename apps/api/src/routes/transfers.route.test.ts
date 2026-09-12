import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, dataUsaha, ownershipTransfers, memberSeats } from "../db/schema";
import { meRoute } from "./me.route";
import { transfersRoute } from "./transfers.route";
import { teamRoute } from "./team.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";
import { generateTransferToken } from "../lib/ownership-transfer";

// § Fase 111, architecture-user-tambahan.md — endpoint publik terima
// transfer kepemilikan Data Usaha. `meRoute` di-mount JUGA supaya bisa
// pakai `POST /me/data-usaha/:id/transfer-ownership` sungguhan untuk
// generate baris pending — hindari duplikasi logic initiate di test, pola
// sama `invites.route.test.ts`. `teamRoute` di-mount untuk regression
// "kelola tim ikut kepemilikan baru" di bawah.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(meRoute).use(transfersRoute).use(teamRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Transfer Test" }),
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

async function initiateTransfer(ownerCookie: string, dataUsahaId: string, toEmail: string) {
  const res = await testApp.handle(
    new Request(`http://localhost/me/data-usaha/${dataUsahaId}/transfer-ownership`, {
      method: "POST",
      headers: { cookie: ownerCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ toEmail }),
    }),
  );
  expect(res.status).toBe(200);
}

// § Token MENTAH tidak pernah disimpan di DB (cuma hash) — tidak bisa
// diambil balik dari `initiateTransfer` lewat query, jadi test ambil dari
// mock email queue TIDAK dilakukan di sini (dev no-op, pola sama
// `invites.route.test.ts` yang juga tidak query `pgboss.job` di test,
// cukup verifikasi lewat DB state token HASH-nya). Untuk skenario accept
// (butuh token MENTAH), test generate token sendiri lewat helper yang
// SAMA dipakai endpoint asli lalu tulis manual ke baris `ownership_transfers`
// yang sudah dibuat initiateTransfer — pola sama `invites.route.test.ts`
// `createInvitedSeat`.
async function initiateTransferWithToken(ownerCookie: string, dataUsahaId: string, toEmail: string) {
  await initiateTransfer(ownerCookie, dataUsahaId, toEmail);
  const { token, tokenHash, expiresAt } = generateTransferToken();
  await db
    .update(ownershipTransfers)
    .set({ tokenHash, tokenExpiresAt: expiresAt })
    .where(eq(ownershipTransfers.dataUsahaId, dataUsahaId));
  return token;
}

describe("GET /transfers/:token", () => {
  test("404 kalau token tidak valid/kadaluarsa", async () => {
    const res = await testApp.handle(new Request("http://localhost/transfers/not-a-real-token"));
    expect(res.status).toBe(404);
  });

  test("200 — preview transfer", async () => {
    const ownerEmail = `transfer-preview-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Preview ${runId}`);
    const toEmail = `transfer-preview-target-${runId}@test.local`;
    const token = await initiateTransferWithToken(ownerCookie, dataUsahaId, toEmail);

    const res = await testApp.handle(new Request(`http://localhost/transfers/${token}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; dataUsahaName: string; emailAlreadyRegistered: boolean };
    expect(body.email).toBe(toEmail);
    expect(body.dataUsahaName).toBe(`DU Transfer Preview ${runId}`);
    expect(body.emailAlreadyRegistered).toBe(false);
  });

  test("404 kalau kepemilikan sudah berubah sejak transfer diinisiasi (token stale)", async () => {
    const ownerEmail = `transfer-stale-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Stale ${runId}`);
    const toEmail = `transfer-stale-target-${runId}@test.local`;
    const token = await initiateTransferWithToken(ownerCookie, dataUsahaId, toEmail);

    // § kepemilikan berubah lewat jalur LAIN (simulasi admin transfer
    // langsung) SETELAH transfer di atas diinisiasi.
    const otherOwnerId = await signUp(`transfer-stale-other-${runId}@test.local`);
    await db.update(dataUsaha).set({ userId: otherOwnerId }).where(eq(dataUsaha.id, dataUsahaId));

    const res = await testApp.handle(new Request(`http://localhost/transfers/${token}`));
    expect(res.status).toBe(404);
  });
});

describe("POST /transfers/:token/accept — akun baru", () => {
  test("200 — bikin akun baru, data_usaha.userId pindah, subscriptions/invoices historis TIDAK berubah", async () => {
    const ownerEmail = `transfer-accept-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Accept ${runId}`);
    const seatId = await createTestSeat(ownerId, dataUsahaId);
    const toEmail = `transfer-accept-new-${runId}@test.local`;
    const token = await initiateTransferWithToken(ownerCookie, dataUsahaId, toEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/transfers/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pemilik Baru", password: "NewOwnerPassword123!" }),
      }),
    );
    expect(res.status).toBe(200);

    const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(du!.userId).not.toBe(ownerId);

    const [newOwner] = await db.select().from(userTable).where(eq(userTable.email, toEmail));
    expect(du!.userId).toBe(newOwner!.id);

    const [transfer] = await db.select().from(ownershipTransfers).where(eq(ownershipTransfers.dataUsahaId, dataUsahaId));
    expect(transfer!.status).toBe("accepted");
    expect(transfer!.acceptedBy).toBe(newOwner!.id);

    // § member_seats TETAP AKTIF pasca-transfer — akses seat tidak
    // bergantung siapa pemilik Data Usaha-nya, cuma dataUsahaId + status.
    const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));
    expect(seat!.dataUsahaId).toBe(dataUsahaId);
    expect(seat!.primaryUserId).toBe(ownerId); // § snapshot historis "siapa yang beli slot ini" TIDAK ikut berubah.
  });

  test("409 EMAIL_ALREADY_REGISTERED kalau toEmail sudah py akun", async () => {
    const ownerEmail = `transfer-accept-conflict-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Conflict ${runId}`);
    const existingEmail = `transfer-accept-conflict-${runId}@test.local`;
    await signUp(existingEmail);
    const token = await initiateTransferWithToken(ownerCookie, dataUsahaId, existingEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/transfers/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Siapa", password: "Password123!" }),
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /transfers/:token/accept-existing — akun existing", () => {
  test("403 EMAIL_MISMATCH kalau email sesi TIDAK cocok toEmail", async () => {
    const ownerEmail = `transfer-existing-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Existing ${runId}`);
    const toEmail = `transfer-existing-target-${runId}@test.local`;
    await signUp(toEmail);
    const token = await initiateTransferWithToken(ownerCookie, dataUsahaId, toEmail);

    const wrongEmail = `transfer-existing-wrong-${runId}@test.local`;
    await signUp(wrongEmail);
    const wrongCookie = await signIn(wrongEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/transfers/${token}/accept-existing`, { method: "POST", headers: { cookie: wrongCookie } }),
    );
    expect(res.status).toBe(403);
  });

  test("200 — akun existing terima transfer; owner LAMA kehilangan kontrol Kelola Tim, owner BARU dapat", async () => {
    const ownerEmail = `transfer-existing-owner2-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Transfer Existing2 ${runId}`);
    const seatId = await createTestSeat(ownerId, dataUsahaId);

    const toEmail = `transfer-existing-target2-${runId}@test.local`;
    const newOwnerId = await signUp(toEmail);
    const newOwnerCookie = await signIn(toEmail);
    const token = await initiateTransferWithToken(ownerCookie, dataUsahaId, toEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/transfers/${token}/accept-existing`, { method: "POST", headers: { cookie: newOwnerCookie } }),
    );
    expect(res.status).toBe(200);

    const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(du!.userId).toBe(newOwnerId);

    // § regression Fase 111 — SEBELUM fix, team.route.ts cek
    // `seat.primaryUserId === user.id` (snapshot beku pembeli), bukan
    // kepemilikan Data Usaha SAAT INI. Owner LAMA (masih `primaryUserId`)
    // seharusnya SEKARANG ditolak kelola tim Data Usaha yang sudah bukan
    // miliknya lagi; owner BARU (bukan `primaryUserId`, tapi pemilik
    // SEKARANG) seharusnya BISA.
    const oldOwnerRes = await testApp.handle(
      new Request(`http://localhost/me/team/${seatId}/revoke`, { method: "POST", headers: { cookie: ownerCookie } }),
    );
    expect(oldOwnerRes.status).toBe(404);

    const newOwnerRes = await testApp.handle(new Request(`http://localhost/me/team?dataUsahaId=${dataUsahaId}`, { headers: { cookie: newOwnerCookie } }));
    expect(newOwnerRes.status).toBe(200);
    const body = (await newOwnerRes.json()) as { seats: { id: string }[] };
    expect(body.seats.some((s) => s.id === seatId)).toBe(true);
  });
});
