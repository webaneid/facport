"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAccurateGateNavigation } from "@/lib/use-accurate-gate-navigation";
import { AlertTriangle, CheckCircle2, Link2, Building2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import {
  DATABASE_HAS_HISTORY_MESSAGE,
  bannerCopy,
  dismissKey,
  gateCopy,
  isGateAutoOpenPath,
  oauthErrorMessage,
  statusActionLabel,
  statusBadge,
  type AccurateGate,
} from "@/lib/accurate-gate-copy";

// § Fase 144, docs/architecture/architecture-accurate-connect-gate.md — SATU-SATUNYA tempat UI koneksi Accurate: konteks status
// (dari GET /accurate/gate, diambil layout server), popup gerbang (glass), banner, kartu status, penghalang halaman import.
// Dilarang membuat popup/banner koneksi lain — tambahkan situasi baru di `lib/accurate-gate-copy.ts` + mesin status API.

type AccurateGateContextValue = {
  gate: AccurateGate | null;
  dataUsahaId: string;
  /** Buka popup secara manual (tombol di kartu/banner/penghalang) — mengabaikan "Nanti". */
  openPopup: () => void;
};
const AccurateGateContext = createContext<AccurateGateContextValue | null>(null);

export function useAccurateGate(): AccurateGateContextValue {
  const ctx = useContext(AccurateGateContext);
  if (!ctx) throw new Error("useAccurateGate harus dipakai di dalam <AccurateGateProvider>");
  return ctx;
}

// "Nanti" disimpan di sessionStorage (per Data Usaha + status): muncul lagi di sesi browser berikutnya. useSyncExternalStore
// supaya aman SSR (server: dianggap sudah ditutup → tidak ada popup di HTML awal) tanpa setState di effect.
const dismissListeners = new Set<() => void>();
function subscribeDismiss(cb: () => void) {
  dismissListeners.add(cb);
  return () => {
    dismissListeners.delete(cb);
  };
}
function readDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeDismissed(key: string) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage bisa diblokir (mode privat) — popup akan muncul lagi di navigasi berikutnya, tidak fatal.
  }
  dismissListeners.forEach((l) => l());
}

