import { toCsv } from "./admin-insights";
import type { TrendPoint } from "./admin-insights";
import { moduleLabel } from "./module-catalog";
import { displayPhone } from "./phone";

// § Fase 189C, D5 — pembangun CSV ekspor Insight (MURNI, tanpa DB). Data pribadi: pemanggil WAJIB sudah lolos izin `insights.view` dan MENCATAT audit ekspor.
// Telepon/WhatsApp diekspor format lokal (08…) supaya tidak berawalan "+" (yang akan diberi apostrof oleh `csvCell` untuk mencegah injeksi rumus); nomor internasional tetap
// berawalan "+" → diberi apostrof (jarang, disengaja demi keamanan sel).

/** Batas baris ekspor (D5: unduh langsung, ringan). Melebihi batas → dipotong dan ditandai `truncated`. */
export const EXPORT_MAX_ROWS = 10_000;

export function capRows<T>(rows: T[], max = EXPORT_MAX_ROWS): { rows: T[]; truncated: boolean } {
  return rows.length > max ? { rows: rows.slice(0, max), truncated: true } : { rows, truncated: false };
}

export function formatLocalDateTime(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => p.find((x) => x.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export type ExportReport = "customers" | "feature-users" | "new" | "expiring" | "connection-history" | "trend";
type Csv = { header: string[]; rows: (string | number | null)[][] };
type Owner = { name: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null };

const ownerHeader = ["Nama", "Email", "Perusahaan", "Telepon", "WhatsApp"];
const ownerCells = (o: Owner): (string | null)[] => [o.name, o.email, o.companyName, displayPhone(o.phone), displayPhone(o.whatsapp)];

const INTERVAL_LABEL: Record<string, string> = { monthly: "Bulanan", yearly: "Tahunan" };
const RENEWAL_LABEL = { terbit: "Tagihan sudah terbit", terjadwal: "Terjadwal (terbit otomatis H-7)", tidak_terjadwal: "Belum terjadwal" } as const;
const DISCONNECT_REASON: Record<string, string> = { salah_database: "Salah database", salah_akun: "Salah akun Accurate", lainnya: "Lainnya" };
const ACTION_LABEL: Record<string, string> = {
  connect_accurate: "Sambung",
  select_database: "Pilih database",
  confirm_database: "Konfirmasi database",
  reset_database: "Pilih yang lain",
  disconnect_accurate: "Putus koneksi",
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Kalimat peristiwa riwayat Data Usaha untuk CSV (isi sejalan dengan `apps/web/lib/data-usaha-history.ts`). */
export function connectionEventText(action: string, changes: unknown): string {
  const c = obj(changes);
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" — ");
  switch (action) {
    case "connect_accurate":
      return join(c.via === "attach" ? "Memakai akun Accurate yang sudah terhubung" : "Menyambungkan akun Accurate", str(c.accountEmail));
    case "select_database":
      return `Memilih database "${str(c.alias) ?? str(c.accurateDbId) ?? "?"}"`;
    case "confirm_database":
      return `Mengonfirmasi database "${str(c.alias) ?? str(c.accurateDbId) ?? "?"}"`;
    case "reset_database":
      return `Memilih database yang lain (sebelumnya "${str(c.previousAlias) ?? str(c.previousDbId) ?? "?"}")`;
    case "disconnect_accurate": {
      const reason = obj(c.reason);
      const code = str(reason.code);
      return join(
        c.removedAccount === true ? "Koneksi diputus admin beserta akun Accurate" : "Koneksi diputus admin",
        str(c.previousAccurateDbAlias) ? `Database: ${str(c.previousAccurateDbAlias)}` : null,
        code ? `Alasan: ${DISCONNECT_REASON[code] ?? code}` : null,
        str(reason.note) ? `Catatan: ${str(reason.note)}` : null,
      );
    }
    default:
      return action;
  }
}

export function customersCsv(
  items: { name: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null; disabled: boolean; internalReason: "role" | "flag" | null; kind: "pemilik" | "tambahan" | "belum"; ownedDataUsaha: number; connectedDataUsaha: number; activeFeatures: string[]; nearestEndAt: Date | null; createdAt: Date }[],
  tz: string,
): Csv {
  return {
    header: [...ownerHeader, "Tipe", "Jenis akun", "Nonaktif", "Data Usaha", "Terhubung Accurate", "Fitur aktif", "Berakhir terdekat", "Terdaftar"],
    rows: items.map((i) => [
      ...ownerCells(i),
      i.internalReason === "flag" ? "Internal" : i.internalReason === "role" ? "Internal (admin)" : "Komersil",
      i.kind === "pemilik" ? "Pemilik" : i.kind === "tambahan" ? "Tambahan" : "Belum punya Data Usaha",
      i.disabled ? "Ya" : "Tidak",
      i.ownedDataUsaha,
      i.connectedDataUsaha,
      i.activeFeatures.map(moduleLabel).join("; "),
      formatLocalDateTime(i.nearestEndAt, tz),
      formatLocalDateTime(i.createdAt, tz),
    ]),
  };
}

export function featureUsersCsv(
  featureLabel: string,
  items: { owner: Owner; dataUsahaName: string; planName: string; startAt: Date | null; endAt: Date | null; renewalInterval: string | null }[],
  tz: string,
): Csv {
  return {
    header: ["Fitur", ...ownerHeader, "Data Usaha", "Paket", "Mulai", "Berakhir", "Perpanjangan terjadwal"],
    rows: items.map((i) => [featureLabel, ...ownerCells(i.owner), i.dataUsahaName, i.planName, formatLocalDateTime(i.startAt, tz), formatLocalDateTime(i.endAt, tz), i.renewalInterval ? (INTERVAL_LABEL[i.renewalInterval] ?? i.renewalInterval) : "Tidak"]),
  };
}

export function newCsv(
  items: { owner: Owner; isNewCustomer: boolean; firstStartAt: Date; features: { label: string; dataUsahaName: string; startAt: Date; endAt: Date | null }[] }[],
  tz: string,
): Csv {
  return {
    header: [...ownerHeader, "Pelanggan baru", "Mulai pertama", "Fitur", "Data Usaha", "Mulai", "Berakhir"],
    rows: items.flatMap((i) => i.features.map((f) => [...ownerCells(i.owner), i.isNewCustomer ? "Ya" : "Tidak", formatLocalDateTime(i.firstStartAt, tz), f.label, f.dataUsahaName, formatLocalDateTime(f.startAt, tz), formatLocalDateTime(f.endAt, tz)])),
  };
}

export function expiringCsv(
  items: { owner: Owner; subscriptions: { label: string; dataUsahaName: string; endAt: Date; daysLeft: number; renewal: { status: "terbit" | "terjadwal" | "tidak_terjadwal"; invoiceNumber?: string; amountDue?: number } }[] }[],
  tz: string,
): Csv {
  return {
    header: [...ownerHeader, "Fitur", "Data Usaha", "Berakhir", "Sisa hari", "Status tagihan perpanjangan", "No. invoice", "Jumlah tagihan"],
    rows: items.flatMap((i) =>
      i.subscriptions.map((s) => [...ownerCells(i.owner), s.label, s.dataUsahaName, formatLocalDateTime(s.endAt, tz), s.daysLeft, RENEWAL_LABEL[s.renewal.status], s.renewal.invoiceNumber ?? null, s.renewal.amountDue ?? null]),
    ),
  };
}

export function connectionHistoryCsv(
  items: { action: string; changes: unknown; createdAt: Date; actor: { name: string } | null; dataUsaha: { name: string }; owner: Owner }[],
  tz: string,
): Csv {
  return {
    header: ["Waktu", "Data Usaha", ...ownerHeader, "Aksi", "Keterangan", "Pelaku"],
    rows: items.map((i) => [formatLocalDateTime(i.createdAt, tz), i.dataUsaha.name, ...ownerCells(i.owner), ACTION_LABEL[i.action] ?? i.action, connectionEventText(i.action, i.changes), i.actor?.name ?? null]),
  };
}

export function trendCsv(points: TrendPoint[]): Csv {
  return { header: ["Bulan", "Nilai", "Bulan sebelumnya", "Selisih", "Persen"], rows: points.map((p) => [p.month, p.value, p.previous, p.delta, p.percent]) };
}

export const csvFile = (csv: Csv): string => toCsv(csv.header, csv.rows);
