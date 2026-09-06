import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings, customerCareAgents } from "../db/schema";
import { getLocalTimeParts, endOfTodayInTimezone } from "./company-timezone";

// § Fase 46 — jam kerja GLOBAL (1 jadwal untuk semua agent, BUKAN
// per-agent — sesuai permintaan user "settings di laman customer care,
// popup aja"). Menit-dari-tengah-malam (integer), BUKAN string "HH:MM"
// — lebih gampang dibandingkan numerik, konsisten pola `data.importRetentionDays` dkk.
export const WORK_START_MINUTES_KEY = "customerCare.workStartMinutes";
export const WORK_END_MINUTES_KEY = "customerCare.workEndMinutes";
export const WORK_DAYS_KEY = "customerCare.workDays";
export const DEFAULT_WORK_START_MINUTES = 9 * 60; // 09:00
export const DEFAULT_WORK_END_MINUTES = 17 * 60; // 17:00
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]; // Senin-Sabtu (0=Minggu)

export type WorkSchedule = { workStartMinutes: number; workEndMinutes: number; workDays: number[] };

export async function getWorkSchedule(): Promise<WorkSchedule> {
  const rows = await db.select().from(settings).where(eq(settings.key, WORK_START_MINUTES_KEY));
  const [startRow] = rows;
  const [endRow] = await db.select().from(settings).where(eq(settings.key, WORK_END_MINUTES_KEY));
  const [daysRow] = await db.select().from(settings).where(eq(settings.key, WORK_DAYS_KEY));
  return {
    workStartMinutes: typeof startRow?.value === "number" ? startRow.value : DEFAULT_WORK_START_MINUTES,
    workEndMinutes: typeof endRow?.value === "number" ? endRow.value : DEFAULT_WORK_END_MINUTES,
    workDays: Array.isArray(daysRow?.value) ? (daysRow.value as number[]) : DEFAULT_WORK_DAYS,
  };
}

// § SEMUA cek jam kerja WAJIB pakai timezone perusahaan (§ getLocalTimeParts,
// company-timezone.ts) — TIDAK PERNAH `new Date().getHours()` server,
// persis kelas bug yang sudah diperbaiki 2x di project ini (Fase 44,
// ADR-0028) — hampir terulang lagi kalau tidak diperhatikan di sini juga.
export function isWithinWorkHours(now: Date, timezone: string, schedule: WorkSchedule): boolean {
  const { minutesOfDay, weekday } = getLocalTimeParts(now, timezone);
  if (!schedule.workDays.includes(weekday)) return false;
  return minutesOfDay >= schedule.workStartMinutes && minutesOfDay < schedule.workEndMinutes;
}

export type AgentForOnlineCheck = { isActive: boolean; manuallyOfflineUntil: Date | null };

export function isAgentOnline(agent: AgentForOnlineCheck, now: Date, timezone: string, schedule: WorkSchedule): boolean {
  if (!agent.isActive) return false;
  if (agent.manuallyOfflineUntil && agent.manuallyOfflineUntil.getTime() > now.getTime()) return false;
  return isWithinWorkHours(now, timezone, schedule);
}

export type RotationCandidate = { id: string };

// § pilih agent dengan klik PALING SEDIKIT hari ini di antara yang
// online — round-robin sederhana, adil tanpa perlu state rotasi
// terpisah (cukup hitung ulang dari log klik hari ini tiap kali).
// Tie-break by `id` (stabil, deterministik) — bukan random, supaya
// gampang di-test.
export function pickNextAgent<T extends RotationCandidate>(onlineAgents: T[], clickCountTodayByAgentId: Map<string, number>): T | null {
  if (onlineAgents.length === 0) return null;
  return [...onlineAgents].sort((a, b) => {
    const countA = clickCountTodayByAgentId.get(a.id) ?? 0;
    const countB = clickCountTodayByAgentId.get(b.id) ?? 0;
    if (countA !== countB) return countA - countB;
    return a.id.localeCompare(b.id);
  })[0]!;
}

// § dipakai endpoint admin toggle "Off Hari Ini" — helper tipis supaya
// route file tidak perlu import `endOfTodayInTimezone`+`getCompanyTimezone`
// terpisah tiap kali.
export async function markAgentOfflineToday(agentId: string, timezone: string) {
  const until = endOfTodayInTimezone(new Date(), timezone);
  await db.update(customerCareAgents).set({ manuallyOfflineUntil: until, updatedAt: new Date() }).where(eq(customerCareAgents.id, agentId));
  return until;
}

export async function markAgentOnlineNow(agentId: string) {
  await db.update(customerCareAgents).set({ manuallyOfflineUntil: null, updatedAt: new Date() }).where(eq(customerCareAgents.id, agentId));
}
