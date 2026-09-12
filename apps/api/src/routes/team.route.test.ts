import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, memberSeats, session as sessionTable } from "../db/schema";
import { teamRoute } from "./team.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";

// § Fase 110, architecture-user-tambahan.md — customer-facing "Kelola Tim".
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(teamRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Team Test" }),
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

describe("GET /me/team", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/me/team?dataUsahaId=00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(401);
  });

  test("404 DATA_USAHA_NOT_FOUND kalau dataUsahaId bukan milik user", async () => {
    const ownerId = await signUp(`team-list-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const attackerEmail = `team-list-attacker-${runId}@test.local`;
    await signUp(attackerEmail);
    const attackerCookie = await signIn(attackerEmail);

    const res = await testApp.handle(new Request(`http://localhost/me/team?dataUsahaId=${dataUsahaId}`, { headers: { cookie: attackerCookie } }));
    expect(res.status).toBe(404);
  });

  test("200 — list seat milik Data Usaha, termasuk info member kalau sudah accepted", async () => {
    const ownerEmail = `team-list-ok-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const seatId = await createTestSeat(ownerId, dataUsahaId);

    const res = await testApp.handle(new Request(`http://localhost/me/team?dataUsahaId=${dataUsahaId}`, { headers: { cookie: ownerCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seats: { id: string; status: string }[] };
    expect(body.seats.some((s) => s.id === seatId && s.status === "available")).toBe(true);
  });
});

describe("POST /me/team/:seatId/invite", () => {
  test("404 SEAT_NOT_FOUND kalau seat bukan milik user", async () => {
    const ownerId = await signUp(`team-invite-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const seatId = await createTestSeat(ownerId, dataUsahaId);

    const attackerEmail = `team-invite-attacker-${runId}@test.local`;
    await signUp(attackerEmail);
    const attackerCookie = await signIn(attackerEmail);

    const res = await testApp.handle(
      new Request(`http://localhost/me/team/${seatId}/invite`, {
        method: "POST",
        headers: { cookie: attackerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "target@test.local" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("200 — invite berhasil, seat jadi status invited dengan invitedEmail tersimpan", async () => {
    const ownerEmail = `team-invite-ok-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const seatId = await createTestSeat(ownerId, dataUsahaId);

    const res = await testApp.handle(
      new Request(`http://localhost/me/team/${seatId}/invite`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ email: `invited-${runId}@test.local` }),
      }),
    );
    expect(res.status).toBe(200);

    const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));
    expect(seat!.status).toBe("invited");
    expect(seat!.invitedEmail).toBe(`invited-${runId}@test.local`);
    expect(seat!.inviteTokenHash).toBeTruthy();
  });

  test("400 SEAT_NOT_AVAILABLE kalau seat sudah invited/active", async () => {
    const ownerEmail = `team-invite-notavail-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const seatId = await createTestSeat(ownerId, dataUsahaId);
    await db.update(memberSeats).set({ status: "invited" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(
      new Request(`http://localhost/me/team/${seatId}/invite`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "another@test.local" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("SEAT_NOT_AVAILABLE");
  });
});

describe("POST /me/team/:seatId/revoke", () => {
  test("200 — revoke reset seat ke available & cabut sesi member", async () => {
    const ownerEmail = `team-revoke-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const seatId = await createTestSeat(ownerId, dataUsahaId);

    const memberEmail = `team-revoke-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    await signIn(memberEmail); // § bikin baris session utk member ini
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const sessionsBefore = await db.select().from(sessionTable).where(eq(sessionTable.userId, memberId));
    expect(sessionsBefore.length).toBeGreaterThan(0);

    const res = await testApp.handle(new Request(`http://localhost/me/team/${seatId}/revoke`, { method: "POST", headers: { cookie: ownerCookie } }));
    expect(res.status).toBe(200);

    const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));
    expect(seat!.status).toBe("available");
    expect(seat!.memberUserId).toBeNull();

    const sessionsAfter = await db.select().from(sessionTable).where(eq(sessionTable.userId, memberId));
    expect(sessionsAfter.length).toBe(0);
  });

  test("seat reassignment — revoke lalu invite ulang ke slot SAMA, seatSubscriptionId tidak berubah", async () => {
    const ownerEmail = `team-reassign-owner-${runId}@test.local`;
    const ownerId = await signUp(ownerEmail);
    const ownerCookie = await signIn(ownerEmail);
    const dataUsahaId = await createTestDataUsaha(ownerId);
    const seatId = await createTestSeat(ownerId, dataUsahaId);
    const [seatBefore] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));

    const member1Id = await signUp(`team-reassign-member1-${runId}@test.local`);
    await db.update(memberSeats).set({ memberUserId: member1Id, status: "active" }).where(eq(memberSeats.id, seatId));

    await testApp.handle(new Request(`http://localhost/me/team/${seatId}/revoke`, { method: "POST", headers: { cookie: ownerCookie } }));

    const res = await testApp.handle(
      new Request(`http://localhost/me/team/${seatId}/invite`, {
        method: "POST",
        headers: { cookie: ownerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ email: `team-reassign-member2-${runId}@test.local` }),
      }),
    );
    expect(res.status).toBe(200);

    const [seatAfter] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));
    expect(seatAfter!.seatSubscriptionId).toBe(seatBefore!.seatSubscriptionId); // § durasi ikut slot, tidak reset
    expect(seatAfter!.status).toBe("invited");
    expect(seatAfter!.invitedEmail).toBe(`team-reassign-member2-${runId}@test.local`);
  });
});
