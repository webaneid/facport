"use client";

import { useEffect, useState, useCallback } from "react";
import { Link2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api-client";
import { moduleLabel } from "@/lib/module-options";

// § Fase 91 (2026-09-10) — `connectionStatus` BARU: `connected` (boolean)
// sekarang berarti "ada koneksi DAN sehat" (status "active" di
// Accurate), BUKAN cuma "ada baris koneksi tersimpan" seperti
// sebelumnya (bug: koneksi yang sudah `expired` dulu tetap dilaporkan
// "Terhubung"). `connectionStatus` dipakai bedakan 3 keadaan: belum
// ada koneksi sama sekali (`null`), ada tapi bermasalah ("expired"),
// atau sehat ("active").
type AccurateSubscriptionRow = {
  subscriptionId: string;
  moduleKey: string | null;
  planName: string;
  connected: boolean;
  connectionStatus: string | null;
  accurateConnectionId: string | null;
  accurateDbId: string | null;
  accurateDbAlias: string | null;
};
type ExistingConnection = { id: string; accurateDbId: string | null; accurateDbAlias: string | null };
type AccurateDatabase = { id: number; alias: string; trial: boolean; expired: boolean };

// § Fase 14, ADR-0020 — halaman ini SEKARANG daftar per subscription/modul
// (1 user bisa punya BANYAK subscription aktif, masing-masing 1
// sub-modul), BUKAN 1 status koneksi tunggal seperti sebelum Fase 14.
// Tiap baris yang belum terhubung kasih 2 pilihan: reuse koneksi (Data
// Usaha) yang SUDAH ada milik user — skip OAuth, hindari Accurate charge
// "aplikasi terpisah" untuk company yang sebenarnya sama — atau OAuth
// penuh ke Data Usaha baru (alur Fase 01, tidak berubah).
export default function AccuratePage() {
  const [subscriptions, setSubscriptions] = useState<AccurateSubscriptionRow[] | null>(null);
  const [connections, setConnections] = useState<ExistingConnection[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [subsRes, connRes] = await Promise.all([api.accurate.subscriptions.get(), api.accurate.connections.get()]);
    if (subsRes.data) setSubscriptions((subsRes.data as { subscriptions: AccurateSubscriptionRow[] }).subscriptions);
    if (connRes.data) setConnections((connRes.data as { connections: ExistingConnection[] }).connections);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar
    load();
  }, [load]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Koneksi Accurate Online</h1>
        <p className="text-sm text-muted-foreground">Hubungkan tiap fitur langganan kamu ke Data Usaha (perusahaan) Accurate Online.</p>
      </div>

      {subscriptions === null && <p className="text-sm text-muted-foreground">Memuat...</p>}

      {subscriptions?.length === 0 && (
        <EmptyState
          icon={Link2}
          title="Belum punya langganan aktif"
          description="Berlangganan fitur dulu untuk bisa menghubungkan Accurate."
        />
      )}

      {subscriptions?.map((row) => (
        <SubscriptionConnectionCard key={row.subscriptionId} row={row} connections={connections} onChanged={load} setError={setError} />
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SubscriptionConnectionCard({
  row,
  connections,
  onChanged,
  setError,
}: {
  row: AccurateSubscriptionRow;
  connections: ExistingConnection[];
  onChanged: () => void;
  setError: (e: string | null) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [reusing, setReusing] = useState(false);
  const [showReusePicker, setShowReusePicker] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // § Fase 91 (2026-09-10) — `reconnect` BARU: dikirim `true` oleh
  // tombol "Hubungkan Ulang" (dua tempat di bawah — koneksi sehat yang
  // mau diganti company, ATAU koneksi bermasalah yang perlu diperbaiki)
  // supaya backend TIDAK tolak 409 ALREADY_CONNECTED (§ accurate.route.ts).
  async function handleConnectNew(reconnect = false) {
    setConnecting(true);
    setError(null);
    const res = await api.accurate.connect.post({ subscriptionId: row.subscriptionId, reconnect });
    setConnecting(false);

    // § docs/decisions/adr-0010-response-format-eden.md — error non-2xx:
    // res.error = { status, value } dari Eden, value = body bare {code}.
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      setError(
        code === "ACCURATE_NOT_CONFIGURED"
          ? "Integrasi Accurate belum dikonfigurasi di server (dev)."
          : code === "ALREADY_CONNECTED"
            ? "Fitur ini sudah terhubung."
            : "Gagal memulai koneksi Accurate.",
      );
      return;
    }

    if (res.data?.authorizeUrl) window.location.href = res.data.authorizeUrl;
  }

  async function handleReuse() {
    if (!selectedConnectionId) return;
    setReusing(true);
    setError(null);
    const res = await api.accurate.reuse.post({ subscriptionId: row.subscriptionId, connectionId: selectedConnectionId });
    setReusing(false);
    if (res.error) {
      setError("Gagal menghubungkan ke Data Usaha yang dipilih.");
      return;
    }
    setShowReusePicker(false);
    onChanged();
  }

  if (row.connected && row.accurateDbId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{row.planName}</CardTitle>
          <CardDescription>Fitur: {row.moduleKey ? moduleLabel(row.moduleKey) : "-"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Badge variant="success" className="w-fit">
            ✓ Terhubung ke Accurate Online
          </Badge>
          {row.accurateDbAlias && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Data Usaha: <span className="font-medium">{row.accurateDbAlias}</span>
            </div>
          )}
          {/* § Fase 91 — self-service kalau nanti koneksi ini ternyata
              bermasalah (mis. company diganti, atau token di-revoke
              tapi belum ketahuan sistem) — sengaja outline/kecil,
              BUKAN aksi utama di kartu yang sudah sehat. */}
          <Button variant="outline" size="sm" className="w-fit" onClick={() => handleConnectNew(true)} disabled={connecting}>
            {connecting ? "Menghubungkan..." : "Hubungkan Ulang"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // § Fase 91 (2026-09-10) — GAP DITEMUKAN & DIPERBAIKI: koneksi PERNAH
  // ada & lengkap (accurateDbId terisi) TAPI sekarang bermasalah
  // (`connectionStatus !== "active"`, § `markConnectionExpired` worker) —
  // sebelum ini TIDAK ADA cara memperbaikinya dari UI sama sekali,
  // dicatat sejak Fase 01/04 sebagai "tombol Hubungkan Ulang belum
  // dibangun" dan tidak pernah ditindaklanjuti sampai sekarang.
  if (row.accurateConnectionId && row.accurateDbId && !row.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{row.planName}</CardTitle>
          <CardDescription>Fitur: {row.moduleKey ? moduleLabel(row.moduleKey) : "-"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Badge variant="destructive" className="w-fit">
            ⚠ Koneksi Terputus
          </Badge>
          {row.accurateDbAlias && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Data Usaha sebelumnya: <span className="font-medium">{row.accurateDbAlias}</span>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Koneksi ke Accurate Online untuk fitur ini terputus (kemungkinan token dicabut dari sisi Accurate) — import tidak akan
            berjalan sampai dihubungkan ulang.
          </p>
          <Button onClick={() => handleConnectNew(true)} disabled={connecting} className="w-fit">
            {connecting ? "Menghubungkan..." : "Hubungkan Ulang"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // § koneksi sudah dibuat (OAuth atau reuse baru saja assign), tapi Data
  // Usaha belum dipilih — kasus reuse dari koneksi yang SUDAH punya
  // accurateDbId langsung lompat ke cabang di atas lewat `onChanged()`
  // refetch, jadi cabang ini murni untuk koneksi baru hasil OAuth.
  if (row.connected && !row.accurateDbId && row.accurateConnectionId) {
    return <SelectDatabaseCard row={row} connectionId={row.accurateConnectionId} onChanged={onChanged} setError={setError} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{row.planName}</CardTitle>
        <CardDescription>Fitur: {row.moduleKey ? moduleLabel(row.moduleKey) : "-"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!showReusePicker ? (
          <div className="flex flex-wrap gap-2">
            {connections.length > 0 && (
              <Button variant="outline" onClick={() => setShowReusePicker(true)}>
                Pakai Koneksi yang Sudah Ada
              </Button>
            )}
            <Button onClick={() => handleConnectNew()} disabled={connecting}>
              {connecting ? "Menghubungkan..." : "Hubungkan Data Usaha Baru"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">Pilih Data Usaha yang sudah pernah dihubungkan:</p>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pilih koneksi existing">
              {connections.map((c) => {
                const isSelected = selectedConnectionId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedConnectionId(c.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors ${
                      isSelected ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        isSelected ? "border-primary-600" : "border-border"
                      }`}
                    >
                      {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-primary-600" />}
                    </span>
                    <span className="font-medium text-foreground">{c.accurateDbAlias ?? c.accurateDbId ?? c.id}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleReuse} disabled={!selectedConnectionId || reusing}>
                {reusing ? "Menyimpan..." : "Gunakan Data Usaha Ini"}
              </Button>
              <Button variant="outline" onClick={() => setShowReusePicker(false)}>
                Batal
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// § pola pilih Data Usaha DUA LANGKAH (pilih dulu, baru "Simpan") —
// SENGAJA, bukan langsung submit on-click. Ketemu 2026-08-27: klik-
// langsung-submit terasa "tiba-tiba kepilih yang salah" kalau user
// double-klik atau daftar Data Usaha berubah urutan pas re-fetch.
function SelectDatabaseCard({
  row,
  connectionId,
  onChanged,
  setError,
}: {
  row: AccurateSubscriptionRow;
  connectionId: string;
  onChanged: () => void;
  setError: (e: string | null) => void;
}) {
  const [databases, setDatabases] = useState<AccurateDatabase[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadDatabases() {
      const res = await api.accurate.databases.get({ query: { connectionId } });
      if (res.error || !res.data) {
        setError("Gagal ambil daftar Data Usaha dari Accurate.");
        return;
      }
      setDatabases((res.data as { databases: AccurateDatabase[] }).databases);
    }
    loadDatabases();
  }, [connectionId, setError]);

  async function handleSaveDatabase() {
    const selected = databases?.find((d) => d.id === selectedId);
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await api.accurate.databases.select.post({ connectionId, accurateDbId: selected.id, alias: selected.alias });
    setSaving(false);
    if (res.error) {
      setError("Gagal menyimpan Data Usaha.");
      return;
    }
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{row.planName}</CardTitle>
        <CardDescription>Fitur: {row.moduleKey ? moduleLabel(row.moduleKey) : "-"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-foreground">Pilih Data Usaha (perusahaan) yang mau dihubungkan:</p>
        {!databases && <p className="text-sm text-muted-foreground">Memuat daftar Data Usaha...</p>}

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pilih Data Usaha">
          {databases?.map((d) => {
            const isSelected = selectedId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={d.expired}
                onClick={() => setSelectedId(d.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSelected ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600" : "border-border hover:bg-muted/50"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected ? "border-primary-600" : "border-border"
                  }`}
                >
                  {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-primary-600" />}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium text-foreground">{d.alias}</span>
                  {(d.trial || d.expired) && (
                    <span className="text-xs text-muted-foreground">
                      {d.trial ? "Trial" : ""} {d.expired ? "Expired" : ""}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {databases && databases.length > 0 && (
          <Button onClick={handleSaveDatabase} disabled={!selectedId || saving} className="self-start">
            {saving ? "Menyimpan..." : "Simpan Data Usaha"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
