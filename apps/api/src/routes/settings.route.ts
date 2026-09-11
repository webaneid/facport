import { Elysia, t } from "elysia";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { settings } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { IMPORT_RETENTION_SETTING_KEY, MAX_IMPORT_RETENTION_DAYS } from "../lib/import-retention";
import {
  MANUAL_INPUT_SECONDS_SETTING_KEY,
  MIN_MANUAL_INPUT_SECONDS_PER_ROW,
  MAX_MANUAL_INPUT_SECONDS_PER_ROW,
} from "../lib/manual-input-estimate";
import {
  TRIAL_MAX_ROWS_SETTING_KEY,
  MIN_TRIAL_MAX_ROWS,
  MAX_TRIAL_MAX_ROWS,
  TRIAL_DURATION_DAYS_SETTING_KEY,
  MIN_TRIAL_DURATION_DAYS,
  MAX_TRIAL_DURATION_DAYS,
} from "../lib/trial";
import { isValidQrisPayload } from "../lib/qris-emv";
import { MAX_DEVICES_SETTING_KEY, MIN_MAX_DEVICES_PER_USER, MAX_MAX_DEVICES_PER_USER } from "../lib/session-limit";

// § Fase 16, security review 2026-09-04 (Medium) — `company.bankAccounts`/
// `company.qrisAccounts` dikonsumsi `orders.route.ts` dengan cast `as
// BankAccount[]` TANPA runtime check. Value cacat (bukan array/field
// hilang) akan LOLOS lewat `PUT /settings` generik (`value: t.Unknown()`)
// dan baru meledak (500) saat CUSTOMER coba bayar — bukan saat admin
// simpan. Validasi runtime di sini (pola sama `retentionItem` di bawah),
// GAGAL di titik SIMPAN (admin), bukan titik PAKAI (customer).
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidBankAccounts(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (a) => isRecord(a) && typeof a.id === "string" && typeof a.bankName === "string" && typeof a.accountNumber === "string" && typeof a.accountName === "string",
    )
  );
}

// § ketemu 2026-09-06 — admin salin payload EMV dari alat scan/decode QR
// eksternal ke `<Textarea>` (§ settings/page.tsx) HAMPIR SELALU ikut bawa
// whitespace/newline (di awal, akhir, atau keduanya) — payload yang
// SEBENARNYA valid ditolak `isValidQrisPayload` (regex `$`-anchored,
// nol toleransi) dengan pesan generik "Gagal menyimpan pengaturan",
// tanpa petunjuk kenapa. Trim SEBELUM validasi (di sini) DAN sebelum
// disimpan (§ PUT handler di bawah, `normalizeQrisAccounts`) — root
// cause diperbaiki, bukan cuma pesan errornya.
function isValidQrisAccounts(value: unknown): { ok: true } | { ok: false; invalidId?: string } {
  if (!Array.isArray(value)) return { ok: false };
  for (const a of value) {
    if (!isRecord(a) || typeof a.id !== "string" || typeof a.name !== "string" || typeof a.imageUrl !== "string" || typeof a.isDynamic !== "boolean") {
      return { ok: false };
    }
    if (a.isDynamic) {
      // § payload EMV WAJIB valid SEBELUM disimpan kalau ditandai dinamis
      // — cegah bug "QR ditandai dinamis tapi nominal tidak ter-inject"
      // (§ qris-emv.ts fix terkait) ketahuan saat admin simpan, bukan
      // saat customer generate QR.
      if (typeof a.emvPayload !== "string" || !isValidQrisPayload(a.emvPayload.trim())) {
        return { ok: false, invalidId: a.id };
      }
    }
  }
  return { ok: true };
}

// § trim SETIAP `emvPayload` (dan `imageUrl`/`name`, sekalian — sumber
// whitespace sama, copy-paste) SEBELUM disimpan — supaya nilai yang
// LOLOS validasi (di atas, sudah dicek versi trim-nya) adalah PERSIS
// nilai yang tersimpan, bukan versi mentah yang masih ada whitespace-nya.
function normalizeQrisAccounts(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((a) =>
    isRecord(a) && typeof a.emvPayload === "string" ? { ...a, emvPayload: a.emvPayload.trim() } : a,
  );
}

