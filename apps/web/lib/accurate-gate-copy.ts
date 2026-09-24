// § Fase 144, docs/architecture/architecture-accurate-connect-gate.md — SUMBER TUNGGAL narasi, label tombol, dan turunan
// tampilan gerbang koneksi Accurate. Fungsi murni (tanpa React/DOM) supaya teruji unit. Jangan tulis teks koneksi Accurate
// di komponen lain — tambahkan di sini.

export type GateState = "ok" | "not_connected" | "reconnect" | "update_permissions" | "select_database" | "confirm_database";

// Cermin `AccurateGate` di apps/api/src/lib/accurate-gate.ts (respons GET /accurate/gate).
export type AccurateGate = {
  state: GateState;
  migrated: boolean;
  isOwner: boolean;
  requiresAccurate: boolean;
  accountEmail: string | null;
  accurateDbAlias: string | null;
  lastKnownDbAlias: string | null;
  missingModules: { key: string; label: string }[];
  missingScopes: string[];
  catalogMissingScopes: string[];
  importRunning: boolean;
  accounts: { id: string; accountEmail: string | null }[];
  /** § diminta user 2026-09-24 — true = Data Usaha BENAR-BENAR belum beli apa pun. Dipakai `not_connected` untuk
   * tawarkan jalur "pengguna Accurate Desktop → lihat Konverter", § `gateCopy`. */
  hasNoSubscriptionYet: boolean;
};

/** Aksi tombol utama. `reconnect` = OAuth dengan flag reconnect (koneksi sudah ada): hubungkan ulang / perbarui izin. */
export type PrimaryAction = "connect" | "reconnect" | "save_database" | "confirm_database";
export type SecondaryAction = "later" | "reset_database";

export type GateCopy = {
  title: string;
  body: string;
  /** Catatan kecil di bawah tombol. */
  note?: string;
  primary: { label: string; action: PrimaryAction; disabledReason?: string };
  secondary: { label: string; action: SecondaryAction };
  /** § diminta user 2026-09-24 — tautan keluar opsional (BUKAN tombol aksi popup), dirender sebagai teks-link
   * di atas `note`. Sejauh ini cuma dipakai `not_connected` + `hasNoSubscriptionYet` (jalur "pengguna Accurate
   * Desktop, lihat Konverter") — jangan disalahgunakan untuk hal lain tanpa alasan sekuat itu. */
  alternativeLink?: { label: string; href: string };
};

