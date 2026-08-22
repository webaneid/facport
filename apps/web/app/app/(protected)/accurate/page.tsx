"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api-client";

type AccurateStatus = { connected: boolean; accurateDbId: string | null };
type AccurateDatabase = { id: number; alias: string; trial: boolean; expired: boolean };

// § architecture-accurate-integration.md — tombol "Hubungkan Accurate
// Online" + status koneksi + pilih Data Usaha (§ "Sesi Data Usaha",
// ditambah Fase 02 — bukan cuma cek keberadaan token, tapi juga
// accurateDbId sebelum import data bisa jalan). "Hubungkan Ulang" (kasus
// refresh token juga invalid) belum dibedakan dari "Hubungkan" pertama
// kali — keduanya panggil endpoint yang sama, cukup untuk sekarang.
export default function AccuratePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AccurateStatus | null>(null);
  const [databases, setDatabases] = useState<AccurateDatabase[] | null>(null);

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
    const dbs = (res.data as { databases: AccurateDatabase[] }).databases;
    setDatabases(dbs);
    if (dbs.length === 1) await selectDatabase(dbs[0]!.id);
  }

  async function selectDatabase(id: number) {
    setLoading(true);
    setError(null);
    const res = await api.accurate.databases.select.post({ accurateDbId: id });
    setLoading(false);
    if (res.error) {
      setError("Gagal memilih Data Usaha.");
      return;
    }
    await loadStatus();
  }

  async function handleConnect() {
    setLoading(true);
    setError(null);
    const res = await api.accurate.connect.post();
    setLoading(false);

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
                <Button onClick={handleConnect} disabled={loading}>
                  {loading ? "Menghubungkan..." : "Hubungkan Accurate Online"}
                </Button>
              }
            />
          )}

          {status?.connected && !status.accurateDbId && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-foreground">Pilih Data Usaha (perusahaan) yang mau dihubungkan:</p>
              {!databases && <p className="text-sm text-muted-foreground">Memuat daftar Data Usaha...</p>}
              {databases?.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  className="justify-start"
                  onClick={() => selectDatabase(d.id)}
                  disabled={loading || d.expired}
                >
                  {d.alias} {d.trial ? "(Trial)" : ""} {d.expired ? "(Expired)" : ""}
                </Button>
              ))}
            </div>
          )}

          {status?.connected && status.accurateDbId && <Badge variant="success">✓ Terhubung ke Accurate Online</Badge>}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
