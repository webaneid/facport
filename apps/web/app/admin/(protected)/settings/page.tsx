"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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
// § diminta user 2026-09-06 — batas wajar estimasi detik input manual
// per baris (§ apps/api/src/lib/manual-input-estimate.ts, SATU sumber
// kebenaran angka ini — jangan duplikasi batasnya di tempat lain).
const MIN_MANUAL_INPUT_SECONDS = 1;
// § ketemu 2026-09-06 — payload EMV disalin dari alat scan/decode QR
// eksternal ke Textarea di bawah HAMPIR SELALU ikut bawa whitespace/
// newline, bikin payload yang SEBENARNYA valid ditolak validasi
// `$`-anchored di server (§ apps/api/src/lib/qris-emv.ts) dengan pesan
// generik. Cek struktural yang SAMA (mirror, bukan import — apps/web
// tidak boleh import runtime code apps/api) dijalankan di CLIENT juga,
// terhadap versi TRIM, supaya admin dapat feedback SPESIFIK sebelum
// submit, bukan cuma "Gagal menyimpan pengaturan".
function isLikelyValidEmvPayload(payload: string): boolean {
  return payload.startsWith("0002") && /6304[0-9A-Fa-f]{4}$/.test(payload);
}
const MAX_MANUAL_INPUT_SECONDS = 3600;
// § Fase 43 — batas GLOBAL trial (§ apps/api/src/lib/trial.ts, SATU sumber
// kebenaran angka ini — jangan duplikasi batasnya di tempat lain).
const MIN_TRIAL_MAX_ROWS = 1;
const MAX_TRIAL_MAX_ROWS = 100000;
const MIN_TRIAL_DURATION_DAYS = 1;
const MAX_TRIAL_DURATION_DAYS = 365;