/** "A", "A dan B", "A, B, dan C" — untuk menyebut nama fitur dalam narasi. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} dan ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, dan ${names[names.length - 1]}`;
}

// Kode `?accurate_error=` dari callback OAuth (apps/api/src/routes/accurate.route.ts) → kalimat ramah.
const OAUTH_ERRORS: Record<string, string> = {
  accurate_account_in_use:
    "Akun Accurate ini sudah terhubung ke akun Facport lain. Gunakan akun Accurate yang berbeda, atau minta pemilik sebelumnya memutuskannya.",
  missing_account: "Accurate tidak mengirim identitas akun. Coba lagi; kalau tetap begini, hubungi kami.",
  invalid_state: "Sesi penghubungan kedaluwarsa atau berbeda. Mulai lagi dari awal ya.",
  access_denied: "Izin tidak jadi diberikan. Tidak apa-apa — Anda bisa mencoba lagi kapan saja.",
  exchange_failed: "Gagal menyelesaikan koneksi dengan Accurate. Coba beberapa saat lagi.",
};
const OAUTH_ERROR_FALLBACK = "Penghubungan ke Accurate belum berhasil. Coba lagi, atau hubungi kami kalau terus berulang.";

export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERRORS[code] ?? OAUTH_ERROR_FALLBACK;
}

const IMPORT_RUNNING_HINT = "Ada import yang sedang berjalan. Tunggu sampai selesai agar prosesnya tidak terputus.";

/** Narasi popup untuk `gate.state`. `hasError` (galat callback) mengganti label tombol utama jadi "Coba Lagi". */
export function gateCopy(gate: AccurateGate, opts: { dataUsahaName: string; hasError?: boolean }): GateCopy {
  const retry = opts.hasError ? "Coba Lagi" : null;
  const later: GateCopy["secondary"] = { label: "Nanti", action: "later" };
  const blocked = gate.importRunning ? IMPORT_RUNNING_HINT : undefined;

  switch (gate.state) {
    case "not_connected":
      if (gate.migrated) {
        return {
          title: "Hubungkan ulang akun Accurate Anda — sekali saja",
          body: "Kami menyederhanakan cara Facport terhubung ke Accurate: cukup satu koneksi per akun, dipakai untuk semua Data Usaha Anda. Karena itu Anda perlu menghubungkan ulang satu kali. Pengaturan dan riwayat import Anda tetap aman.",
          note: gate.lastKnownDbAlias ? `Database terakhir yang tercatat: ${gate.lastKnownDbAlias}.` : undefined,
          primary: { label: retry ?? "Hubungkan Ulang", action: "connect" },
          secondary: later,
        };
      }
      return {
        title: "Hubungkan dengan akun Data Usaha Accurate Online Anda",
        body: "Supaya data dari Excel bisa langsung masuk ke Accurate, hubungkan akun Accurate milik perusahaan Anda. Prosesnya singkat: Anda diarahkan ke Accurate untuk memberi izin, lalu kembali ke sini. Izin itu hanya dipakai untuk memproses impor Anda, dan bisa dicabut kapan saja dari Accurate.",
        note: gate.lastKnownDbAlias
          ? `Sebelumnya terhubung ke ${gate.lastKnownDbAlias}.`
          : "Belum siap? Pilih Nanti — Anda bisa menghubungkan kapan saja dari menu Koneksi Accurate.",
        primary: { label: retry ?? "Hubungkan Sekarang", action: "connect" },
        secondary: later,
        // § belum ada komitmen ke Facport sama sekali (Data Usaha benar-benar baru) — tawarkan jalur Konverter
        // (Excel→XML untuk Accurate Desktop) yang TIDAK butuh koneksi Accurate Online ini sama sekali.
        alternativeLink: !gate.lastKnownDbAlias && gate.hasNoSubscriptionYet
          ? { label: "Pengguna Accurate Desktop? Anda tidak perlu ini — lihat paket Konverter", href: "/subscribe" }
          : undefined,
      };

    case "reconnect":
      return {
        title: "Koneksi ke Accurate terputus",
        body: "Akses Facport ke Accurate sudah tidak berlaku — biasanya karena izin dicabut, atau akun Accurate diotorisasi ulang di tempat lain. Hubungkan ulang agar import bisa berjalan lagi. Data yang sudah pernah Anda impor tidak terpengaruh.",
        primary: { label: retry ?? "Hubungkan Ulang", action: "reconnect", disabledReason: blocked },
        secondary: later,
      };

    case "update_permissions": {
      const features = joinNames(gate.missingModules.map((m) => m.label));
      return {
        title: "Ada izin baru yang perlu Anda setujui",
        body: `${
          features ? `Fitur ${features} yang baru Anda gunakan membutuhkan` : "Ada fitur baru yang membutuhkan"
        } izin tambahan di Accurate. Izin yang sudah ada tetap berlaku dan data Anda tidak berubah — Anda hanya perlu menyetujuinya sekali lagi di Accurate, lalu lanjut seperti biasa.`,
        primary: { label: retry ?? "Perbarui Izin", action: "reconnect", disabledReason: blocked },
        secondary: later,
      };
    }

    case "select_database":
      return {
        title: `Pilih database Accurate untuk ${opts.dataUsahaName}`,
        body: "Akun Accurate Anda sudah terhubung. Pilih database yang dipakai untuk Data Usaha ini. Setelah ada riwayat import, pilihan ini tidak bisa diganti — pastikan sudah benar.",
        primary: { label: "Simpan & Lanjut", action: "save_database" },
        secondary: later,
      };

    case "confirm_database":
      return {
        title: "Apakah ini database yang benar?",
        body: `Sebelumnya Data Usaha ini terhubung ke ${gate.accurateDbAlias ?? "sebuah database"}. Pastikan cocok agar data tidak masuk ke perusahaan yang salah.`,
        primary: { label: "Ya, Sudah Benar", action: "confirm_database" },
        secondary: { label: "Pilih yang Lain", action: "reset_database" },
      };

    case "ok":
      return {
        title: `Terhubung ke ${gate.accurateDbAlias ?? "Accurate"}`,
        body: "Koneksi Accurate untuk Data Usaha ini sudah siap dipakai.",
        primary: { label: "Tutup", action: "confirm_database" },
        secondary: later,
      };
  }
}

