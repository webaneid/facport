// § Fase 189B — menerjemahkan peristiwa riwayat Data Usaha (apps/api `lib/data-usaha-events.ts`) menjadi kalimat untuk admin. Murni (tanpa React) supaya mudah diuji
// dan dipakai ulang oleh laporan "Riwayat Koneksi" (189D). Tipe `changes` tidak dijamin (JSONB) → semua dibaca defensif.

export type DataUsahaEvent = { id: string; action: string; changes: unknown; actorName: string | null; createdAt: string | Date };

export const DISCONNECT_REASON_LABELS: Record<string, string> = {
  salah_database: "Salah database",
  salah_akun: "Salah akun Accurate",
  lainnya: "Lainnya",
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const who = (by: unknown) => (by === "admin" ? "admin" : "pemilik");

export function describeDataUsahaEvent(event: DataUsahaEvent): { title: string; detail: string | null; tone: "info" | "warning" | "danger" } {
  const c = obj(event.changes);
  switch (event.action) {
    case "connect_accurate": {
      const email = str(c.accountEmail);
      return { title: c.via === "attach" ? "Memakai akun Accurate yang sudah terhubung" : "Menyambungkan akun Accurate", detail: email ? `Akun: ${email}` : null, tone: "info" };
    }
    case "select_database":
      return { title: `Memilih database "${str(c.alias) ?? str(c.accurateDbId) ?? "?"}"`, detail: null, tone: "info" };
    case "confirm_database":
      return { title: `Mengonfirmasi database "${str(c.alias) ?? str(c.accurateDbId) ?? "?"}"`, detail: null, tone: "info" };
    case "reset_database":
      return { title: "Memilih database yang lain", detail: `Sebelumnya: "${str(c.previousAlias) ?? str(c.previousDbId) ?? "?"}" (koreksi oleh pemilik)`, tone: "warning" };
    case "disconnect_accurate": {
      const reason = obj(c.reason);
      const code = str(reason.code);
      const parts = [
        str(c.previousAccurateDbAlias) ? `Database: ${str(c.previousAccurateDbAlias)}` : null,
        code ? `Alasan: ${DISCONNECT_REASON_LABELS[code] ?? code}` : null,
        str(reason.note) ? `Catatan: ${str(reason.note)}` : null,
      ].filter(Boolean);
      return { title: c.removedAccount === true ? "Koneksi diputus admin beserta akun Accurate" : "Koneksi diputus admin", detail: parts.length ? parts.join(" · ") : null, tone: "danger" };
    }
    case "invite_seat":
      return { title: `Mengundang ${str(c.email) ?? "User Tambahan"}`, detail: `Oleh ${who(c.by)}`, tone: "info" };
    case "revoke_seat": {
      const parts = [
        `Oleh ${who(c.by)}`,
        str(c.reason) ? `Alasan: ${str(c.reason)}` : null,
        str(c.newInviteEmail) ? `Diganti undangan ke ${str(c.newInviteEmail)}` : null,
      ].filter(Boolean);
      return { title: `Mencabut akses ${str(c.email) ?? "User Tambahan"}`, detail: parts.join(" · "), tone: "danger" };
    }
    default:
      return { title: event.action, detail: null, tone: "info" };
  }
}