type FormState = {
  companyName: string;
  companyAddress: string;
  companyTimezone: string;
  retentionDays: string;
  manualInputSeconds: string;
  trialMaxRows: string;
  trialDurationDays: string;
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
        manualInputSeconds: String(data["data.manualInputSecondsPerRow"] ?? 30),
        trialMaxRows: String(data["trial.maxRows"] ?? 100),
        trialDurationDays: String(data["trial.durationDays"] ?? 30),
        companyTaxId: String(billing["company.taxId"] ?? ""),
        companyPhone: String(billing["company.phone"] ?? ""),
        companyEmail: String(billing["company.email"] ?? ""),
        companyBankAccount: String(billing["company.bankAccount"] ?? ""),
        bankAccounts: (billing["company.bankAccounts"] as BankAccount[] | undefined) ?? [],
        // § ketemu 2026-09-06 — entri QRIS lama (disimpan SEBELUM field
        // `emvPayload` ada, § Fase 16 ADR-0022) tidak punya field ini sama
        // sekali di DB — `undefined`, bukan `""`. Normalisasi DI SINI
        // (bukan cuma di `handleSave`) supaya render (`account.emvPayload`
        // di Textarea) juga tidak crash, dan state selalu konsisten
        // dengan tipe `QrisAccount` (semua field WAJIB ada, bukan opsional).
        qrisAccounts: ((billing["company.qrisAccounts"] as Partial<QrisAccount>[] | undefined) ?? []).map((a) => ({
          id: a.id ?? crypto.randomUUID(),
          name: a.name ?? "",
          imageUrl: a.imageUrl ?? "",
          isDynamic: a.isDynamic ?? false,
          emvPayload: a.emvPayload ?? "",
        })),
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

  // § diminta user 2026-09-06 — barcode QRIS yang diupload SUDAH berisi
  // persis payload EMV yang dicari, server sekarang baca LANGSUNG dari
  // gambarnya (§ apps/api/src/routes/admin/branding.route.ts,
  // `decodeQrisEmvPayload`) — admin TIDAK PERLU lagi cari alat scan/decode
  // eksternal & copy-paste manual (sumber bug whitespace, § lessons-learned.md
  // 2026-09-06). Kalau decode berhasil, `isDynamic` diaktifkan OTOMATIS
  // (itu tujuan utamanya, § permintaan user). Kalau gagal (foto buram/
  // bukan QRIS), fallback ke isian manual TETAP ada — bukan dihilangkan.
  async function handleQrisImageChange(id: string, file: File | undefined) {
    if (!file) return;
    const res = await api.admin.branding["qris-image"].post({ file });
    if (res.error || !res.data) {
      toast.error("Gagal upload foto QRIS — cek tipe file (JPEG/PNG/WebP) & ukuran (maks 5MB).");
      return;
    }
    const { url, emvPayload } = res.data as { url: string; emvPayload: string | null };
    if (emvPayload) {
      updateQrisAccount(id, { imageUrl: url, emvPayload, isDynamic: true });
      toast.success("Payload EMV terbaca otomatis dari barcode QRIS — QRIS ini jadi dinamis.");
    } else {
      updateQrisAccount(id, { imageUrl: url });
      toast.warning("Payload EMV tidak terbaca otomatis dari foto ini — isi manual di bawah kalau QRIS ini mau dijadikan dinamis, atau biarkan sebagai QRIS statis.");
    }
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

    const manualInputSeconds = Number(form.manualInputSeconds);
    if (!Number.isInteger(manualInputSeconds) || manualInputSeconds < MIN_MANUAL_INPUT_SECONDS || manualInputSeconds > MAX_MANUAL_INPUT_SECONDS) {
      setError(`Estimasi waktu input manual harus angka bulat ${MIN_MANUAL_INPUT_SECONDS}–${MAX_MANUAL_INPUT_SECONDS} detik.`);
      return;
    }

    const trialMaxRows = Number(form.trialMaxRows);
    if (!Number.isInteger(trialMaxRows) || trialMaxRows < MIN_TRIAL_MAX_ROWS || trialMaxRows > MAX_TRIAL_MAX_ROWS) {
      setError(`Batas baris trial harus angka bulat ${MIN_TRIAL_MAX_ROWS}–${MAX_TRIAL_MAX_ROWS}.`);
      return;
    }
    const trialDurationDays = Number(form.trialDurationDays);
    if (!Number.isInteger(trialDurationDays) || trialDurationDays < MIN_TRIAL_DURATION_DAYS || trialDurationDays > MAX_TRIAL_DURATION_DAYS) {
      setError(`Durasi trial harus angka bulat ${MIN_TRIAL_DURATION_DAYS}–${MAX_TRIAL_DURATION_DAYS} hari.`);
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

    // § trim SEBELUM validasi & kirim — root cause bug 2026-09-06 (payload
    // valid ditolak gara-gara whitespace tersalin dari alat scan eksternal).
    const normalizedQrisAccounts = form.qrisAccounts.map((a) => ({ ...a, emvPayload: (a.emvPayload ?? "").trim() }));
    const invalidQris = normalizedQrisAccounts.find((a) => a.isDynamic && !isLikelyValidEmvPayload(a.emvPayload));
    if (invalidQris) {
      setError(
        `Payload EMV untuk QRIS "${invalidQris.name}" tidak valid — pastikan payload disalin UTUH dari hasil scan/decode QRIS statis (harus diawali "0002" dan diakhiri kode CRC "6304XXXX").`,
      );
      return;
    }

    setSaving(true);
    const res = await api.settings.put([
      { key: "company.name", value: form.companyName, group: "general" },
      { key: "company.address", value: form.companyAddress, group: "general" },
      { key: "company.timezone", value: form.companyTimezone, group: "general" },
      { key: "data.importRetentionDays", value: retentionDays, group: "data" },
      { key: "data.manualInputSecondsPerRow", value: manualInputSeconds, group: "data" },
      { key: "trial.maxRows", value: trialMaxRows, group: "data" },
      { key: "trial.durationDays", value: trialDurationDays, group: "data" },
      { key: "company.taxId", value: form.companyTaxId, group: "billing" },
      { key: "company.phone", value: form.companyPhone, group: "billing" },
      { key: "company.email", value: form.companyEmail, group: "billing" },
      { key: "company.bankAccount", value: form.companyBankAccount, group: "billing" },
      { key: "company.bankAccounts", value: form.bankAccounts, group: "billing" },
      { key: "company.qrisAccounts", value: normalizedQrisAccounts, group: "billing" },
    ]);
    setSaving(false);
    if (res.error) {
      const value = res.error.value as {
        code?: string;
        maxDays?: number;
        minDays?: number;
        minSeconds?: number;
        maxSeconds?: number;
        qrisId?: string;
        minRows?: number;
        maxRows?: number;
      } | undefined;
      setError(
        value?.code === "INVALID_RETENTION_DAYS"
          ? `Retensi data harus angka bulat 1–${value.maxDays} hari.`
          : value?.code === "INVALID_MANUAL_INPUT_SECONDS"
            ? `Estimasi waktu input manual harus angka bulat ${value.minSeconds}–${value.maxSeconds} detik.`
            : value?.code === "INVALID_TRIAL_MAX_ROWS"
              ? `Batas baris trial harus angka bulat ${value.minRows}–${value.maxRows}.`
              : value?.code === "INVALID_TRIAL_DURATION_DAYS"
                ? `Durasi trial harus angka bulat ${value.minDays}–${value.maxDays} hari.`
                : value?.code === "INVALID_QRIS_ACCOUNTS"
                  ? `Payload EMV salah satu QRIS tidak valid (${normalizedQrisAccounts.find((a) => a.id === value.qrisId)?.name ?? "cek kembali entri QRIS"}) — pastikan disalin utuh dari hasil scan QRIS statis.`
                  : value?.code === "INVALID_BANK_ACCOUNTS"
                    ? "Data rekening bank tidak lengkap — pastikan semua field terisi."
                    : "Gagal menyimpan pengaturan.",
      );
      return;
    }
    setForm({ ...form, qrisAccounts: normalizedQrisAccounts });
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
      <PageHeader title="Pengaturan" description="Pengaturan umum Facport." />

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
            <Textarea
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
            Upload foto QRIS statis dari bank/penyedia QRIS kamu — payload EMV di dalam barcode-nya DIBACA OTOMATIS
            (tidak perlu scan/decode manual pakai alat lain), supaya nominal + kode unik terkunci otomatis di QR yang
            dilihat customer. Kalau foto tidak bisa dibaca otomatis (misal buram), payload EMV bisa diisi manual, atau
            biarkan sebagai QRIS statis biasa (customer ketik nominal sendiri).
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
                <Checkbox checked={account.isDynamic} onCheckedChange={(checked) => updateQrisAccount(account.id, { isDynamic: checked === true })} />
                Dinamis (kunci nominal otomatis)
              </label>
              {account.isDynamic && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-foreground">Payload EMV (terisi otomatis dari foto QRIS di atas — bisa diedit manual kalau perlu)</span>
                  <Textarea
                    className="font-mono text-xs"
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
            Berapa hari riwayat import Excel (semua fitur — Faktur Pembelian, Faktur Penjualan, Akun Hutang Pemasok,
            Purchase Payment, Sales Receipt, Jurnal Umum) disimpan sebelum dihapus otomatis. Data client bersifat
            sensitif — maksimal {MAX_RETENTION_DAYS} hari, tidak bisa diatur lebih lama.
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

      <Card>
        <CardHeader>
          <CardTitle>Estimasi Waktu Input Manual per Baris</CardTitle>
          <CardDescription>
            Perkiraan rata-rata waktu (dalam detik) yang dibutuhkan staf untuk menginput 1 baris data transaksi secara
            manual langsung di Accurate Online (tanpa Facport). Angka ini dipakai untuk menghitung estimasi
            &ldquo;efisiensi waktu kerja&rdquo; yang ditampilkan ke pelanggan di dashboard mereka — semakin akurat
            angkanya, semakin meyakinkan klaim penghematan waktunya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex max-w-xs flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Detik per Baris</span>
            <Input
              type="number"
              min={MIN_MANUAL_INPUT_SECONDS}
              max={MAX_MANUAL_INPUT_SECONDS}
              value={form.manualInputSeconds}
              onChange={(e) => setForm({ ...form, manualInputSeconds: e.target.value })}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Trial</CardTitle>
          <CardDescription>
            Semua paket bisa dicoba gratis oleh customer (1x seumur hidup per fitur, tombol &ldquo;Coba Gratis&rdquo;
            di halaman langganan). Dibatasi jumlah baris Excel yang berhasil diimport, BUKAN jumlah hari — begitu
            kuota baris habis, customer wajib upgrade ke paket berbayar untuk lanjut import. Berlaku GLOBAL untuk
            semua fitur, tidak perlu diatur per-paket.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <label className="flex max-w-xs flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Batas Baris Trial</span>
            <Input
              type="number"
              min={MIN_TRIAL_MAX_ROWS}
              max={MAX_TRIAL_MAX_ROWS}
              value={form.trialMaxRows}
              onChange={(e) => setForm({ ...form, trialMaxRows: e.target.value })}
            />
          </label>
          <label className="flex max-w-xs flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Durasi Trial (Hari)</span>
            <Input
              type="number"
              min={MIN_TRIAL_DURATION_DAYS}
              max={MAX_TRIAL_DURATION_DAYS}
              value={form.trialDurationDays}
              onChange={(e) => setForm({ ...form, trialDurationDays: e.target.value })}
            />
          </label>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
      <Button onClick={handleSave} disabled={saving} className="self-start">
        {saving ? "Menyimpan..." : "Simpan Pengaturan"}
      </Button>
    </div>
  );
}
