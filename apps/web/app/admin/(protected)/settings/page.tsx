"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";

// § Fase 16, ADR-0022 — TERPISAH dari `company.bankAccount` (free-text
// tunggal, Fase 15, footer PDF) — ini array TERSTRUKTUR dipakai UI pilih
// metode bayar interaktif saat checkout (§ architecture-payment.md).
type BankAccount = { id: string; bankName: string; accountNumber: string; accountName: string };
type QrisAccount = { id: string; name: string; imageUrl: string; isDynamic: boolean; emvPayload: string };

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
  // § Fase 15, ADR-0021 — dipakai footer PDF invoice ("Instruksi
  // Pembayaran"), group "billing" (§ architecture-settings.md).
  companyTaxId: string;
  companyPhone: string;
  companyEmail: string;
  companyBankAccount: string;
  // § Fase 16, ADR-0022 — rekening bank & QRIS terstruktur (checkout).
  bankAccounts: BankAccount[];
  qrisAccounts: QrisAccount[];
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
      const [general, dataRes, billingRes] = await Promise.all([
        loadGeneral(),
        api.settings.get({ query: { group: "data" } }),
        api.settings.get({ query: { group: "billing" } }),
      ]);
      const data = (dataRes.data as Record<string, unknown> | undefined) ?? {};
      const billing = (billingRes.data as Record<string, unknown> | undefined) ?? {};
      setForm({
        companyName: String(general["company.name"] ?? ""),
        companyAddress: String(general["company.address"] ?? ""),
        companyTimezone: String(general["company.timezone"] ?? "Asia/Jakarta"),
        retentionDays: String(data["data.importRetentionDays"] ?? 2),
        companyTaxId: String(billing["company.taxId"] ?? ""),
        companyPhone: String(billing["company.phone"] ?? ""),
        companyEmail: String(billing["company.email"] ?? ""),
        companyBankAccount: String(billing["company.bankAccount"] ?? ""),
        bankAccounts: (billing["company.bankAccounts"] as BankAccount[] | undefined) ?? [],
        qrisAccounts: (billing["company.qrisAccounts"] as QrisAccount[] | undefined) ?? [],
      });
    }
    load();
  }, []);

  function addBankAccount() {
    if (!form) return;
    setForm({
      ...form,
      bankAccounts: [...form.bankAccounts, { id: crypto.randomUUID(), bankName: "", accountNumber: "", accountName: "" }],
    });
  }

  function updateBankAccount(id: string, patch: Partial<BankAccount>) {
    if (!form) return;
    setForm({ ...form, bankAccounts: form.bankAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }

  function removeBankAccount(id: string) {
    if (!form) return;
    setForm({ ...form, bankAccounts: form.bankAccounts.filter((a) => a.id !== id) });
  }

  function addQrisAccount() {
    if (!form) return;
    setForm({
      ...form,
      qrisAccounts: [...form.qrisAccounts, { id: crypto.randomUUID(), name: "", imageUrl: "", isDynamic: false, emvPayload: "" }],
    });
  }

  function updateQrisAccount(id: string, patch: Partial<QrisAccount>) {
    if (!form) return;
    setForm({ ...form, qrisAccounts: form.qrisAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }

  function removeQrisAccount(id: string) {
    if (!form) return;
    setForm({ ...form, qrisAccounts: form.qrisAccounts.filter((a) => a.id !== id) });
  }

  async function handleQrisImageChange(id: string, file: File | undefined) {
    if (!file) return;
    const res = await api.admin.branding["qris-image"].post({ file });
    if (res.error || !res.data) {
      toast.error("Gagal upload foto QRIS — cek tipe file (JPEG/PNG/WebP) & ukuran (maks 5MB).");
      return;
    }
    updateQrisAccount(id, { imageUrl: (res.data as { url: string }).url });
  }

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

    const incompleteBank = form.bankAccounts.some((a) => !a.bankName.trim() || !a.accountNumber.trim() || !a.accountName.trim());
    if (incompleteBank) {
      setError("Semua field rekening bank wajib diisi (atau hapus baris yang tidak dipakai).");
      return;
    }
    const incompleteQris = form.qrisAccounts.some((a) => !a.name.trim() || !a.imageUrl);
    if (incompleteQris) {
      setError("Semua QRIS wajib diberi nama & foto (atau hapus baris yang tidak dipakai).");
      return;
    }

    setSaving(true);
    const res = await api.settings.put([
      { key: "company.name", value: form.companyName, group: "general" },
      { key: "company.address", value: form.companyAddress, group: "general" },
      { key: "company.timezone", value: form.companyTimezone, group: "general" },
      { key: "data.importRetentionDays", value: retentionDays, group: "data" },
      { key: "company.taxId", value: form.companyTaxId, group: "billing" },
      { key: "company.phone", value: form.companyPhone, group: "billing" },
      { key: "company.email", value: form.companyEmail, group: "billing" },
      { key: "company.bankAccount", value: form.companyBankAccount, group: "billing" },
      { key: "company.bankAccounts", value: form.bankAccounts, group: "billing" },
      { key: "company.qrisAccounts", value: form.qrisAccounts, group: "billing" },
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
          <CardTitle>Info Penagihan (Invoice)</CardTitle>
          <CardDescription>Tampil di footer PDF invoice (&quot;Instruksi Pembayaran&quot;). Boleh dikosongkan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">NPWP</span>
            <Input value={form.companyTaxId} onChange={(e) => setForm({ ...form, companyTaxId: e.target.value })} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Telepon</span>
              <Input value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Email</span>
              <Input type="email" value={form.companyEmail} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Rekening Bank</span>
            <textarea
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10"
              rows={3}
              placeholder="mis. BCA 1234567890 a.n. PT Facport"
              value={form.companyBankAccount}
              onChange={(e) => setForm({ ...form, companyBankAccount: e.target.value })}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rekening Bank</CardTitle>
          <CardDescription>Tampil ke customer saat checkout memilih metode transfer bank.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {form.bankAccounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start">
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <Input placeholder="Nama Bank" value={account.bankName} onChange={(e) => updateBankAccount(account.id, { bankName: e.target.value })} />
                <Input
                  placeholder="Nomor Rekening"
                  value={account.accountNumber}
                  onChange={(e) => updateBankAccount(account.id, { accountNumber: e.target.value })}
                />
                <Input
                  placeholder="Atas Nama"
                  value={account.accountName}
                  onChange={(e) => updateBankAccount(account.id, { accountName: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeBankAccount(account.id)}
                title="Hapus"
                aria-label={`Hapus rekening ${account.bankName || account.id}`}
                className="self-start rounded-md p-2 text-destructive hover:bg-destructive-bg sm:self-center"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" onClick={addBankAccount} className="self-start">
            <Plus className="h-4 w-4" /> Tambah Rekening
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QRIS</CardTitle>
          <CardDescription>
            Upload foto QRIS statis dari bank/penyedia QRIS kamu. Isi payload EMV (opsional) supaya nominal + kode unik
            terkunci otomatis di QR yang dilihat customer — kosongkan kalau tidak tahu caranya (customer akan diminta
            ketik manual nominalnya).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {form.qrisAccounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
              <div className="flex items-start gap-3">
                {account.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.imageUrl} alt="QRIS" className="h-20 w-20 rounded border border-border object-contain p-1" />
                )}
                <div className="flex flex-1 flex-col gap-2">
                  <Input placeholder="Nama (mis. QRIS BCA)" value={account.name} onChange={(e) => updateQrisAccount(account.id, { name: e.target.value })} />
                  <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleQrisImageChange(account.id, e.target.files?.[0])} />
                </div>
                <button
                  type="button"
                  onClick={() => removeQrisAccount(account.id)}
                  title="Hapus"
                  aria-label={`Hapus QRIS ${account.name || account.id}`}
                  className="rounded-md p-2 text-destructive hover:bg-destructive-bg"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={account.isDynamic}
                  onChange={(e) => updateQrisAccount(account.id, { isDynamic: e.target.checked })}
                />
                Dinamis (kunci nominal otomatis)
              </label>
              {account.isDynamic && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-foreground">Payload EMV (dari scan/decode QRIS statis di atas)</span>
                  <textarea
                    className="flex w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10"
                    rows={2}
                    value={account.emvPayload}
                    onChange={(e) => updateQrisAccount(account.id, { emvPayload: e.target.value })}
                  />
                </label>
              )}
            </div>
          ))}
          <Button variant="outline" onClick={addQrisAccount} className="self-start">
            <Plus className="h-4 w-4" /> Tambah QRIS
          </Button>
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
