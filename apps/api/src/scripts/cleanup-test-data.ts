import "../lib/env";
import { inArray, like, or, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { env } from "../lib/env";
import {
  user as userTable,
  plans,
  subscriptions,
  orders,
  invoices,
  invoiceItems,
  accurateConnections,
  importBatches,
  roles,
  dataUsaha,
  memberSeats,
  ownershipTransfers,
} from "../db/schema";
import { announcements, notifications } from "../db/schema/notification.schema";
import { auditLogs, settings } from "../db/schema/core.schema";
import { customerCareClicks } from "../db/schema/customer-care.schema";

// § feedback_dev_db_test_cleanup (memory) — `bun run test` jalan lewat DB
// dev LOKAL yang sama dipakai manual browsing (bukan DB test terpisah),
// jadi tiap run bisa nyisa ratusan/ribuan baris `@test.local`. Script ini
// SATU sumber kebenaran cleanup-nya — JANGAN tulis ulang ad-hoc lewat
// `bun -e` tiap sesi (riwayat: versi ad-hoc lama sempat lupa cover
// `member_seats`/`ownership_transfers`/`orders.dataUsahaId` — FK Fase
// 106-113 — dan gagal separuh jalan sebelum akhirnya diperbaiki & di-commit
// di sini, § docs/phases/phase-113-scoping-data-usaha-dashboard.md).
//
// Dibungkus `db.transaction()` — kalau ada FK edge case yang belum
// tercover, seluruh operasi rollback bersih (bukan DB kesisa setengah
// bersih). Real data TIDAK PERNAH di-hardcode by ID — selalu re-derive
// dari pola penamaan test (`%@test.local`, nama plan mengandung timestamp
// 10+ digit atau kata "test", role custom non-system dengan suffix
// timestamp).
//
// § Guard dev-only sederhana — heuristik ini seharusnya TIDAK PERNAH match
// apa pun di production (akun nyata tidak pernah pakai `@test.local`),
// tapi tetap tolak jalan kalau `DATABASE_URL` jelas-jelas bukan lokal,
// jaga-jaga kesalahan konfigurasi `.env`.
if (!/localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) {
  console.error("❌ DATABASE_URL bukan localhost — script ini HANYA untuk dev lokal, dibatalkan.");
  process.exit(1);
}

const isTestPlanName = sql`(${plans.name} ~ ${"@test\\.local"} OR ${plans.name} ~ ${"[0-9]{10,}"} OR ${plans.name} ~* ${"test"})`;
const isTestRole = sql`(${roles.isSystem} = false AND ${roles.name} ~ ${"[0-9]{10,}"})`;

async function main() {
  await db.transaction(async (tx) => {
    const testUserIds = (await tx.select({ id: userTable.id }).from(userTable).where(like(userTable.email, "%@test.local"))).map((u) => u.id);
    const testPlanIds = (await tx.select({ id: plans.id }).from(plans).where(isTestPlanName)).map((p) => p.id);

    // § Fase 113 — `dataUsaha` dibuat lewat `createTestDataUsaha(userId, ...)`
    // di SETIAP call site test, jadi cukup derive dari `userId in testUserIds`
    // (aman dari false-positive: tidak match Data Usaha REAL manapun cuma
    // karena namanya kebetulan mirip nama test, mis. "Data Usaha A").
    const testDataUsahaIds = testUserIds.length
      ? (await tx.select({ id: dataUsaha.id }).from(dataUsaha).where(inArray(dataUsaha.userId, testUserIds))).map((d) => d.id)
      : [];

    const subConditions = [];
    if (testUserIds.length) subConditions.push(inArray(subscriptions.userId, testUserIds));
    if (testPlanIds.length) subConditions.push(inArray(subscriptions.planId, testPlanIds));
    if (testDataUsahaIds.length) subConditions.push(inArray(subscriptions.dataUsahaId, testDataUsahaIds));
    const testSubscriptionIds = subConditions.length
      ? (await tx.select({ id: subscriptions.id }).from(subscriptions).where(or(...subConditions))).map((s) => s.id)
      : [];

    // announcements.createdBy NOT NULL tanpa cascade -> hapus notifications
    // yang mereferensikannya (sourceAnnouncementId, juga tanpa cascade)
    // DULU, baru announcements.
    const testAnnouncementIds = testUserIds.length
      ? (await tx.select({ id: announcements.id }).from(announcements).where(inArray(announcements.createdBy, testUserIds))).map((a) => a.id)
      : [];
    if (testAnnouncementIds.length) {
      await tx.delete(notifications).where(inArray(notifications.sourceAnnouncementId, testAnnouncementIds));
      await tx.delete(announcements).where(inArray(announcements.id, testAnnouncementIds));
    }
    if (testUserIds.length) {
      await tx.delete(auditLogs).where(inArray(auditLogs.actorId, testUserIds)); // no cascade
      await tx.update(settings).set({ updatedBy: null }).where(inArray(settings.updatedBy, testUserIds)); // JANGAN hapus baris settings-nya sendiri, cuma null-kan ref
      await tx.delete(customerCareClicks).where(inArray(customerCareClicks.userId, testUserIds)); // no cascade
    }

    // import_batches punya FK userId DAN subscriptionId sendiri-sendiri —
    // match salah satu (lihat komentar testSubscriptionIds di atas).
    // import_batch_rows cascade dari sini.
    const batchConditions = [];
    if (testUserIds.length) batchConditions.push(inArray(importBatches.userId, testUserIds));
    if (testSubscriptionIds.length) batchConditions.push(inArray(importBatches.subscriptionId, testSubscriptionIds));
    if (batchConditions.length) await tx.delete(importBatches).where(or(...batchConditions));

    // § Fase 113 — memberSeats & ownershipTransfers WAJIB dihapus SEBELUM
    // subscriptions/dataUsaha (FK: seatSubscriptionId -> subscriptions,
    // dataUsahaId -> dataUsaha).
    const seatConditions = [];
    if (testDataUsahaIds.length) seatConditions.push(inArray(memberSeats.dataUsahaId, testDataUsahaIds));
    if (testUserIds.length) {
      seatConditions.push(inArray(memberSeats.primaryUserId, testUserIds));
      seatConditions.push(inArray(memberSeats.memberUserId, testUserIds));
    }
    if (seatConditions.length) await tx.delete(memberSeats).where(or(...seatConditions));

    const transferConditions = [];
    if (testDataUsahaIds.length) transferConditions.push(inArray(ownershipTransfers.dataUsahaId, testDataUsahaIds));
    if (testUserIds.length) {
      transferConditions.push(inArray(ownershipTransfers.fromUserId, testUserIds));
      transferConditions.push(inArray(ownershipTransfers.acceptedBy, testUserIds));
    }
    if (transferConditions.length) await tx.delete(ownershipTransfers).where(or(...transferConditions));

    // subscriptions dihapus by ID SET yang sudah dihitung di atas (bukan
    // re-derive kondisi user/plan/dataUsaha lagi) — jaga 2 langkah tetap sinkron.
    // Referensi user+plan+order+accurateConnection+invoiceItem, WAJIB
    // sebelum semua itu dihapus.
    if (testSubscriptionIds.length) await tx.delete(subscriptions).where(inArray(subscriptions.id, testSubscriptionIds));

    // § Fase 113 — `orders.dataUsahaId` (Fase 16) JUGA referensi
    // `data_usaha` — WAJIB dihapus SEBELUM dataUsaha, digabung dengan
    // kondisi invoiceId yang sudah ada (order bisa "test" via dataUsahaId
    // ATAU via invoice pemilik test user).
    const testInvoiceIds = testUserIds.length
      ? (await tx.select({ id: invoices.id }).from(invoices).where(inArray(invoices.userId, testUserIds))).map((i) => i.id)
      : [];
    const orderConditions = [];
    if (testDataUsahaIds.length) orderConditions.push(inArray(orders.dataUsahaId, testDataUsahaIds));
    if (testInvoiceIds.length) orderConditions.push(inArray(orders.invoiceId, testInvoiceIds));
    if (orderConditions.length) await tx.delete(orders).where(or(...orderConditions));

    // dataUsaha dihapus SETELAH subscriptions/memberSeats/ownershipTransfers/
    // orders (semua child-nya sudah bersih), SEBELUM user & accurateConnections
    // (dataUsaha.userId/accurateConnectionId FK).
    if (testDataUsahaIds.length) await tx.delete(dataUsaha).where(inArray(dataUsaha.id, testDataUsahaIds));

    if (testUserIds.length) {
      await tx.delete(invoices).where(inArray(invoices.userId, testUserIds)); // invoice_items cascade dari sini
      await tx.delete(accurateConnections).where(inArray(accurateConnections.userId, testUserIds));
    }
    // invoice_items.planId bisa nyangkut dari invoice user REAL yang
    // mereferensikan plan TEST (kasus lintas-test yang pernah ketemu) ->
    // hapus eksplisit by planId lepas dari punya siapa invoice-nya,
    // SEBELUM plans dihapus.
    if (testPlanIds.length) await tx.delete(invoiceItems).where(inArray(invoiceItems.planId, testPlanIds));
    if (testUserIds.length) await tx.delete(userTable).where(inArray(userTable.id, testUserIds)); // session/account/userRoles/notifications(penerima) cascade dari sini
    if (testPlanIds.length) await tx.delete(plans).where(inArray(plans.id, testPlanIds));

    const testRoleIds = (await tx.select({ id: roles.id }).from(roles).where(isTestRole)).map((r) => r.id);
    if (testRoleIds.length) await tx.delete(roles).where(isTestRole); // role_permissions cascade dari sini

    console.log(
      "Cleanup selesai:",
      JSON.stringify({
        users: testUserIds.length,
        plans: testPlanIds.length,
        dataUsaha: testDataUsahaIds.length,
        subscriptions: testSubscriptionIds.length,
        roles: testRoleIds.length,
      }),
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cleanup gagal (transaction di-rollback, DB tetap konsisten):", err);
    process.exit(1);
  });
