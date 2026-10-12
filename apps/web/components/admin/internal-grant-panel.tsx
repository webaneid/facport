"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";

// § Fase 191, D9 Lapis 2 — hibah akses internal: fitur TANPA tanggal akhir untuk akun internal (trainer, karyawan, mitra), per Data Usaha milik akun. Dua langkah: pratinjau lalu terapkan.
// Dicabut otomatis bila akun kembali komersil. Server menolak akun komersil (409 NOT_INTERNAL).
type DataUsaha = { id: string; name: string };
type GrantSub = { subscriptionId: string; status: string; internalGrant?: boolean; dataUsahaId: string };
type Preview = { internal: boolean; modules: { key: string; label: string; status: "will_grant" | "already" | "no_plan"; replaces: number }[] };

const ERRORS: Record<string, string> = {
  NOT_INTERNAL: "Akun ini bukan akun internal. Tandai internal dulu.",
  DATA_USAHA_NOT_FOUND: "Data Usaha tidak ditemukan atau bukan milik akun ini.",
  UNKNOWN_MODULE: "Ada fitur yang tidak dikenal.",
};
const errorText = (code: string | undefined) => (code && ERRORS[code]) || "Gagal memproses hibah. Coba lagi.";

function GrantDialog({ open, onOpenChange, userId, dataUsaha, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; dataUsaha: DataUsaha; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset keadaan dialog tiap dibuka, sebelum memuat pratinjau (pola standar)
    setPreview(null);
    setError(null);
    api.admin.users({ id: userId })["internal-grant"].preview.post({ dataUsahaId: dataUsaha.id, moduleKeys: "all" }).then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) setError(errorText((res.error?.value as { code?: string } | undefined)?.code));
      else setPreview(res.data as unknown as Preview);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId, dataUsaha.id]);

  const willGrant = preview?.modules.filter((m) => m.status === "will_grant") ?? [];
  const replaced = willGrant.reduce((n, m) => n + m.replaces, 0);

  async function apply() {
    setSaving(true);
    const res = await api.admin.users({ id: userId })["internal-grant"].post({ dataUsahaId: dataUsaha.id, moduleKeys: "all" });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error(errorText((res.error?.value as { code?: string } | undefined)?.code));
      return;
    }
    const { granted } = res.data as unknown as { granted: string[] };
    toast.success(`${granted.length} fitur dihibahkan tanpa tanggal akhir.`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Beri semua fitur — {dataUsaha.name}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Akses aktif tanpa tanggal akhir dan tanpa invoice, tidak ada notifikasi kedaluwarsa. Dicabut otomatis bila akun kembali komersil.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          {!preview && !error ? <Skeleton className="h-20 w-full" /> : null}
          {preview ? (
            <>
              <p className="m-0">
                <strong>{willGrant.length}</strong> fitur akan dihibahkan; {preview.modules.filter((m) => m.status === "already").length} sudah dihibahkan; {preview.modules.filter((m) => m.status === "no_plan").length} dilewati (belum ada paket aktif).
              </p>
              {replaced > 0 ? <Alert variant="warning">{replaced} langganan aktif lain untuk fitur yang sama akan digantikan oleh hibah ini.</Alert> : null}
              <ul className="m-0 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
                {willGrant.map((m) => (
                  <li key={m.key}>{m.label}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" disabled={!preview || willGrant.length === 0 || saving} onClick={apply}>
            {saving ? "Memproses…" : "Beri hibah"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InternalGrantPanel({ userId, dataUsaha, subscriptions, onChanged }: { userId: string; dataUsaha: DataUsaha[]; subscriptions: GrantSub[]; onChanged: () => void }) {
  const [granting, setGranting] = useState<DataUsaha | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const activeGrants = (duId: string) => subscriptions.filter((s) => s.internalGrant && s.status === "active" && s.dataUsahaId === duId).length;

  async function revoke(du: DataUsaha) {
    setRevoking(du.id);
    const res = await api.admin.users({ id: userId })["internal-grant"].revoke.post({ dataUsahaId: du.id });
    setRevoking(null);
    if (res.error || !res.data) {
      toast.error("Gagal mencabut hibah. Coba lagi.");
      return;
    }
    toast.success(`${(res.data as unknown as { revoked: number }).revoked} hibah dicabut.`);
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Akses Internal</CardTitle>
        <CardDescription>Beri akses fitur tanpa tanggal akhir untuk akun internal. Tidak ada invoice dan tidak masuk laporan uang.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {dataUsaha.length === 0 ? <p className="m-0 text-sm text-muted-foreground">Akun ini belum memiliki Data Usaha.</p> : null}
        {dataUsaha.map((du) => {
          const n = activeGrants(du.id);
          return (
            <div key={du.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-medium" title={du.name}>
                  {du.name}
                </p>
                {n > 0 ? <Badge variant="success">{n} fitur dihibahkan</Badge> : <span className="text-xs text-muted-foreground">Belum ada hibah</span>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" type="button" onClick={() => setGranting(du)}>
                  Beri semua fitur
                </Button>
                {n > 0 ? (
                  <Button size="sm" variant="outline" type="button" disabled={revoking === du.id} onClick={() => revoke(du)}>
                    {revoking === du.id ? "Mencabut…" : "Cabut hibah"}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
      {granting ? <GrantDialog open onOpenChange={(o) => !o && setGranting(null)} userId={userId} dataUsaha={granting} onDone={onChanged} /> : null}
    </Card>
  );
}
