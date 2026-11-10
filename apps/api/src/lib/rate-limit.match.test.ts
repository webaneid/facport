import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { rateLimitPlugin } from "./rate-limit";

// § Fase 216 (audit keamanan LOW-3) — `rateLimitPlugin` dengan `match`/`method`: ember tersendiri untuk aksi dengan id di tengah path; jalur lain di prefix yang sama tidak ikut terhitung.
const ip = `10.216.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
const app = new Elysia()
  .use(rateLimitPlugin({ pathPrefix: "/zz-staff", match: /\/reset-password$/, method: "POST", windowMs: 60_000, max: 2 }))
  .post("/zz-staff/:id/reset-password", () => ({ ok: true }))
  .get("/zz-staff/:id/reset-password", () => ({ ok: true }))
  .get("/zz-staff", () => ({ ok: true }))
  .post("/zz-staff/:id/role", () => ({ ok: true }));
const call = (method: string, path: string) => app.handle(new Request(`http://localhost${path}`, { method, headers: { "x-real-ip": ip } }));

describe("rateLimitPlugin match/method", () => {
  test("POST reset-password: lolos 2x, ke-3 kena 429", async () => {
    expect((await call("POST", "/zz-staff/a/reset-password")).status).toBe(200);
    expect((await call("POST", "/zz-staff/b/reset-password")).status).toBe(200);
    const third = await call("POST", "/zz-staff/c/reset-password");
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ code: "TOO_MANY_REQUESTS" });
  });
  test("jalur/metode lain di prefix yang sama TIDAK ikut terbatasi", async () => {
    expect((await call("GET", "/zz-staff")).status).toBe(200);
    expect((await call("POST", "/zz-staff/a/role")).status).toBe(200);
    expect((await call("GET", "/zz-staff/a/reset-password")).status).toBe(200);
  });
});
