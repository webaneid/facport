import { Elysia, t } from "elysia";
import { eq, gte, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { customerCareAgents, customerCareClicks } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { getCompanyTimezone, startOfTodayInTimezone } from "../lib/company-timezone";
import { isAgentOnline, getWorkSchedule, pickNextAgent } from "../lib/customer-care";

// § Fase 46 — dipakai widget floating (§ CustomerCareWidget), auth:true
// (customer login, app surface). Nomor WhatsApp SENGAJA TIDAK di-expose
// di `/next` (cuma dipakai server-side sampai titik klik) — kurangi
// permukaan scraping nomor WA dari response yang dipanggil tiap page load.
export const customerCareRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/me/customer-care/next",
    async () => {
      const timezone = await getCompanyTimezone();
      const schedule = await getWorkSchedule();
      const now = new Date();

      const allAgents = await db.select().from(customerCareAgents).where(eq(customerCareAgents.isActive, true));
      const onlineAgents = allAgents.filter((a) => isAgentOnline(a, now, timezone, schedule));

      if (onlineAgents.length === 0) {
        return { available: false as const, workSchedule: schedule };
      }

      const todayStart = startOfTodayInTimezone(now, timezone);
      const clickRows = await db
        .select({ agentId: customerCareClicks.agentId, count: sql<number>`count(*)` })
        .from(customerCareClicks)
        .where(gte(customerCareClicks.clickedAt, todayStart))
        .groupBy(customerCareClicks.agentId);
      const clickCounts = new Map(clickRows.map((r) => [r.agentId, Number(r.count)]));

      const picked = pickNextAgent(onlineAgents, clickCounts);
      if (!picked) return { available: false as const, workSchedule: schedule };

      return {
        available: true as const,
        agent: { id: picked.id, name: picked.name, position: picked.position, photoUrl: picked.photoUrl },
      };
    },
    { auth: true },
  )
  // § re-validasi PENUH server-side (agent yang diklaim client masih
  // online SEKARANG) — TIDAK percaya begitu saja `agentId` dari client
  // (bisa dimanipulasi lewat DevTools buat pilih agent offline sembarangan).
  .post(
    "/me/customer-care/click",
    async ({ body, user, set }) => {
      const [agent] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, body.agentId));
      if (!agent) {
        set.status = 404;
        return { code: "AGENT_NOT_FOUND" };
      }

      const timezone = await getCompanyTimezone();
      const schedule = await getWorkSchedule();
      if (!isAgentOnline(agent, new Date(), timezone, schedule)) {
        set.status = 400;
        return { code: "AGENT_NOT_ONLINE" };
      }

      await db.insert(customerCareClicks).values({ agentId: agent.id, userId: user.id });
      return { waLink: `https://wa.me/${agent.whatsappNumber}` };
    },
    { auth: true, body: t.Object({ agentId: t.String({ format: "uuid" }) }) },
  );
