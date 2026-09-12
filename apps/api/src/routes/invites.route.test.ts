import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, memberSeats } from "../db/schema";
import { invitesRoute } from "./invites.route";
import { teamRoute } from "./team.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";
import { generateInviteToken } from "../lib/member-seats";

// § Fase 110, architecture-user-tambahan.md — endpoint publik terima
// undangan "User Tambahan". `teamRoute` di-mount JUGA (bukan cuma
// `invitesRoute`) supaya bisa pakai `POST /me/team/:seatId/invite`
// sungguhan untuk generate token — hindari duplikasi logic invite di test.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(teamRoute).use(invitesRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Invite Test" }),
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

async function createInvitedSeat(ownerId: string, invitedEmail: string) {
  const dataUsahaId = await createTestDataUsaha(ownerId);
  const seatId = await createTestSeat(ownerId, dataUsahaId);
  const { token, tokenHash, expiresAt } = generateInviteToken();
  await db
    .update(memberSeats)
    .set({ status: "invited", invitedEmail, inviteTokenHash: tokenHash, inviteTokenExpiresAt: expiresAt, invitedAt: new Date() })
    .where(eq(memberSeats.id, seatId));
  return { seatId, dataUsahaId, token };
}

describe("GET /invites/:token", () => {
  test("404 kalau token tidak valid/kadaluarsa", async () => {
    const res = await testApp.handle(new Request("http://localhost/invites/not-a-real-token"));
    expect(res.status).toBe(404);
  });

  test("200 — preview invite, emailAlreadyRegistered false utk email baru", async () => {
    const ownerId = await signUp(`invite-preview-owner-${runId}@test.local`);
    const invitedEmail = `invite-preview-new-${runId}@test.local`;
    const { token } = await createInvitedSeat(ownerId, invitedEmail);

    const res = await testApp.handle(new Request(`http://localhost/invites/${token}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; emailAlreadyRegistered: boolean };
    expect(body.email).toBe(invitedEmail);
    expect(body.emailAlreadyRegistered).toBe(false);
  });

  test("200 — emailAlreadyRegistered true kalau invitedEmail sudah py akun", async () => {
    const ownerId = await signUp(`invite-preview-owner2-${runId}@test.local`);
    const existingEmail = `invite-preview-existing-${runId}@test.local`;
    await signUp(existingEmail);
    const { token } = await createInvitedSeat(ownerId, existingEmail);

    const res = await testApp.handle(new Request(`http://localhost/invites/${token}`));
    const body = (await res.json()) as { emailAlreadyRegistered: boolean };
    expect(body.emailAlreadyRegistered).toBe(true);
  });
});

describe("POST /invites/:token/accept — akun baru", () => {
  test("200 — bikin akun baru, seat jadi active, role customer ter-assign", async () => {
    const ownerId = await signUp(`invite-accept-owner-${runId}@test.local`);
    const invitedEmail = `invite-accept-new-${runId}@test.local`;
    const { seatId, token } = await createInvitedSeat(ownerId, invitedEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Member Baru", password: "MemberPassword123!" }),
      }),
    );
    expect(res.status).toBe(200);

    const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));
    expect(seat!.status).toBe("active");
    expect(seat!.memberUserId).toBeTruthy();

    const [newUser] = await db.select().from(userTable).where(eq(userTable.id, seat!.memberUserId!));
    expect(newUser!.emailVerified).toBe(true);

    // § akun baru WAJIB bisa langsung login (password ter-set benar).
    const loginRes = await testApp.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invitedEmail, password: "MemberPassword123!" }),
      }),
    );
    expect(loginRes.status).toBe(200);
  });

  test("409 EMAIL_ALREADY_REGISTERED kalau invitedEmail sudah py akun", async () => {
    const ownerId = await signUp(`invite-accept-conflict-owner-${runId}@test.local`);
    const existingEmail = `invite-accept-conflict-${runId}@test.local`;
    await signUp(existingEmail);
    const { token } = await createInvitedSeat(ownerId, existingEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Siapa", password: "Password123!" }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  test("404 kalau token sudah dipakai (2x accept)", async () => {
    const ownerId = await signUp(`invite-accept-reuse-owner-${runId}@test.local`);
    const invitedEmail = `invite-accept-reuse-${runId}@test.local`;
    const { token } = await createInvitedSeat(ownerId, invitedEmail);

    await testApp.handle(
      new Request(`http://localhost/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pertama", password: "Password123!" }),
      }),
    );
    const res2 = await testApp.handle(
      new Request(`http://localhost/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Kedua", password: "Password123!" }),
      }),
    );
    expect(res2.status).toBe(404);
  });
});

describe("POST /invites/:token/accept-existing — akun existing", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/invites/anything/accept-existing", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  test("403 EMAIL_MISMATCH kalau email sesi TIDAK cocok invitedEmail", async () => {
    const ownerId = await signUp(`invite-existing-owner-${runId}@test.local`);
    const invitedEmail = `invite-existing-target-${runId}@test.local`;
    await signUp(invitedEmail);
    const { token } = await createInvitedSeat(ownerId, invitedEmail);

    const wrongEmail = `invite-existing-wrong-${runId}@test.local`;
    await signUp(wrongEmail);
    const wrongCookie = await signIn(wrongEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/invites/${token}/accept-existing`, { method: "POST", headers: { cookie: wrongCookie } }),
    );
    expect(res.status).toBe(403);
  });

  test("200 — akun existing berhasil link ke seat tanpa bikin akun baru", async () => {
    const ownerId = await signUp(`invite-existing-owner2-${runId}@test.local`);
    const invitedEmail = `invite-existing-target2-${runId}@test.local`;
    const existingMemberId = await signUp(invitedEmail);
    const memberCookie = await signIn(invitedEmail);
    const { seatId, token } = await createInvitedSeat(ownerId, invitedEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/invites/${token}/accept-existing`, { method: "POST", headers: { cookie: memberCookie } }),
    );
    expect(res.status).toBe(200);

    const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));
    expect(seat!.status).toBe("active");
    expect(seat!.memberUserId).toBe(existingMemberId);
  });
});
