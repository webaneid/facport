import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { plans } from "../db/schema";

// Publik — dipakai landing page buat tampilkan daftar harga (§ architecture-subscription.md)
// § architecture-api.md — return payload BARE (bukan {data,error} manual),
// Eden Treaty SENDIRI yang jadi wrapper {data,error} di sisi client
// berdasarkan HTTP status. Lihat catatan "double-wrap" di
// docs/decisions/adr-0010-response-format-eden.md.
export const plansRoute = new Elysia({ prefix: "/plans" }).get("/", async () => {
  return await db.select().from(plans).where(eq(plans.isActive, true));
});