/** Pesan ketika "Pilih yang Lain" ditolak karena Data Usaha sudah punya riwayat import. */
export const DATABASE_HAS_HISTORY_MESSAGE =
  "Data Usaha ini sudah punya riwayat import, jadi database-nya tidak bisa diganti sendiri. Hubungi tim kami dan kami bantu.";

/** Satu kalimat untuk banner tipis; `null` = tidak ada banner. Pemilik & member diberi kalimat berbeda (member tanpa tombol). */
export function bannerCopy(gate: AccurateGate): string | null {
  if (!gate.requiresAccurate || gate.state === "ok") return null;
  if (!gate.isOwner) return "Pemilik Data Usaha perlu menghubungkan Accurate sebelum import bisa dikirim.";
  switch (gate.state) {
    case "not_connected":
      return "Data Usaha ini belum terhubung ke Accurate — import belum bisa dikirim.";
    case "reconnect":
      return "Koneksi ke Accurate terputus.";
    case "update_permissions": {
      const features = joinNames(gate.missingModules.map((m) => m.label));
      return features ? `Ada izin baru yang perlu disetujui untuk ${features}.` : "Ada izin baru yang perlu disetujui.";
    }
    case "select_database":
      return "Pilih database Accurate untuk melanjutkan.";
    case "confirm_database":
      return "Konfirmasi database Accurate Data Usaha ini.";
  }
}

/** Badge status ringkas untuk kartu dashboard / halaman koneksi. */
export function statusBadge(gate: AccurateGate): { label: string; variant: "success" | "warning" | "destructive" } {
  if (!gate.requiresAccurate) return { label: "Tidak diperlukan", variant: "success" };
  switch (gate.state) {
    case "ok":
      return { label: "✓ Terhubung", variant: "success" };
    case "reconnect":
      return { label: "⚠ Terputus", variant: "destructive" };
    case "update_permissions":
      return { label: "Perlu izin baru", variant: "warning" };
    case "select_database":
      return { label: "Pilih database", variant: "warning" };
    case "confirm_database":
      return { label: "Konfirmasi database", variant: "warning" };
    case "not_connected":
      return { label: "Belum terhubung", variant: "warning" };
  }
}

/** Label tombol tunggal di kartu/halaman untuk membuka popup sesuai status. `null` = tidak ada aksi (ok / bukan pemilik). */
export function statusActionLabel(gate: AccurateGate): string | null {
  if (!gate.requiresAccurate || !gate.isOwner || gate.state === "ok") return null;
  switch (gate.state) {
    case "not_connected":
      return gate.migrated ? "Hubungkan Ulang" : "Hubungkan Sekarang";
    case "reconnect":
      return "Hubungkan Ulang";
    case "update_permissions":
      return "Perbarui Izin";
    case "select_database":
      return "Pilih Database";
    case "confirm_database":
      return "Konfirmasi Database";
  }
}

/** Halaman tempat popup MUNCUL OTOMATIS: dashboard dan halaman import (keputusan user 2026-09-22). Halaman lain hanya banner. */
export function isGateAutoOpenPath(pathname: string): boolean {
  return pathname === "/" || /\/import(\/|$)/.test(pathname);
}

/** Kunci sessionStorage "Nanti": per Data Usaha + status (status berganti → popup boleh muncul lagi). */
export function dismissKey(dataUsahaId: string, state: GateState): string {
  return `accurate-gate:dismissed:${dataUsahaId}:${state}`;
}