// § Fase 12, ADR-0017 — allowlist EKSPLISIT untuk `GET /settings/public`
// (endpoint TANPA auth sama sekali, dipakai landing page & tag favicon).
// WAJIB tambah key baru ke sini secara sadar — JANGAN pernah ganti endpoint
// ini jadi "return semua row" (persis Critical finding Fase 00: `GET
// /settings` pernah bocor semua row tanpa guard).
// § Fase 43 (audit timezone 2026-09-06) — `company.timezone` ditambah ke
// allowlist: nilainya BUKAN rahasia (cuma nama zona IANA, mis.
// "Asia/Jakarta"), dan WAJIB bisa diakses TANPA login supaya halaman
// publik (`landing/pay/[orderId]`, dipakai customer TANPA sesi) bisa
// format tanggal konsisten dengan halaman yang sudah login — lihat
// `apps/web/components/company-timezone-provider.tsx`.
// § Fase 103 (2026-09-11) — `company.logoLinkUrl`/`company.copyrightStartYear`
// ditambah: logo header (`company.logo`, reuse field lama Fase 12 yang
// sejak 2026-09-07 tidak dipakai di sidebar) + footer copyright di
// KEDUA layout `(protected)` (admin & app) — dua-duanya fetch lewat
// `getPublicSettings()` (endpoint ini), bukan `GET /settings` yang
// butuh auth.
const PUBLIC_SETTINGS_KEYS = [
  "company.name",
  "company.logo",
  "company.logoLinkUrl",
  "company.favicon",
  "company.timezone",
  "company.copyrightStartYear",
] as const;

// § Fase 103 — validasi ringan `company.logoLinkUrl`: WAJIB kosong atau
// diawali http(s):// (dipakai langsung sebagai `<a href>` target="_blank"
// di semua surface, cegah skema aneh seperti `javascript:`).
function isValidLogoLinkUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed === "" || /^https?:\/\//i.test(trimmed);
}

const MIN_COPYRIGHT_START_YEAR = 2000;

// § Fase 12, Medium finding security review — `company.logo`/`company.favicon`
// HARUS selalu berupa URL bucket public hasil `branding.route.ts` (file
// di-magic-bytes-check + di-re-encode ulang lewat sharp sebelum disimpan).
// `PUT /settings` generik terima `value: t.Unknown()` untuk key APA PUN —
// tanpa blokir ini, pemegang permission `settings.update` bisa menimpa
// kedua key ini dengan value bebas (bukan URL, bentuk object salah, dst)
// lewat jalur ini, bypass validasi/re-encode di endpoint upload, padahal
// value-nya di-echo APA ADANYA oleh `GET /settings/public` (tanpa auth) ke
// `<img src>`/favicon metadata di semua surface.
const BRANDING_ONLY_KEYS = ["company.logo", "company.favicon"] as const;

