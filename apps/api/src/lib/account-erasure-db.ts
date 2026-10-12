import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { accurateConnections, account, auditLogs, dataUsaha, importBatches, memberSeats, notifications, ownershipTransfers, roles, session, subscriptions, user as userTable, userRoles, verification } from "../db/schema";
import { ANON_EMAIL_DOMAIN, anonymizedEmail, anonymizedName, classifyFk, emailDigest, isAnonymizedEmail, scrubJson, type FkInfo } from "./account-erasure";

// § Fase 189H, ADR-0045 — orkestrasi DB hapus permanen & anonimisasi. Semua perubahan dalam SATU transaksi dengan kunci baris (urut id); kelayakan dihitung ULANG di dalam transaksi
// (preview hanya informasi). Kelayakan hapus permanen FAIL-CLOSED: dibaca dari katalog Postgres (semua FK ke "user"), jadi tabel/FK baru otomatis ikut memblokir tanpa daftar manual.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

export type EraseKind = "delete" | "anonymize";
export type EraseReason =
  | { code: "NOT_FOUND" }
  | { code: "SELF" }
  | { code: "STAFF_ACCOUNT" }
  | { code: "ALREADY_ANONYMIZED" }
  | { code: "IMPORT_RUNNING" }
  | { code: "HAS_RECORDS"; tables: string[] };
export type EraseTarget = { id: string; name: string; email: string; phone: string | null; whatsapp: string | null; reasons: EraseReason[] };

/** Semua FK (satu kolom) yang mereferensikan `refTable.id`, dari katalog Postgres. */
export async function listFks(executor: Executor, refTable: string): Promise<FkInfo[]> {
  const res = await executor.execute<{ tbl: string; col: string; del: string }>(sql`
    SELECT cl.relname AS tbl, a.attname AS col, c.confdeltype AS del
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND c.confrelid = to_regclass(${`public."${refTable}"`})
  `);
  return res.map((r) => ({ table: r.tbl, column: r.col, deleteType: r.del }));
}

