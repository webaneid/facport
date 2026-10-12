import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { and, eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { auditLogs, memberSeats, user as userTable } from "../db/schema";
import { teamRoute } from "./team.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";

// § Fase 189B — undang/cabut seat oleh PEMILIK kini tercatat di riwayat Data Usaha (jejak akses yang lengkap: pemilik maupun admin).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(teamRoute);
let seq = 0;

async function newOwner() {
  const email = `team-events-${runId}-${seq++}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: "Pemilik Tim" }) }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, user.id));
  const signIn = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }),
  );
  const cookie = signIn.headers.get("set-cookie") ?? "";
  const du = await createTestDataUsaha(user.id);
  const seatId = await createTestSeat(user.id, du);
  return { id: user.id, cookie, du, seatId };
}
const call = (cookie: string, seatId: string, action: "invite" | "revoke", body?: unknown) =>
  testApp.handle(new Request(`http://localhost/me/team/${seatId}/${action}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
const eventsOf = (du: string, action: string) => db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "data_usaha"), eq(auditLogs.entityId, du), eq(auditLogs.action, action)));

describe("riwayat akses sisi pemilik (Fase 189B)", () => {
  test("undang → invite_seat (by owner); cabut → revoke_seat (by owner, email undangan); tanpa alasan wajib", async () => {
    const o = await newOwner();
    expect((await call(o.cookie, o.seatId, "invite", { email: "staf@test.local" })).status).toBe(200);
    expect((await eventsOf(o.du, "invite_seat"))[0]!.changes).toMatchObject({ seatId: o.seatId, email: "staf@test.local", by: "owner" });

    expect((await call(o.cookie, o.seatId, "revoke")).status).toBe(200);
    const [rev] = await eventsOf(o.du, "revoke_seat");
    expect(rev!.actorId).toBe(o.id);
    expect(rev!.changes).toMatchObject({ seatId: o.seatId, previousStatus: "invited", email: "staf@test.local", by: "owner" });
    expect((await db.select().from(memberSeats).where(eq(memberSeats.id, o.seatId)))[0]!.status).toBe("available");
  });

  test("galat tetap kode lama dan TIDAK mencatat: undang slot yang tidak tersedia 400 SEAT_NOT_AVAILABLE; cabut slot tersedia 400 SEAT_ALREADY_AVAILABLE; slot orang lain 404", async () => {
    const o = await newOwner();
    const other = await newOwner();
    const already = await call(o.cookie, o.seatId, "revoke");
    expect(already.status).toBe(400);
    expect(((await already.json()) as { code: string }).code).toBe("SEAT_ALREADY_AVAILABLE");

    await call(o.cookie, o.seatId, "invite", { email: "a@test.local" });
    const twice = await call(o.cookie, o.seatId, "invite", { email: "b@test.local" });
    expect(twice.status).toBe(400);
    expect(((await twice.json()) as { code: string }).code).toBe("SEAT_NOT_AVAILABLE");
    expect(await eventsOf(o.du, "invite_seat")).toHaveLength(1);

    expect((await call(o.cookie, other.seatId, "revoke")).status).toBe(404); // seat milik pemilik lain
    expect(await eventsOf(other.du, "revoke_seat")).toHaveLength(0);
  });
});
