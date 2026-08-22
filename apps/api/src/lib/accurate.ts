import { env } from "./env";

// § architecture-accurate-integration.md § 1 — Authorization Code Grant,
// terverifikasi 2026-08-19 via https://accurate.id/api-integration/oauth/.
const AUTHORIZE_URL = "https://account.accurate.id/oauth/authorize";
const TOKEN_URL = "https://account.accurate.id/oauth/token";
const ACCOUNT_API_BASE = "https://account.accurate.id/api";

// § architecture-accurate-integration.md § 5 — Accurate bisa balas HTTP 200
// DENGAN body {s: false, d: [...pesan error]} untuk kegagalan LOGIS (bukan
// cuma lewat HTTP status code). Envelope ini dipakai SEMUA endpoint
// Accurate (account API maupun data API), jadi WAJIB selalu di-parse,
// jangan cuma cek `res.ok`.
export type AccurateEnvelope<T> = { s: boolean; d: T };

export class AccurateApiError extends Error {
  constructor(
    message: string,
    public httpStatus: number,
  ) {
    super(message);
    this.name = "AccurateApiError";
  }
}

export async function parseAccurateEnvelope<T>(res: Response): Promise<T> {
  let body: AccurateEnvelope<T> | undefined;
  try {
    body = (await res.json()) as AccurateEnvelope<T>;
  } catch {
    if (!res.ok) throw new AccurateApiError(`Accurate API gagal: HTTP ${res.status}`, res.status);
    throw new AccurateApiError("Accurate API mengembalikan body non-JSON", res.status);
  }
  if (!res.ok || body.s === false) {
    const detail = Array.isArray(body.d) ? body.d.join("; ") : String(body.d ?? "");
    throw new AccurateApiError(detail || `Accurate API gagal: HTTP ${res.status}`, res.status);
  }
  return body.d;
}

// ⚠️ Endpoint SAVE/mutasi (`save.do`, kemungkinan `bulk-save.do` juga —
// belum diverifikasi) TIDAK taruh record hasil di `d` seperti endpoint
// list/query — `d` di situ cuma pesan status
// (`["Faktur Pembelian \"PI...\" berhasil disimpan"]`). Record hasil ADA
// di field TERPISAH bernama **`r`**. Ditemukan via test call NYATA
// 2026-08-19 (§ lessons-learned.md). JANGAN pakai `parseAccurateEnvelope`
// biasa untuk endpoint save/mutasi — pakai ini.
export async function parseAccurateSaveEnvelope<T>(res: Response): Promise<T> {
  let body: { s: boolean; d?: unknown; r?: T } | undefined;
  try {
    body = (await res.json()) as { s: boolean; d?: unknown; r?: T };
  } catch {
    throw new AccurateApiError(`Accurate API mengembalikan body non-JSON (HTTP ${res.status})`, res.status);
  }
  if (!body || !res.ok || body.s === false) {
    const detail = Array.isArray(body?.d) ? body.d.join("; ") : String(body?.d ?? "");
    throw new AccurateApiError(detail || `Accurate API gagal: HTTP ${res.status}`, res.status);
  }
  if (body.r === undefined) {
    throw new AccurateApiError("Accurate API sukses tapi tidak ada field 'r' (record hasil)", res.status);
  }
  return body.r;
}

export type AccurateTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // detik
  token_type: string;
};

export function getAuthorizeUrl(state: string, scopes: string[]): string {
  if (!env.ACCURATE_CLIENT_ID) {
    throw new Error("ACCURATE_CLIENT_ID belum diisi — lihat .env.example");
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.ACCURATE_CLIENT_ID,
    redirect_uri: env.ACCURATE_REDIRECT_URI,
    scope: scopes.join(" "),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(): string {
  if (!env.ACCURATE_CLIENT_ID || !env.ACCURATE_CLIENT_SECRET) {
    throw new Error("ACCURATE_CLIENT_ID/SECRET belum diisi — lihat .env.example");
  }
  return `Basic ${Buffer.from(`${env.ACCURATE_CLIENT_ID}:${env.ACCURATE_CLIENT_SECRET}`).toString("base64")}`;
}

export async function exchangeCodeForToken(code: string): Promise<AccurateTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.ACCURATE_REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    throw new Error(`Accurate token exchange gagal: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<AccurateTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<AccurateTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw new Error(`Accurate token refresh gagal: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<AccurateTokenResponse>;
}

// § architecture-accurate-integration.md § "Sesi Data Usaha" — TERVERIFIKASI
// 2026-08-19 (parameter dari api-docs.do, contoh response dari
// accurate.id/api-integration/api-example/). Dipanggil ke account.accurate.id
// (BUKAN host dinamis — itu baru didapat SETELAH openDatabase berhasil).
export type AccurateDatabase = {
  id: number;
  alias: string;
  trial: boolean;
  expired: boolean;
};

export async function listDatabases(accessToken: string): Promise<AccurateDatabase[]> {
  const res = await fetch(`${ACCOUNT_API_BASE}/db-list.do`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseAccurateEnvelope<AccurateDatabase[]>(res);
}

export type AccurateSession = {
  session: string;
  host: string;
  dataVersion: number;
  licenseEnd: string;
};

// ⚠️ open-db.do TIDAK ikut pola envelope generik `{s, d: T}` — dikonfirmasi
// via test call NYATA 2026-08-19: response asli
// `{s: true, d: ["Proses Berhasil Dilakukan"], session, host, dataVersion,
// licenseEnd, ...}` — `session`/`host`/dst adalah SIBLING dari `d`, BUKAN
// nested di dalamnya (beda dari db-list.do yang taruh payload di `d`
// sesuai pola pada umumnya). Halaman contoh publik yang dipakai buat
// verifikasi awal (accurate.id/api-integration/api-example/) menampilkan
// versi TANPA field `d`, jadi kelewatan sampai dites nyata. JANGAN pakai
// `parseAccurateEnvelope` di sini — parse manual dari body top-level.
export async function openDatabase(accessToken: string, dbId: number): Promise<AccurateSession> {
  const res = await fetch(`${ACCOUNT_API_BASE}/open-db.do?${new URLSearchParams({ id: String(dbId) })}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json()) as { s: boolean; d?: unknown } & Partial<AccurateSession>;
  if (!res.ok || body.s === false || !body.session || !body.host) {
    const detail = Array.isArray(body.d) ? body.d.join("; ") : String(body.d ?? "");
    throw new AccurateApiError(detail || `open-db.do gagal: HTTP ${res.status}`, res.status);
  }
  return {
    session: body.session,
    host: body.host,
    dataVersion: body.dataVersion!,
    licenseEnd: body.licenseEnd!,
  };
}
