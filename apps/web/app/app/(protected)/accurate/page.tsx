"use client";

import { useEffect, useState } from "react";
import { Link2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api-client";

type AccurateStatus = { connected: boolean; accurateDbId: string | null; accurateDbAlias: string | null };
type AccurateDatabase = { id: number; alias: string; trial: boolean; expired: boolean };

// § architecture-accurate-integration.md — tombol "Hubungkan Accurate
// Online" + status koneksi + pilih Data Usaha (§ "Sesi Data Usaha",
// ditambah Fase 02 — bukan cuma cek keberadaan token, tapi juga
// accurateDbId sebelum import data bisa jalan). "Hubungkan Ulang" (kasus
// refresh token juga invalid) belum dibedakan dari "Hubungkan" pertama
// kali — keduanya panggil endpoint yang sama, cukup untuk sekarang.
//
// Pilih Data Usaha DUA LANGKAH (pilih dulu, baru "Simpan") — SENGAJA,
// bukan langsung submit on-click seperti versi awal. Ketemu 2026-08-27:
// klik-langsung-submit terasa "tiba-tiba kepilih yang salah" kalau user
// double-klik atau daftar Data Usaha berubah urutan pas re-fetch. Radio
// card + tombol konfirmasi terpisah bikin state pilihan EKSPLISIT & keliatan
// sebelum benar-benar disubmit ke server.
export default function AccuratePage() {
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AccurateStatus | null>(null);
  const [databases, setDatabases] = useState<AccurateDatabase[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  async function loadStatus() {
    const res = await api.accurate.status.get();
    if (res.data) setStatus(res.data as AccurateStatus);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (status?.connected && !status.accurateDbId) loadDatabases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected, status?.accurateDbId]);

  async function loadDatabases() {
    const res = await api.accurate.databases.get();
    if (res.error || !res.data) {
      setError("Gagal ambil daftar Data Usaha dari Accurate.");
      return;
    }
    setDatabases((res.data as { databases: AccurateDatabase[] }).databases);
  }

  async function handleSaveDatabase() {
    const selected = databases?.find((d) => d.id === selectedId);
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await api.accurate.databases.select.post({ accurateDbId: selected.id, alias: selected.alias });
    setSaving(false);
    if (res.error) {
      setError("Gagal menyimpan Data Usaha.");
      return;
    }
    await loadStatus();
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    const res = await api.accurate.connect.post();
    setConnecting(false);

    // § docs/decisions/adr-0010-response-format-eden.md — error non-2xx:
    // res.error = { status, value } dari Eden, value = body bare {code}
    // yang route kirim (BUKAN {error:{code}} manual lagi).
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      setError(
        code === "NO_ACTIVE_SUBSCRIPTION"
          ? "Kamu belum punya langganan aktif — pilih paket dulu."
          : code === "ACCURATE_NOT_CONFIGURED"
            ? "Integrasi Accurate belum dikonfigurasi di server (dev)."
            : code === "ALREADY_CONNECTED"
              ? "Akun Accurate sudah terhubung."
              : "Gagal memulai koneksi Accurate.",
      );
      return;
    }

    if (res.data?.authorizeUrl) window.location.href = res.data.authorizeUrl;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Koneksi Accurate Online</h1>
        <p className="text-sm text-muted-foreground">
          Hubungkan akun Accurate Online kamu supaya faktur bisa langsung masuk otomatis.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status Koneksi</CardTitle>
          <CardDescription>Data Usaha (perusahaan) yang terhubung ke Facport.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!status && <p className="text-sm text-muted-foreground">Memuat status koneksi...</p>}

          {status && !status.connected && (
            <EmptyState
              icon={Link2}
              title="Belum Terhubung"
              description="Hubungkan akun Accurate Online kamu sekali saja — faktur berikutnya otomatis masuk tanpa input manual."
              action={
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? "Menghubungkan..." : "Hubungkan Accurate Online"}
                </Button>
              }
            />
          )}

          {status?.connected && !status.accurateDbId && (
            <div className="flex flex-col gap-3">
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
                        isSelected
                          ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600"
                          : "border-border hover:bg-muted/50"
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
            </div>
          )}

          {status?.connected && status.accurateDbId && (
            <div className="flex flex-col gap-2">
              <Badge variant="success" className="w-fit">
                ✓ Terhubung ke Accurate Online
              </Badge>
              {status.accurateDbAlias && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Data Usaha: <span className="font-medium">{status.accurateDbAlias}</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
