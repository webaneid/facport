// § Fase 189D — bagian murni halaman Insight admin: tab dari URL (tidak dipercaya), format selisih/persen,
// kueri ekspor, rentang default, label, dan unduhan CSV berkredensial (galat kuota/rentang jadi pesan, bukan halaman JSON).

export const INSIGHT_TABS = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "pelanggan", label: "Pelanggan" },
  { key: "fitur", label: "Fitur" },
  { key: "akses", label: "Akses" },
  { key: "langganan", label: "Langganan" },
  { key: "tren", label: "Tren & Retensi" },
  { key: "koneksi", label: "Riwayat Koneksi" },
] as const;

export type InsightTab = (typeof INSIGHT_TABS)[number]["key"];

/** Parameter `?tab=` berasal dari URL → hanya kunci yang dikenal yang lolos; selain itu `ringkasan`. */
export function parseTab(value: string | null | undefined): InsightTab {
  const hit = INSIGHT_TABS.find((t) => t.key === value);
  return hit ? hit.key : "ringkasan";
}

const nf = new Intl.NumberFormat("id-ID");
const pf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** Selisih bertanda ("+5", "-3", "0"); `null` (tidak ada pembanding) → "—". */
export function formatDelta(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "-"}${nf.format(Math.abs(n))}`;
}

/** Persen bertanda, maksimal satu desimal gaya id-ID ("+87,5%"); `null` → "—". */
export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0%";
  return `${n > 0 ? "+" : "-"}${pf.format(Math.abs(n))}%`;
}

type QueryValue = string | number | null | undefined;

/** Kueri ekspor/daftar: hanya parameter terisi, urut sesuai masukan, di-encode. */
export function exportQuery(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

/** `days` hari terakhir (inklusif hari ini) menurut zona waktu perusahaan, format YYYY-MM-DD. */
export function defaultRange(days: number, now: Date, timeZone: string): { from: string; to: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const to = fmt.format(now);
  const [y, m, d] = to.split("-").map(Number) as [number, number, number];
  const from = fmt.format(new Date(Date.UTC(y, m - 1, d - (days - 1), 12)));
  return { from, to };
}

export type RenewalStatus = "terbit" | "terjadwal" | "tidak_terjadwal";

export function renewalLabel(status: RenewalStatus): { text: string; tone: "ok" | "info" | "muted" } {
  if (status === "terbit") return { text: "Tagihan sudah terbit", tone: "ok" };
  if (status === "terjadwal") return { text: "Terjadwal terbit otomatis", tone: "info" };
  return { text: "Belum terjadwal", tone: "muted" };
}

export type CustomerKind = "pemilik" | "tambahan" | "belum";

export function kindLabel(kind: CustomerKind): string {
  if (kind === "pemilik") return "Pemilik";
  if (kind === "tambahan") return "Tambahan";
  return "Belum punya Data Usaha";
}

export function typeLabel(reason: "flag" | "role" | null | undefined): string {
  if (reason === "flag") return "Internal";
  if (reason === "role") return "Internal (admin)";
  return "Komersil";
}

const ERROR_MESSAGES: Record<string, string> = {
  EXPORT_QUOTA_EXCEEDED: "Anda sudah mencapai batas ekspor per jam. Coba lagi nanti.",
  RANGE_TOO_LONG: "Rentang tanggal terlalu panjang (maksimal 24 bulan).",
  NETWORK: "Gagal mengunduh: periksa koneksi internet Anda.",
};

export function exportErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? "Gagal mengunduh ekspor. Coba lagi.";
}

export type DownloadResult =
  | { ok: true; rows: number; truncated: boolean; filename: string }
  | { ok: false; status: number; code: string };

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Unduh CSV lewat fetch berkredensial (cookie sesi) → blob; galat server dibaca dari JSON `code`, tidak ada file disimpan. */
export async function downloadCsv(
  url: string,
  opts: { fetchImpl?: typeof fetch; save?: (blob: Blob, filename: string) => void } = {},
): Promise<DownloadResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const save = opts.save ?? saveBlob;
  let res: Response;
  try {
    res = await doFetch(url, { credentials: "include" });
  } catch {
    return { ok: false, status: 0, code: "NETWORK" };
  }
  if (!res.ok) {
    let code = "UNKNOWN";
    try {
      const body = (await res.json()) as { code?: unknown };
      if (typeof body.code === "string") code = body.code;
    } catch {
      /* bukan JSON */
    }
    return { ok: false, status: res.status, code };
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "facport-export.csv";
  const blob = await res.blob();
  save(blob, filename);
  return {
    ok: true,
    rows: Number(res.headers.get("x-export-rows") ?? 0),
    truncated: res.headers.get("x-export-truncated") === "true",
    filename,
  };
}

/** URL ekspor CSV: `base` = `apiBaseUrl` (proxy dev / origin prod), `name` = segmen setelah `/admin/insights/export/`. */
export function exportUrl(base: string, name: string, params: Record<string, QueryValue> = {}): string {
  const qs = exportQuery(params);
  return `${base}/admin/insights/export/${name}${qs ? `?${qs}` : ""}`;
}

// ---------- tipe respons API Insight (bentuk JSON: tanggal = string ISO) ----------
export type OwnerContactInfo = { id: string; name: string; email: string; companyName: string | null; phone: string | null; whatsapp: string | null };

export type SummaryResponse = {
  accounts: { commercial: number; internal: number; disabled: number };
  dataUsaha: { total: number; connected: number };
  customers: { active: number; activeFeatures: number };
  expiring: { owners14: number; subscriptions14: number; owners30: number; subscriptions30: number };
  money: { thisMonth: MoneySplit; thisYear: MoneySplit };
};
export type MoneySplit = { verified: number; adminSettled: number; total: number };

export type CustomerRow = OwnerContactInfo & {
  disabled: boolean;
  internalReason: "flag" | "role" | null;
  kind: CustomerKind;
  ownedDataUsaha: number;
  connectedDataUsaha: number;
  seats: { active: number; invited: number; available: number };
  activeFeatures: string[];
  nearestEndAt: string | null;
  createdAt: string;
};
export type CustomersResponse = { items: CustomerRow[]; total: number; page: number; pageSize: number };

export const INSIGHT_PAGE_SIZE = 20;
export function totalPagesOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export type SeatInfo = {
  id: string;
  status: "available" | "invited" | "active" | "revoked" | string;
  invitedEmail: string | null;
  memberUserId: string | null;
  memberName: string | null;
  memberEmail: string | null;
  seatEndAt: string | null;
  seatExpired: boolean;
};
export type CustomerAccessResponse = {
  owner: { id: string; name: string; email: string; companyName: string | null };
  dataUsaha: { id: string; name: string; seats: SeatInfo[] }[];
};

export function seatStatusLabel(seat: Pick<SeatInfo, "status" | "seatExpired">): string {
  if (seat.status === "active") return seat.seatExpired ? "Aktif (kursi berakhir)" : "Aktif";
  if (seat.status === "invited") return "Diundang";
  if (seat.status === "available") return "Tersedia";
  if (seat.status === "revoked") return "Dicabut";
  return seat.status;
}
