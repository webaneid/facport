import { Elysia, t } from "elysia";
import { randomBytes } from "crypto";
import { eq, and, or, ilike, inArray, desc, count } from "drizzle-orm";
import { db } from "../../lib/db";
import { auth } from "../../lib/auth";
import { roles, userRoles, auditLogs, subscriptions, plans, user as userTable, session } from "../../db/schema";
import { permissionPlugin, userHasPermission } from "../../lib/permission";
import { createInvoiceAndOrder } from "../../lib/invoice-order";
import { createManualSubscriptions } from "../../lib/manual-subscription";
import { getOrCreateDefaultDataUsaha } from "../../lib/data-usaha";
import { boss, JOBS, startQueue } from "../../lib/queue";
import { env } from "../../lib/env";
import { escapeHtml } from "../../lib/email";

function getAppOrigin(): string {
  // `||` (bukan `??`) SENGAJA — .env sering set APP_ORIGIN_PROD= (string
  // kosong, bukan unset) — pola sama `accurate.route.ts` `getAppOrigin()`.
  return env.APP_ORIGIN_PROD || "http://app.localhost:6209";
}

// § architecture-subscription.md § "Admin-Provisioned" — admin buat user
// LANGSUNG (bukan lewat form self-register publik). Password sementara
// digenerate & dikembalikan di response (admin relay manual ke user lewat
// channel apa pun) — force-change-di-login-pertama BELUM diimplementasi
// (dicatat di Known Limitations phase doc, bukan blocker Fase 01).
//
// § Fase 18 — DIPERLUAS: admin BOLEH sekalian pilih sub-modul (planIds)
// saat bikin user, dengan 2 hasil akhir: "Kirim Invoice" (default, bikin
// invoice+order status unpaid/pending — customer bayar sendiri lewat
// `/billing/{orderId}/pay`, Fase 16) ATAU `markAsPaid: true` ("Tandai
// Sudah Dibayar" — subscription langsung aktif, TANPA invoice/order sama
// sekali, pola sama admin/subscriptions.route.ts tapi endAt DIHITUNG
// OTOMATIS dari plan.durationDays, bukan diinput manual). Email selamat
// datang (kredensial + link relevan) diganti dari relay manual admin
// jadi otomatis lewat job queue.
export const adminUsersRoute = new Elysia({ prefix: "/admin/users" })
  .use(permissionPlugin)
  // § Fase 10 — list user + role + subscription AKTIF (kalau ada), buat
  // halaman `/admin/users`. Query role/subscription DIPISAH (bukan 1 JOIN
  // besar) supaya tidak duplikasi baris user kalau punya >1 role — pola
  // fetch-lalu-gabung-di-memory, bukan SQL join multi-baris.
  .get(
    "/",
    async ({ query }) => {
      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;
      const search = query.search?.trim();
      const searchCondition = search ? or(ilike(userTable.name, `%${search}%`), ilike(userTable.email, `%${search}%`)) : undefined;

      // § diminta user 2026-09-05 — halaman ini SEKARANG cuma customer,
      // akun sisi-admin (Super Admin/Admin) punya menu sendiri (§
      // `admin/staff.route.ts`) — jawaban atas "pisahin customer dan
      // user untuk admin". `customerIds` subquery, BUKAN JOIN langsung
      // di WHERE utama — Drizzle subquery `inArray` lebih gampang
      // digabung `and()` dengan `searchCondition` yang opsional.
      const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
      // § role "customer" WAJIB ke-seed (`db/seed.ts`) — kalau somehow
      // belum (DB baru belum di-seed), jangan lempar error tipe uuid
      // dari Postgres (`eq(uuid, "")` invalid), balikin daftar kosong
      // saja (aman, bukan bocor semua user).
      if (!customerRole) return { users: [], total: 0 };
      const customerIds = db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, customerRole.id));
      const where = searchCondition ? and(inArray(userTable.id, customerIds), searchCondition) : inArray(userTable.id, customerIds);

      const [rows, totalRows] = await Promise.all([
        db.select().from(userTable).where(where).orderBy(desc(userTable.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(userTable).where(where),
      ]);

      const userIds = rows.map((r) => r.id);
      const [roleRows, subRows] = userIds.length
        ? await Promise.all([
            db
              .select({ userId: userRoles.userId, roleName: roles.name })
              .from(userRoles)
              .innerJoin(roles, eq(userRoles.roleId, roles.id))
              .where(inArray(userRoles.userId, userIds)),
            db
              .select({ userId: subscriptions.userId, status: subscriptions.status, planName: plans.name, endAt: subscriptions.endAt })
              .from(subscriptions)
              .innerJoin(plans, eq(subscriptions.planId, plans.id))
              .where(and(inArray(subscriptions.userId, userIds), eq(subscriptions.status, "active"))),
          ])
        : [[], []];

      const rolesByUser = new Map<string, string[]>();
      for (const r of roleRows) rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.roleName]);
      // § bug ditemukan 2026-09-08 (feedback user, 2 klien production
      // dengan langganan SEMUA modul cuma tampil 1 di /admin/users) —
      // sebelumnya `new Map(subRows.map((s) => [s.userId, s]))` CUMA
      // simpan subscription TERAKHIR per userId (Map key unik), yang lain
      // ke-overwrite diam-diam. User dengan >1 modul aktif (kasus normal
      // sejak Fase 53 multi-tier) jadi cuma nampilin 1 badge padahal
      // subscription lain masih aktif di DB (bukan data hilang, murni
      // bug tampilan). Fix: grouping jadi array per user.
      const subByUser = new Map<string, (typeof subRows)[number][]>();
      for (const s of subRows) subByUser.set(s.userId, [...(subByUser.get(s.userId) ?? []), s]);

      return {
        users: rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          emailVerified: u.emailVerified,
          disabled: u.disabled,
          createdAt: u.createdAt,
          roles: rolesByUser.get(u.id) ?? [],
          activeSubscriptions: subByUser.get(u.id) ?? [],
        })),
        total: totalRows[0]?.total ?? 0,
      };
    },
    {
      // § Fase 29, ADR-0027 — diturunkan dari `users.manage`: role
      // "staff" (Admin terbatas) BOLEH lihat daftar, cuma tidak boleh
      // tambah/nonaktifkan (itu tetap `users.manage`, endpoint di bawah).
      permission: "users.view",
      query: t.Object({
        search: t.Optional(t.String()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
      }),
    },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      // § security review 2026-09-04 (High) — `markAsPaid` aktivasi
      // subscription LANGSUNG (bypass invoice/payment sama sekali),
      // PERSIS aksi yang sama dengan `POST /admin/subscriptions` yang
      // sengaja digerbangi permission TERPISAH `subscriptions.manage`
      // (§ ADR-0016). TANPA cek ini, role custom yang punya `users.manage`
      // TAPI TIDAK punya `subscriptions.manage` (mis. "staf onboarding"
      // yang cuma boleh bikin akun, bukan urus billing) bisa aktivasi
      // subscription bebas-bayar lewat jalur ini — memotong boundary
      // otorisasi yang sudah didesain di endpoint lama. Dicek DI AWAL
      // (sebelum bikin user sama sekali), bukan cuma sebelum manggil
      // createManualSubscriptions — permintaan yang ditolak TIDAK BOLEH
      // sempat bikin user "setengah jalan".
      if (body.markAsPaid && !(await userHasPermission(user.id, "subscriptions.manage"))) {
        set.status = 403;
        return { code: "FORBIDDEN_MARK_AS_PAID" };
      }

      // § Fase 18 — validasi planIds DULU (sebelum bikin user sama
      // sekali) — cegah user "yatim" (dibuat tapi gagal setengah jalan
      // di langkah invoice/subscription karena planId salah).
      const planIds = [...new Set(body.planIds ?? [])];
      let planRows: (typeof plans.$inferSelect)[] = [];
      if (planIds.length > 0) {
        planRows = await db.select().from(plans).where(inArray(plans.id, planIds));
        if (planRows.length !== planIds.length) {
          set.status = 404;
          return { code: "PLAN_NOT_FOUND" };
        }
        if (planRows.some((p) => !p.isActive)) {
          set.status = 400;
          return { code: "PLAN_NOT_ACTIVE" };
        }
      }

      const tempPassword = randomBytes(12).toString("base64url");

      const result = await auth.api.signUpEmail({
        body: { email: body.email, password: tempPassword, name: body.name },
      });
      if (!result?.user) {
        set.status = 400;
        return { code: "USER_CREATE_FAILED" };
      }

      // Self-service WAJIB verifikasi email (§ lib/auth.ts,
      // requireEmailVerification: true) — admin-provisioned SENGAJA
      // dikecualikan, admin yang vouch validitas data, bukan email itu
      // sendiri (§ architecture-subscription.md § "Admin-Provisioned").
      await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, result.user.id));

      const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
      if (customerRole) {
        await db.insert(userRoles).values({ userId: result.user.id, roleId: customerRole.id }).onConflictDoNothing();
      }

      await db.insert(auditLogs).values({
        entityType: "user",
        entityId: result.user.id,
        action: "create",
        changes: { email: body.email, name: body.name, provisionedBy: "admin" },
        actorId: user.id,
      });

      // § Fase 18 — 2 jalur hasil akhir kalau admin sekalian pilih
      // sub-modul. `orderId`/`subscriptionIds` di response dipakai FE
      // buat tampilkan hasil (preview invoice ATAU konfirmasi aktivasi).
      let invoiceId: string | undefined;
      let orderId: string | undefined;
      let amountDue: number | undefined;
      let subscriptionIds: string[] | undefined;

      if (planRows.length > 0) {
        // § Fase 108, architecture-user-tambahan.md § Fase B1 — user
        // BARU pasti belum punya Data Usaha apa pun, auto-buat "Data
        // Usaha Utama" default (admin belum atur pilih Data Usaha
        // spesifik di alur provisioning ini — UI itu menyusul Fase
        // 109/110, dicatat sebagai Known Limitation phase doc).
        const dataUsahaId = await getOrCreateDefaultDataUsaha(result.user!.id);
        if (body.markAsPaid) {
          subscriptionIds = await db.transaction((tx) =>
            createManualSubscriptions(tx, { userId: result.user!.id, planRows, actorId: user.id, dataUsahaId }),
          );
        } else {
          const created = await db.transaction((tx) =>
            createInvoiceAndOrder(tx, { userId: result.user!.id, billToName: body.name, planRows, dataUsahaId }),
          );
          invoiceId = created.invoiceId;
          orderId = created.orderId;
          amountDue = created.amountDue;
        }
      }

      // § CLAUDE.md root "Rules Non-Negotiable" — email WAJIB lewat job
      // queue (pola sama `lib/auth.ts` `sendVerificationEmail`), bukan
      // sinkron di request handler ini.
      //
      // § security review 2026-09-04 (Medium) — `body.name` (free-text,
      // TANPA batasan karakter selain panjang) WAJIB di-escape sebelum
      // masuk HTML — tanpa ini, admin (termasuk akun admin yang dibajak)
      // bisa sisipkan markup/link palsu ke email "resmi" Facport yang
      // diterima user baru. `body.email` relatif aman (TypeBox `format:
      // "email"` sudah menolak karakter `<`/`>`), plan name TIDAK
      // user-input per-request (dari katalog admin yang sudah ada), tapi
      // di-escape juga untuk konsisten/defense-in-depth.
      const safeName = escapeHtml(body.name);
      const appOrigin = getAppOrigin();
      const loginUrl = `${appOrigin}/login`;
      const planListHtml = planRows.length > 0 ? `<ul>${planRows.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("")}</ul>` : "";
      const actionHtml = orderId
        ? `<p>Selesaikan pembayaran di sini: <a href="${appOrigin}/billing/${orderId}/pay">${appOrigin}/billing/${orderId}/pay</a> (total ${amountDue ? `Rp${amountDue.toLocaleString("id-ID")}` : ""})</p>`
        : subscriptionIds
          ? `<p>Semua modul di atas sudah AKTIF — langsung login untuk mulai pakai.</p>`
          : "";
      await startQueue();
      await boss.send(JOBS.SEND_EMAIL, {
        to: body.email,
        subject: "Selamat datang di Facport",
        html: `<p>Halo ${safeName},</p><p>Akun Facport kamu sudah dibuat admin. Berikut kredensial login kamu:</p><p>Email: ${body.email}<br>Password sementara: <strong>${tempPassword}</strong></p><p>Login di sini: <a href="${loginUrl}">${loginUrl}</a></p>${planListHtml}${actionHtml}<p>Segera ganti password setelah login pertama.</p>`,
        // § security review 2026-09-04 (Medium) — email ini berisi
        // password PLAINTEXT nyata, beda dari link verifikasi (nilai
        // kredensial nol) — JANGAN pernah masuk log terstruktur kalau
        // RESEND_API_KEY kosong (§ lib/email.ts `sendEmail` § sensitive).
        sensitive: true,
      });

      return { id: result.user.id, email: body.email, tempPassword, invoiceId, orderId, amountDue, subscriptionIds };
    },
    {
      permission: "users.manage",
      body: t.Object({
        email: t.String({ format: "email" }),
        name: t.String({ minLength: 1, maxLength: 100 }),
        planIds: t.Optional(t.Array(t.String({ format: "uuid" }))),
        markAsPaid: t.Optional(t.Boolean()),
      }),
    },
  )
  // § Fase 29, ADR-0027 — "mengurangi user" = NONAKTIFKAN (reversibel),
  // BUKAN hapus permanen (§ ADR-0027 § Decision 3, alasan FK/finansial).
  // Cuma `users.manage` (Super Admin) — role "staff" (Admin) TIDAK BOLEH.
  .patch(
    "/:id/disable",
    async ({ params, user, set }) => {
      if (params.id === user.id) {
        set.status = 400;
        return { code: "CANNOT_DISABLE_SELF" };
      }

      const [adminRole] = await db.select().from(roles).where(eq(roles.name, "admin"));

      // § security review 2026-09-05 (Medium) — guard "jangan nonaktifkan
      // Super Admin AKTIF terakhir" SEBELUMNYA baca-lalu-tulis TANPA
      // transaksi/lock (TOCTOU): 2 request bersamaan menyasar 2 admin
      // BEDA bisa sama-sama lolos hitungan ">1 admin aktif" sebelum
      // salah satu commit, berakhir 0 admin aktif. `.for("update")`
      // MENGUNCI baris admin aktif yang di-SELECT — transaksi konkuren
      // yang coba baca baris SAMA akan BLOCK sampai transaksi ini
      // commit, baru baca ulang hitungan yang sudah ter-update.
      const ok = await db.transaction(async (tx) => {
        if (adminRole) {
          const targetIsAdmin = await tx
            .select()
            .from(userRoles)
            .where(and(eq(userRoles.userId, params.id), eq(userRoles.roleId, adminRole.id)));
          if (targetIsAdmin.length > 0) {
            const activeAdmins = await tx
              .select({ userId: userRoles.userId })
              .from(userRoles)
              .innerJoin(userTable, eq(userTable.id, userRoles.userId))
              .where(and(eq(userRoles.roleId, adminRole.id), eq(userTable.disabled, false)))
              .for("update");
            if (activeAdmins.length <= 1) return false;
          }
        }
        await tx.update(userTable).set({ disabled: true }).where(eq(userTable.id, params.id));
        return true;
      });

      if (!ok) {
        set.status = 400;
        return { code: "CANNOT_DISABLE_LAST_SUPER_ADMIN" };
      }

      // § cabut SEMUA sesi aktif SEKETIKA — tanpa ini, sesi lama tetap
      // jalan sampai expired natural (7 hari) walau `disabled = true`
      // (§ ADR-0027 § Decision 3, lapis 1 dari 2 mekanisme penegakan).
      await db.delete(session).where(eq(session.userId, params.id));

      await db.insert(auditLogs).values({
        entityType: "user",
        entityId: params.id,
        action: "update",
        changes: { disabled: true },
        actorId: user.id,
      });

      return { ok: true };
    },
    { permission: "users.manage", params: t.Object({ id: t.String({ minLength: 1 }) }) },
  )
  .patch(
    "/:id/enable",
    async ({ params, user }) => {
      await db.update(userTable).set({ disabled: false }).where(eq(userTable.id, params.id));
      await db.insert(auditLogs).values({
        entityType: "user",
        entityId: params.id,
        action: "update",
        changes: { disabled: false },
        actorId: user.id,
      });
      return { ok: true };
    },
    { permission: "users.manage", params: t.Object({ id: t.String({ minLength: 1 }) }) },
  );
