import { Elysia } from "elysia";
import { eq, asc } from "drizzle-orm";
import { db } from "../lib/db";
import { promos } from "../db/schema";
import { permissionPlugin } from "../lib/permission";

// § Fase 116, architecture-promo.md — banner promo di gerbang "Pilih Data
// Usaha" (`/app/pilih-usaha`). `auth: true` (BUKAN permission khusus) —
// semua customer yang login boleh baca, tidak ada gating fitur di sini.
// LIMIT 5 SENGAJA (diminta user) — admin boleh bikin/aktifkan lebih dari
// 5, yang lolos `ORDER BY sortOrder LIMIT 5` yang tampil (halaman admin
// kasih indikator "Tampil"/"Tidak tampil" per baris supaya tidak
// membingungkan). Response DIPERKECIL ke field yang dipakai render saja
// — `isActive`/`sortOrder`/`createdBy` TIDAK diekspos ke customer.
export const promosRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/promos",
    async () => {
      const rows = await db
        .select({
          id: promos.id,
          title: promos.title,
          description: promos.description,
          buttonLabel: promos.buttonLabel,
          url: promos.url,
          imageUrl: promos.imageUrl,
        })
        .from(promos)
        .where(eq(promos.isActive, true))
        .orderBy(asc(promos.sortOrder))
        .limit(5);
      return { promos: rows };
    },
    { auth: true },
  );