/** Jumlah baris per id pada tiap FK yang MEMBLOKIR → Map<id, Set<nama tabel>> (hanya id yang punya baris). */
async function blockingTables(executor: Executor, fks: FkInfo[], ids: string[], skip: (fk: FkInfo) => boolean = () => false): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (ids.length === 0) return out;
  for (const fk of fks) {
    if (classifyFk(fk) !== "blocking" || skip(fk)) continue;
    const rows = await executor.execute<{ id: string }>(sql`SELECT DISTINCT ${sql.identifier(fk.column)}::text AS id FROM ${sql.identifier(fk.table)} WHERE ${sql.identifier(fk.column)}::text IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
    for (const r of rows) out.set(r.id, (out.get(r.id) ?? new Set()).add(fk.table));
  }
  return out;
}

/** Data Usaha milik `ownerIds` yang KOSONG (tanpa catatan apa pun yang merujuknya, tanpa koneksi Accurate/hitungan import) → boleh ikut dihapus. */
async function emptyDataUsaha(executor: Executor, ownerIds: string[]) {
  const owned = await executor.select({ id: dataUsaha.id, userId: dataUsaha.userId, connectionId: dataUsaha.accurateConnectionId, rows: dataUsaha.cumulativeSuccessfulRowCount, formulas: dataUsaha.formulaLastNumber }).from(dataUsaha).where(inArray(dataUsaha.userId, ownerIds));
  const refs = await blockingTables(executor, await listFks(executor, "data_usaha"), owned.map((d) => d.id));
  const empty: { id: string; userId: string }[] = [];
  const notEmpty = new Map<string, Set<string>>(); // ownerId → tabel
  for (const d of owned) {
    const tables = new Set(refs.get(d.id) ?? []);
    if (d.connectionId || d.rows > 0 || d.formulas > 0) tables.add("data_usaha");
    if (tables.size === 0) empty.push({ id: d.id, userId: d.userId });
    else notEmpty.set(d.userId, new Set([...(notEmpty.get(d.userId) ?? []), ...tables]));
  }
  return { empty, notEmpty };
}

export async function evaluateErasure(executor: Executor, kind: EraseKind, userIds: string[], actorId: string, opts: { lock?: boolean } = {}): Promise<{ requested: number; targets: EraseTarget[]; missing: string[] }> {
  const ids = [...new Set(userIds)];
  const base = executor.select({ id: userTable.id, name: userTable.name, email: userTable.email, phone: userTable.phone, whatsapp: userTable.whatsapp }).from(userTable).where(inArray(userTable.id, ids)).orderBy(userTable.id);
  const rows = opts.lock ? await base.for("update") : await base;
  const found = rows.map((r) => r.id);
  const roleRows = found.length ? await executor.select({ userId: userRoles.userId, name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(inArray(userRoles.userId, found)) : [];
  const staff = new Set(roleRows.filter((r) => r.name === "admin" || r.name === "staff").map((r) => r.userId));

  // import berjalan: batch milik akun ATAU pada Data Usaha milik akun (status "processing")
  const running = new Set<string>();
  if (found.length) {
    const byUser = await executor.select({ id: importBatches.userId }).from(importBatches).where(and(eq(importBatches.status, "processing"), inArray(importBatches.userId, found)));
    const byOwner = await executor.select({ id: dataUsaha.userId }).from(importBatches).innerJoin(subscriptions, eq(subscriptions.id, importBatches.subscriptionId)).innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId)).where(and(eq(importBatches.status, "processing"), inArray(dataUsaha.userId, found)));
    for (const r of [...byUser, ...byOwner]) running.add(r.id);
  }

  let records = new Map<string, Set<string>>();
  if (kind === "delete" && found.length) {
    const du = await emptyDataUsaha(executor, found);
    records = await blockingTables(executor, await listFks(executor, "user"), found, (fk) => fk.table === "data_usaha" && fk.column === "user_id");
    for (const [owner, tables] of du.notEmpty) records.set(owner, new Set([...(records.get(owner) ?? []), ...tables]));
  }

  const targets: EraseTarget[] = rows.map((r) => {
    const reasons: EraseReason[] = [];
    if (r.id === actorId) reasons.push({ code: "SELF" });
    if (staff.has(r.id)) reasons.push({ code: "STAFF_ACCOUNT" });
    if (kind === "anonymize" && isAnonymizedEmail(r.email)) reasons.push({ code: "ALREADY_ANONYMIZED" });
    if (running.has(r.id)) reasons.push({ code: "IMPORT_RUNNING" });
    const tables = records.get(r.id);
    if (tables && tables.size > 0) reasons.push({ code: "HAS_RECORDS", tables: [...tables].sort() });
    return { ...r, reasons };
  });
  return { requested: ids.length, targets, missing: ids.filter((id) => !found.includes(id)) };
}

const escapePg = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Hapus PII akun-akun ini dari `audit_logs.changes` (entri tentang akun itu, dan entri lain yang menyebut email/teleponnya, mis. undangan seat & akun Accurate). */
async function scrubAudit(tx: Tx, victims: EraseTarget[]) {
  const replacements = victims.flatMap((v) => [
    { from: v.email, to: anonymizedEmail(v.id) },
    ...(v.phone ? [{ from: v.phone, to: "[dihapus]" }] : []),
    ...(v.whatsapp && v.whatsapp !== v.phone ? [{ from: v.whatsapp, to: "[dihapus]" }] : []),
  ]);
  // (a) entri tentang akun itu sendiri: buang kunci kontak/identitas
  await tx.execute(sql`UPDATE audit_logs SET changes = changes - ARRAY['email','name','phone','whatsapp','companyName'] WHERE entity_type = 'user' AND entity_id IN (${sql.join(victims.map((v) => sql`${v.id}`), sql`, `)}) AND jsonb_typeof(changes) = 'object'`);
  // (b) entri lain yang menyebut email/telepon akun itu (satu pindaian)
  const alternation = replacements.map((r) => escapePg(r.from)).join("|");
  const hits = await tx.execute<{ id: string; changes: unknown }>(sql`SELECT id, changes FROM audit_logs WHERE changes IS NOT NULL AND changes::text ~* ${alternation}`);
  for (const hit of hits) await tx.update(auditLogs).set({ changes: scrubJson(hit.changes, replacements) }).where(eq(auditLogs.id, hit.id));
}

/** Email/teleponnya yang tersimpan di baris lain (undangan seat, tujuan transfer, email akun Accurate, token verifikasi) → dianonimkan/dibuang. */
async function scrubReferences(tx: Tx, victims: EraseTarget[]) {
  for (const v of victims) {
    const anon = anonymizedEmail(v.id);
    await tx.update(memberSeats).set({ invitedEmail: anon }).where(sql`lower(${memberSeats.invitedEmail}) = ${v.email.toLowerCase()}`);
    await tx.update(ownershipTransfers).set({ toEmail: anon }).where(sql`lower(${ownershipTransfers.toEmail}) = ${v.email.toLowerCase()}`);
    await tx.update(accurateConnections).set({ accurateUserEmail: anon }).where(sql`lower(${accurateConnections.accurateUserEmail}) = ${v.email.toLowerCase()}`);
    await tx.delete(verification).where(sql`lower(${verification.identifier}) = ${v.email.toLowerCase()}`);
  }
}

const snapshot = (kind: EraseKind, v: EraseTarget, reason: string, bulk: boolean) => ({ kind, emailDigest: emailDigest(v.email), reason, bulk });

/** Terapkan hapus permanen/anonimisasi untuk akun yang LAYAK (dihitung ulang dengan kunci baris). Akun lain dilewati beserta alasannya. */
export async function applyErasure(kind: EraseKind, userIds: string[], actorId: string, reason: string) {
  return db.transaction(async (tx) => {
    const plan = await evaluateErasure(tx, kind, userIds, actorId, { lock: true });
    const victims = plan.targets.filter((t) => t.reasons.length === 0);
    if (victims.length === 0) return { ...plan, victims };
    const ids = victims.map((v) => v.id);
    const bulk = plan.requested > 1;

    // 1) jejak: scrub PII lama LEBIH DULU, lalu tulis audit baru (hanya digest email — bukan email)
    await scrubAudit(tx, victims);
    await scrubReferences(tx, victims);
    await tx.insert(auditLogs).values(victims.map((v) => ({ entityType: "user", entityId: v.id, action: kind === "delete" ? "delete" : "anonymize", changes: snapshot(kind, v, reason, bulk), actorId })));

    if (kind === "delete") {
      const du = await emptyDataUsaha(tx, ids);
      if (du.empty.length) await tx.delete(dataUsaha).where(inArray(dataUsaha.id, du.empty.map((d) => d.id)));
      await tx.update(auditLogs).set({ actorId: null }).where(inArray(auditLogs.actorId, ids)); // jejak pelaku di-NULL-kan, entri audit tetap
      // cascade: session, account, user_roles, notifications
      await tx.delete(userTable).where(inArray(userTable.id, ids));
    } else {
      for (const v of victims) {
        await tx.update(userTable).set({ name: anonymizedName(v.id), email: anonymizedEmail(v.id), phone: null, whatsapp: null, companyName: null, image: null, disabled: true, emailVerified: false }).where(eq(userTable.id, v.id));
      }
      await tx.delete(session).where(inArray(session.userId, ids));
      await tx.delete(account).where(inArray(account.userId, ids));
      await tx.delete(notifications).where(inArray(notifications.userId, ids));
    }
    return { ...plan, victims };
  });
}

export { ANON_EMAIL_DOMAIN };