export const settingsRoute = new Elysia({ prefix: "/settings" })
  .use(permissionPlugin)
  // § Fase 12 — publik BETULAN (dipakai landing page tanpa login, dan tag
  // favicon di SEMUA halaman termasuk yang belum login), TANPA `auth`/
  // `permission` macro sama sekali. Path statis "/public" tidak konflik
  // dengan "/" di bawah (bukan wildcard/param route).
  .get("/public", async () => {
    const rows = await db
      .select()
      .from(settings)
      .where(inArray(settings.key, [...PUBLIC_SETTINGS_KEYS]));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  })
  .get(
    "/",
    async ({ query }) => {
      const rows = query.group
        ? await db.select().from(settings).where(eq(settings.group, query.group))
        : await db.select().from(settings);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    {
      // Cek 401-only (§ Critical finding security review Fase 00 — GET ini
      // sebelumnya TANPA guard sama sekali, bocorin semua row settings ke
      // siapa pun). BELUM ada pemisahan public/admin settings — kalau nanti
      // butuh field yang memang publik (mis. company.name buat landing
      // page), buat endpoint terpisah `GET /settings/public`, jangan
      // longgarin endpoint ini.
      auth: true,
      query: t.Object({ group: t.Optional(t.String()) }),
    },
  )
  .put(
    "/",
    async ({ body, user, set }) => {
      // § Fase 10, architecture-subscription.md § "Retensi Data Import" —
      // key ini SATU-SATUNYA pengecualian di sistem settings yang
      // fleksibel/tanpa-skema ini: nilainya langsung dipakai job
      // penghapusan data OTOMATIS (`PURGE_OLD_IMPORTS`), jadi WAJIB
      // divalidasi server-side (bukan cuma form frontend) — batas 7 hari
      // adalah aturan bisnis TETAP (data client sensitif), bukan saran.
      const retentionItem = body.find((b) => b.key === IMPORT_RETENTION_SETTING_KEY);
      if (retentionItem) {
        const days = Number(retentionItem.value);
        if (!Number.isInteger(days) || days < 1 || days > MAX_IMPORT_RETENTION_DAYS) {
          set.status = 400;
          return { code: "INVALID_RETENTION_DAYS", maxDays: MAX_IMPORT_RETENTION_DAYS };
        }
      }

      // § dipakai LANGSUNG untuk hitung "estimasi efisiensi waktu kerja"
      // yang ditampilkan ke customer (`GET /me/stats`) — validasi server
      // WAJIB, sama alasannya dengan retensi di atas (nilai cacat akan
      // menghasilkan angka yang salah/menyesatkan ke SEMUA customer).
      const manualInputSecondsItem = body.find((b) => b.key === MANUAL_INPUT_SECONDS_SETTING_KEY);
      if (manualInputSecondsItem) {
        const seconds = Number(manualInputSecondsItem.value);
        if (!Number.isInteger(seconds) || seconds < MIN_MANUAL_INPUT_SECONDS_PER_ROW || seconds > MAX_MANUAL_INPUT_SECONDS_PER_ROW) {
          set.status = 400;
          return {
            code: "INVALID_MANUAL_INPUT_SECONDS",
            minSeconds: MIN_MANUAL_INPUT_SECONDS_PER_ROW,
            maxSeconds: MAX_MANUAL_INPUT_SECONDS_PER_ROW,
          };
        }
      }

      // § batas baris trial — dipakai LANGSUNG oleh `checkTrialRowBudget()`
      // untuk blokir import begitu kuota trial habis, jadi WAJIB divalidasi
      // server-side (nilai cacat = trial jadi tidak terbatas atau macet).
      const trialMaxRowsItem = body.find((b) => b.key === TRIAL_MAX_ROWS_SETTING_KEY);
      if (trialMaxRowsItem) {
        const maxRows = Number(trialMaxRowsItem.value);
        if (!Number.isInteger(maxRows) || maxRows < MIN_TRIAL_MAX_ROWS || maxRows > MAX_TRIAL_MAX_ROWS) {
          set.status = 400;
          return { code: "INVALID_TRIAL_MAX_ROWS", minRows: MIN_TRIAL_MAX_ROWS, maxRows: MAX_TRIAL_MAX_ROWS };
        }
      }

      const trialDurationDaysItem = body.find((b) => b.key === TRIAL_DURATION_DAYS_SETTING_KEY);
      if (trialDurationDaysItem) {
        const days = Number(trialDurationDaysItem.value);
        if (!Number.isInteger(days) || days < MIN_TRIAL_DURATION_DAYS || days > MAX_TRIAL_DURATION_DAYS) {
          set.status = 400;
          return { code: "INVALID_TRIAL_DURATION_DAYS", minDays: MIN_TRIAL_DURATION_DAYS, maxDays: MAX_TRIAL_DURATION_DAYS };
        }
      }

      // § Fase 106, architecture-user-tambahan.md § Fase A — batas sesi
      // login bersamaan per user, dipakai LANGSUNG oleh
      // `databaseHooks.session.create.before` (lib/auth.ts) tiap kali
      // ada login baru, jadi WAJIB divalidasi server-side (nilai cacat
      // bisa bikin semua user ke-logout terus-terusan kalau kebetulan 0,
      // atau proteksi hilang total kalau angka aneh/negatif).
      const maxDevicesItem = body.find((b) => b.key === MAX_DEVICES_SETTING_KEY);
      if (maxDevicesItem) {
        const maxDevices = Number(maxDevicesItem.value);
        if (!Number.isInteger(maxDevices) || maxDevices < MIN_MAX_DEVICES_PER_USER || maxDevices > MAX_MAX_DEVICES_PER_USER) {
          set.status = 400;
          return { code: "INVALID_MAX_DEVICES", minDevices: MIN_MAX_DEVICES_PER_USER, maxDevices: MAX_MAX_DEVICES_PER_USER };
        }
      }

      if (body.some((b) => (BRANDING_ONLY_KEYS as readonly string[]).includes(b.key))) {
        set.status = 400;
        return { code: "USE_BRANDING_UPLOAD_ENDPOINT" };
      }

      // § Fase 103 — `company.logoLinkUrl` dipakai APA ADANYA sebagai
      // `<a href>` (target="_blank") di header semua surface, TANPA
      // sanitasi lagi di frontend — validasi skema WAJIB di sini.
      const logoLinkUrlItem = body.find((b) => b.key === "company.logoLinkUrl");
      if (logoLinkUrlItem && !isValidLogoLinkUrl(logoLinkUrlItem.value)) {
        set.status = 400;
        return { code: "INVALID_LOGO_LINK_URL" };
      }

      // § Fase 103 — dipakai LANGSUNG untuk hitung rentang tahun footer
      // copyright (§ `apps/web/components/app-shell/footer.tsx`), jadi
      // WAJIB integer wajar (bukan cuma trust form frontend).
      const copyrightStartYearItem = body.find((b) => b.key === "company.copyrightStartYear");
      if (copyrightStartYearItem) {
        const year = Number(copyrightStartYearItem.value);
        const maxYear = new Date().getUTCFullYear() + 1;
        if (!Number.isInteger(year) || year < MIN_COPYRIGHT_START_YEAR || year > maxYear) {
          set.status = 400;
          return { code: "INVALID_COPYRIGHT_START_YEAR", minYear: MIN_COPYRIGHT_START_YEAR, maxYear };
        }
      }

      const bankAccountsItem = body.find((b) => b.key === "company.bankAccounts");
      if (bankAccountsItem && !isValidBankAccounts(bankAccountsItem.value)) {
        set.status = 400;
        return { code: "INVALID_BANK_ACCOUNTS" };
      }

      const qrisAccountsItem = body.find((b) => b.key === "company.qrisAccounts");
      if (qrisAccountsItem) {
        const result = isValidQrisAccounts(qrisAccountsItem.value);
        if (!result.ok) {
          set.status = 400;
          return { code: "INVALID_QRIS_ACCOUNTS", qrisId: result.invalidId };
        }
      }

      for (const { key, value, group } of body) {
        const normalizedValue = key === "company.qrisAccounts" ? normalizeQrisAccounts(value) : value;
        await db
          .insert(settings)
          .values({ key, value: normalizedValue, group, updatedBy: user.id })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: normalizedValue, updatedBy: user.id, updatedAt: new Date() },
          });
      }
      return { updated: body.length };
    },
    {
      permission: "settings.update",
      body: t.Array(
        t.Object({
          key: t.String({ maxLength: 100 }),
          // `t.Unknown()` (BUKAN t.Any()) SENGAJA — settings pakai skema
          // key-value fleksibel (§ architecture-settings.md), tiap key bisa
          // beda tipe (string/uuid/timezone/dst). Unknown tetap WAJIB
          // di-narrow sebelum dipakai sebagai nilai spesifik di service
          // layer lain, beda dari `any` yang bypass typecheck sama sekali.
          value: t.Unknown(),
          group: t.String({ maxLength: 50 }),
        }),
      ),
    },
  );