export function AccurateGateProvider({
  gate,
  dataUsahaId,
  dataUsahaName,
  children,
}: {
  gate: AccurateGate | null;
  dataUsahaId: string;
  dataUsahaName: string;
  children: React.ReactNode;
}) {
  const { pathname, search, refresh, replace } = useAccurateGateNavigation();
  const [manualOpen, setManualOpen] = useState(false);
  const [successAlias, setSuccessAlias] = useState<string | null>(null);

  const state = gate?.state ?? "ok";
  const key = dismissKey(dataUsahaId, state);
  const dismissed = useSyncExternalStore(subscribeDismiss, () => readDismissed(key), () => true);

  // Setelah OAuth, API me-redirect ke dashboard dengan ?accurate=connected atau ?accurate_error=<kode> → popup WAJIB terbuka
  // (melanjutkan ke pilih database / menampilkan galat), mengabaikan "Nanti".
  const oauthReturn = search.get("accurate") === "connected";
  const oauthError = search.get("accurate_error");

  const eligible = !!gate && gate.requiresAccurate && gate.isOwner && gate.state !== "ok";
  const autoOpen = eligible && isGateAutoOpenPath(pathname) && !dismissed;
  const open = successAlias !== null || manualOpen || (eligible && (!!oauthError || autoOpen)) || (eligible && oauthReturn);

  const stripOauthParams = useCallback(() => {
    if (oauthReturn || oauthError) replace(pathname);
  }, [oauthReturn, oauthError, pathname, replace]);

  const closePopup = useCallback(() => {
    setManualOpen(false);
    setSuccessAlias(null);
    stripOauthParams();
  }, [stripOauthParams]);

  const later = useCallback(() => {
    writeDismissed(key);
    closePopup();
  }, [key, closePopup]);

  const onSuccess = useCallback(
    (alias: string | null) => {
      setSuccessAlias(alias ?? "Accurate");
      refresh();
      setTimeout(closePopup, 1500);
    },
    [refresh, closePopup],
  );

  const value = useMemo<AccurateGateContextValue>(() => ({ gate, dataUsahaId, openPopup: () => setManualOpen(true) }), [gate, dataUsahaId]);

  return (
    <AccurateGateContext.Provider value={value}>
      <AccurateGateBanner />
      {children}
      {gate && (
        <GatePopup
          gate={gate}
          open={open}
          dataUsahaId={dataUsahaId}
          dataUsahaName={dataUsahaName}
          oauthError={oauthError}
          successAlias={successAlias}
          onLater={later}
          onSuccess={onSuccess}
          onRefresh={refresh}
        />
      )}
    </AccurateGateContext.Provider>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Popup

type ApiErrorValue = { code?: string } | undefined;

function GatePopup({
  gate,
  open,
  dataUsahaId,
  dataUsahaName,
  oauthError,
  successAlias,
  onLater,
  onSuccess,
  onRefresh,
}: {
  gate: AccurateGate;
  open: boolean;
  dataUsahaId: string;
  dataUsahaName: string;
  oauthError: string | null;
  successAlias: string | null;
  onLater: () => void;
  onSuccess: (alias: string | null) => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<null | "primary" | "secondary" | "attach">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const errorMessage = actionError ?? oauthErrorMessage(oauthError);
  const copy = gateCopy(gate, { dataUsahaName, hasError: !!errorMessage && (gate.state === "not_connected" || gate.state === "reconnect" || gate.state === "update_permissions") });

  async function startOAuth(reconnect: boolean) {
    setBusy("primary");
    setActionError(null);
    const res = await api.accurate.connect.post({ dataUsahaId, reconnect });
    if (res.error) {
      setBusy(null);
      const code = (res.error.value as ApiErrorValue)?.code;
      setActionError(
        code === "ACCURATE_NOT_CONFIGURED"
          ? "Integrasi Accurate belum dikonfigurasi di server."
          : code === "ALREADY_CONNECTED"
            ? "Data Usaha ini sudah terhubung. Muat ulang halaman."
            : "Gagal memulai koneksi Accurate. Coba lagi.",
      );
      return;
    }
    const url = res.data && "authorizeUrl" in res.data ? res.data.authorizeUrl : undefined;
    if (url) window.location.href = url; // busy dibiarkan: halaman berpindah
  }

  async function attachAccount(connectionId: string) {
    setBusy("attach");
    setActionError(null);
    const res = await api.accurate.attach.post({ dataUsahaId, connectionId, reconnect: gate.state !== "not_connected" });
    setBusy(null);
    if (res.error) {
      setActionError("Gagal memakai akun Accurate itu. Coba lagi, atau hubungkan akun lain.");
      return;
    }
    onRefresh(); // status berikutnya (pilih database / konfirmasi) dimuat ulang; popup tetap terbuka bila masih ada langkah
  }

  async function confirmDatabase() {
    setBusy("primary");
    setActionError(null);
    const res = await api.accurate.databases.confirm.post({ dataUsahaId });
    setBusy(null);
    if (res.error) {
      setActionError("Gagal menyimpan konfirmasi. Coba lagi.");
      return;
    }
    onSuccess(gate.accurateDbAlias);
  }

  async function resetDatabase() {
    setBusy("secondary");
    setActionError(null);
    const res = await api.accurate.databases.reset.post({ dataUsahaId });
    setBusy(null);
    if (res.error) {
      const code = (res.error.value as ApiErrorValue)?.code;
      setActionError(code === "DATABASE_HAS_IMPORT_HISTORY" ? DATABASE_HAS_HISTORY_MESSAGE : "Gagal mengosongkan pilihan database. Coba lagi.");
      return;
    }
    onRefresh(); // status → select_database
  }

  const [selectedDb, setSelectedDb] = useState<number | null>(null);
  const [databases, setDatabases] = useState<DatabaseOption[] | null>(null);
  const dbLoadedFor = useRef<string | null>(null);
  const needDatabases = open && gate.state === "select_database";
  useEffect(() => {
    // Muat daftar database sekali per Data Usaha saat langkah pilih database tampil (ref, bukan state: tidak memicu render ulang).
    if (needDatabases && dbLoadedFor.current !== dataUsahaId) {
      dbLoadedFor.current = dataUsahaId;
      void loadDatabases(dataUsahaId, setDatabases, setActionError);
    }
  }, [needDatabases, dataUsahaId]);

  async function saveDatabase() {
    const chosen = databases?.find((d) => d.id === selectedDb);
    if (!chosen) return;
    setBusy("primary");
    setActionError(null);
    const res = await api.accurate.databases.select.post({ dataUsahaId, accurateDbId: chosen.id, alias: chosen.alias });
    setBusy(null);
    if (res.error) {
      const code = (res.error.value as ApiErrorValue)?.code;
      setActionError(code === "DATABASE_ALREADY_USED" ? "Database itu sudah dipakai Data Usaha lain." : "Gagal menyimpan pilihan database. Coba lagi.");
      return;
    }
    onSuccess(chosen.alias);
  }

  function onPrimary() {
    switch (copy.primary.action) {
      case "connect":
        return void startOAuth(false);
      case "reconnect":
        return void startOAuth(true);
      case "save_database":
        return void saveDatabase();
      case "confirm_database":
        return void confirmDatabase();
    }
  }
  function onSecondary() {
    if (copy.secondary.action === "reset_database") return void resetDatabase();
    onLater();
  }

  const primaryDisabled = !!copy.primary.disabledReason || (copy.primary.action === "save_database" && selectedDb === null);
  const showAccounts = (gate.state === "not_connected" || gate.state === "reconnect") && gate.accounts.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy === null && successAlias === null) onLater(); // ESC / klik luar = "Nanti"
      }}
    >
      <DialogContent variant="glass" hideClose aria-describedby="accurate-gate-desc" data-testid="accurate-gate-popup">
        {successAlias !== null ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
            <CheckCircle2 className="h-12 w-12 text-primary-600" />
            <DialogTitle className="text-xl font-semibold text-foreground">Terhubung ke {successAlias}</DialogTitle>
            <DialogDescription id="accurate-gate-desc" className="text-sm text-muted-foreground">
              Koneksi Accurate siap dipakai. Anda bisa mulai import sekarang.
            </DialogDescription>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700 shadow-[0_0_0_8px_rgba(27,143,81,0.08)]">
                <Link2 className="h-6 w-6" />
              </span>
              <DialogTitle className="text-xl font-semibold leading-snug text-foreground">{copy.title}</DialogTitle>
              <DialogDescription id="accurate-gate-desc" className="text-sm leading-relaxed text-muted-foreground">
                {copy.body}
              </DialogDescription>
            </div>

            {gate.state === "select_database" && (
              <DatabasePicker databases={databases} selectedDb={selectedDb} onSelect={setSelectedDb} />
            )}

            {errorMessage && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            {copy.primary.disabledReason && <p className="text-center text-xs text-muted-foreground">{copy.primary.disabledReason}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="min-h-11 border-primary-600 bg-transparent text-primary-700 hover:bg-primary-50 sm:min-w-28"
                onClick={onSecondary}
                loading={busy === "secondary"}
                disabled={busy !== null}
              >
                {copy.secondary.label}
              </Button>
              <Button className="min-h-11 sm:min-w-40" onClick={onPrimary} loading={busy === "primary"} disabled={primaryDisabled || busy === "attach" || busy === "secondary"}>
                {busy === "primary" && (copy.primary.action === "connect" || copy.primary.action === "reconnect") ? "Mengarahkan ke Accurate…" : copy.primary.label}
              </Button>
            </div>

            {showAccounts && (
              <div className="flex flex-col items-center gap-1 border-t border-white/60 pt-3 text-center text-xs text-muted-foreground">
                <span>Sudah punya akun Accurate yang terhubung?</span>
                {gate.accounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="font-medium text-primary-700 underline-offset-2 hover:underline disabled:opacity-50"
                    onClick={() => void attachAccount(a.id)}
                    disabled={busy !== null}
                  >
                    Pakai akun {a.accountEmail ?? "Accurate"}
                  </button>
                ))}
              </div>
            )}

            {copy.note && <p className="text-center text-xs text-muted-foreground">{copy.note}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type DatabaseOption = { id: number; alias: string; trial: boolean; expired: boolean; used?: boolean };

async function loadDatabases(dataUsahaId: string, set: (d: DatabaseOption[]) => void, setError: (m: string) => void) {
  const res = await api.accurate.databases.get({ query: { dataUsahaId } });
  if (res.error || !res.data || !("databases" in res.data)) {
    setError("Gagal mengambil daftar database dari Accurate. Coba lagi.");
    return;
  }
  set(res.data.databases as DatabaseOption[]);
}

function DatabasePicker({ databases, selectedDb, onSelect }: { databases: DatabaseOption[] | null; selectedDb: number | null; onSelect: (id: number) => void }) {
  if (!databases) return <p className="text-center text-sm text-muted-foreground">Memuat daftar database…</p>;
  if (databases.length === 0) return <p className="text-center text-sm text-muted-foreground">Akun Accurate ini belum punya database.</p>;
  return (
    <div className="flex max-h-56 flex-col gap-2 overflow-y-auto" role="radiogroup" aria-label="Pilih database Accurate">
      {databases.map((d) => {
        const selected = selectedDb === d.id;
        const unavailable = d.expired || !!d.used;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={unavailable}
            onClick={() => onSelect(d.id)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              selected ? "border-primary-600 bg-primary-50/80 ring-1 ring-primary-600" : "border-white/70 bg-white/50 hover:bg-white/80"
            }`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-primary-600" : "border-border"}`}>
              {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary-600" />}
            </span>
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{d.alias}</span>
              {(d.trial || d.expired || d.used) && (
                <span className="text-xs text-muted-foreground">
                  {[d.trial ? "Trial" : "", d.expired ? "Kedaluwarsa" : "", d.used ? "Sudah dipakai Data Usaha lain" : ""].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Banner tipis, kartu status, dan penghalang halaman import — semuanya dari konteks yang sama.

export function AccurateGateBanner() {
  const { gate, openPopup } = useAccurateGate();
  const text = gate ? bannerCopy(gate) : null;
  if (!gate || !text) return null;
  const action = statusActionLabel(gate);
  return (
    <div
      role="status"
      data-testid="accurate-gate-banner"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning-bg px-4 py-2.5 text-sm text-foreground"
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        {text}
      </span>
      {action && (
        <button type="button" onClick={openPopup} className="font-medium text-primary-700 underline-offset-2 hover:underline">
          Selesaikan sekarang
        </button>
      )}
    </div>
  );
}

/** Penghalang informatif di halaman import: import akan gagal selama koneksi belum siap. Pengiriman tetap dijaga server. */
export function AccurateRequiredNotice() {
  const { gate, openPopup } = useAccurateGate();
  if (!gate || !gate.requiresAccurate || gate.state === "ok") return null;
  const action = statusActionLabel(gate);
  return (
    <Card className="border-warning/40 bg-warning-bg" data-testid="accurate-required-notice">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm text-foreground">
            {gate.isOwner
              ? "Data dari Excel baru bisa dikirim ke Accurate setelah koneksi selesai. Selesaikan dulu supaya import tidak gagal."
              : "Pemilik Data Usaha perlu menghubungkan Accurate sebelum import bisa dikirim."}
          </p>
        </div>
        {action && (
          <button type="button" onClick={openPopup} className={buttonVariants("default", "h-8")}>
            {action}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

/** Kartu status tunggal per Data Usaha (dashboard & halaman /accurate). `detailed` = tambah akun/database/izin. */
export function AccurateStatusCard({ detailed = false }: { detailed?: boolean }) {
  const { gate, openPopup } = useAccurateGate();
  if (!gate) return null;
  const badge = statusBadge(gate);
  const action = statusActionLabel(gate);
  const alias = gate.accurateDbAlias ?? gate.lastKnownDbAlias;
  return (
    <Card data-testid="accurate-status-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary-600" />
          <CardTitle>Koneksi Accurate</CardTitle>
        </div>
        {detailed && <CardDescription>Satu koneksi untuk Data Usaha ini — dipakai semua fitur yang Anda langgani.</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Badge variant={badge.variant} className="w-fit">
          {badge.label}
        </Badge>
        {alias && (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {gate.accurateDbAlias ? "Database:" : "Sebelumnya:"} <span className="font-medium">{alias}</span>
          </div>
        )}
        {detailed && gate.accountEmail && <p className="text-sm text-muted-foreground">Akun Accurate: {gate.accountEmail}</p>}
        {detailed && gate.missingModules.length > 0 && (
          <p className="text-sm text-muted-foreground">Butuh izin baru untuk: {gate.missingModules.map((m) => m.label).join(", ")}.</p>
        )}
        {!gate.isOwner && gate.requiresAccurate && gate.state !== "ok" && (
          <p className="text-sm text-muted-foreground">Pemilik Data Usaha yang bisa menghubungkan Accurate.</p>
        )}
        {action && (
          <Button className="w-fit" onClick={openPopup}>
            {action}
          </Button>
        )}
        {detailed && gate.state === "ok" && gate.isOwner && (
          <p className="text-xs text-muted-foreground">Perlu mengganti akun atau memperbarui izin? Hubungi kami — kami bantu prosesnya dengan aman.</p>
        )}
      </CardContent>
    </Card>
  );
}
