"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";

// § architecture-settings.md, Fase 10 — form pengaturan umum + retensi
// data. Skema key-value FLEKSIBEL (§ arsitektur) — tetap validasi retensi
// (1-7) di CLIENT di sini, DAN di server (§ settings.route.ts PUT) —
// jangan cuma andalkan satu sisi.
const MAX_RETENTION_DAYS = 7;

type FormState = {
  companyName: string;
  companyAddress: string;
  companyTimezone: string;
  retentionDays: string;
};

// § Fase 12, ADR-0017 — logo/favicon TERPISAH dari FormState di atas:
// upload langsung tersimpan server-side begitu file dipilih (bukan
// menunggu tombol "Simpan Pengaturan"), jadi state-nya juga terpisah
// (preview URL dari DB, bukan input terkontrol biasa).
type BrandingState = {
  logoUrl: string | null;
  faviconUrls: Record<string, string> | null;
};

export default function AdminSettingsPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [branding, setBranding] = useState<BrandingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  async function loadGeneral() {
    const generalRes = await api.settings.get({ query: { group: "general" } });
    const general = (generalRes.data as Record<string, unknown> | undefined) ?? {};
    setBranding({
      logoUrl: typeof general["company.logo"] === "string" ? general["company.logo"] : null,
      faviconUrls: (general["company.favicon"] as Record<string, string> | undefined) ?? null,
    });
    return general;
  }

  useEffect(() => {
    async function load() {
      const [general, dataRes] = await Promise.all([loadGeneral(), api.settings.get({ query: { group: "data" } })]);
      const data = (dataRes.data as Record<string, unknown> | undefined) ?? {};
      setForm({
        companyName: String(general["company.name"] ?? ""),
        companyAddress: String(general["company.address"] ?? ""),
        companyTimezone: String(general["company.timezone"] ?? "Asia/Jakarta"),
        retentionDays: String(data["data.importRetentionDays"] ?? 2),
      });
    }
    load();
  }, []);

  async function handleLogoChange(file: File | undefined) {
    if (!file) return;
    setUploadingLogo(true);
    const res = await api.admin.branding.logo.post({ file });
    setUploadingLogo(false);
    if (res.error) {
      toast.error("Gagal upload logo — cek tipe file (JPEG/PNG/WebP) & ukuran (maks 5MB).");
      return;
    }
    toast.success("Logo berhasil diperbarui.");
    loadGeneral();
  }

  async function handleFaviconChange(file: File | undefined) {
    if (!file) return;
    setUploadingFavicon(true);
    const res = await api.admin.branding.favicon.post({ file });
    setUploadingFavicon(false);
    if (res.error) {
      toast.error("Gagal upload favicon — cek tipe file (JPEG/PNG/WebP) & ukuran (maks 5MB).");
      return;
    }
    toast.success("Favicon berhasil diperbarui.");
    loadGeneral();
  }

  async function handleSave() {
    if (!form) return;
    setError(null);

    const retentionDays = Number(form.retentionDays);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > MAX_RETENTION_DAYS) {
      setError(`Retensi data harus angka bulat 1–${MAX_RETENTION_DAYS} hari.`);
      return;
    }

    setSaving(true);
    const res = await api.settings.put([
      { key: "company.name", value: form.companyName, group: "general" },
      { key: "company.address", value: form.companyAddress, group: "general" },
      { key: "company.timezone", value: form.companyTimezone, group: "general" },
      { key: "data.importRetentionDays", value: retentionDays, group: "data" },
    ]);
    setSaving(false);
    if (res.error) {
      const value = res.error.value as { code?: string; maxDays?: number } | undefined;
      setError(
        value?.code === "INVALID_RETENTION_DAYS"
          ? `Retensi data harus angka bulat 1–${value.maxDays} hari.`
          : "Gagal menyimpan pengaturan.",
      );
      return;
    }
    toast.success("Pengaturan disimpan.");
  }

  if (!form) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Pengaturan umum Facport.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perusahaan</CardTitle>
          <CardDescription>Info dasar yang tampil di aplikasi.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Nama Perusahaan</span>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Alamat</span>
            <Input value={form.companyAddress} onChange={(e) => setForm({ ...form, companyAddress: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Zona Waktu</span>
            <Input
              value={form.companyTimezone}
              onChange={(e) => setForm({ ...form, companyTimezone: e.target.value })}
              placeholder="Asia/Jakarta"
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Logo & favicon yang tampil di dashboard dan tab browser.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 sm:flex-row">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Logo</span>
            {branding?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt="Logo saat ini" className="h-12 w-auto rounded border border-border p-1" />
            )}
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingLogo}
              onChange={(e) => handleLogoChange(e.target.files?.[0])}
            />
            {uploadingLogo && <span className="text-xs text-muted-foreground">Mengupload...</span>}
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Favicon</span>
            {branding?.faviconUrls?.["32"] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.faviconUrls["32"]} alt="Favicon saat ini" className="h-8 w-8 rounded border border-border p-1" />
            )}
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingFavicon}
              onChange={(e) => handleFaviconChange(e.target.files?.[0])}
            />
            {uploadingFavicon && <span className="text-xs text-muted-foreground">Mengupload...</span>}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retensi Data Import</CardTitle>
          <CardDescription>
            Berapa hari riwayat import Excel (Faktur Pembelian, Akun Hutang Pemasok) disimpan sebelum dihapus otomatis.
            Data client bersifat sensitif — maksimal {MAX_RETENTION_DAYS} hari, tidak bisa diatur lebih lama.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex max-w-xs flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Hari</span>
            <Input
              type="number"
              min={1}
              max={MAX_RETENTION_DAYS}
              value={form.retentionDays}
              onChange={(e) => setForm({ ...form, retentionDays: e.target.value })}
            />
          </label>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSave} disabled={saving} className="self-start">
        {saving ? "Menyimpan..." : "Simpan Pengaturan"}
      </Button>
    </div>
  );
}
