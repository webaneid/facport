import { eq } from "drizzle-orm";
import { db } from "./db";
import { user as userTable } from "../db/schema";

// § Fase 106 — diekstrak dari `permission.ts` supaya bisa dipakai juga
// oleh `auth.ts` (databaseHooks.session.create.before) TANPA circular
// import (`permission.ts` sendiri import `auth` dari `./auth`).
// `disabled` BUKAN field bawaan Better Auth (tidak didaftarkan lewat
// `additionalFields`), jadi `session.user.disabled` tidak bisa
// diandalkan — query manual ke tabel `user` di sini.
export async function isDisabled(userId: string): Promise<boolean> {
  const [row] = await db.select({ disabled: userTable.disabled }).from(userTable).where(eq(userTable.id, userId));
  return row?.disabled ?? false;
}
