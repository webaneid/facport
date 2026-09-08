import { eq } from "drizzle-orm";
import { db } from "./db";
import { roles, userRoles } from "../db/schema";

// § Fase 62 — dipanggil dari `databaseHooks.user.create.after` di
// `lib/auth.ts` (fires untuk SEMUA metode pembuatan user Better Auth:
// email/password, Google OAuth, dst — tidak seperti intercept HTTP
// manual di `app.ts` yang CUMA jalan untuk path `/api/auth/sign-up/email`).
// Diekstrak jadi fungsi terpisah (bukan inline di `lib/auth.ts`) supaya
// bisa dites langsung tanpa lewat HTTP/OAuth flow sungguhan.
//
// § `onConflictDoNothing()` — SENGAJA idempotent. `app.ts` (baris ~155)
// PUNYA logic yang SAMA PERSIS untuk jalur `/api/auth/sign-up/email`,
// DIBIARKAN (tidak dihapus/dikonsolidasi) — redundan tapi aman 100%
// untuk jalur email/password, § ADR-0030 "Keputusan Kecil".
export async function assignCustomerRole(userId: string): Promise<void> {
  const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
  if (!customerRole) return;
  await db.insert(userRoles).values({ userId, roleId: customerRole.id }).onConflictDoNothing();
}
