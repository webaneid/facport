import { describe, test, expect } from "bun:test";
import { EXPIRE_SUBSCRIPTIONS_CRON, NOTIFY_EXPIRING_SOON_CRON } from "./job-schedules";

// § Fase 175, ADR-0041 — jadwal job langganan: kedaluwarsa tiap 10 menit (notifikasi tepat waktu), pengingat 09:00 zona perusahaan.
describe("jadwal job langganan", () => {
  test("EXPIRE_SUBSCRIPTIONS tiap 10 menit; NOTIFY_EXPIRING_SOON sekali sehari jam 09:00", () => {
    expect(EXPIRE_SUBSCRIPTIONS_CRON).toBe("*/10 * * * *");
    expect(NOTIFY_EXPIRING_SOON_CRON).toBe("0 9 * * *");
    for (const cron of [EXPIRE_SUBSCRIPTIONS_CRON, NOTIFY_EXPIRING_SOON_CRON]) expect(cron.split(" ")).toHaveLength(5);
  });
});
