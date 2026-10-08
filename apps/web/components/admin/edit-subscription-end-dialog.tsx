"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DateTimeField } from "@/components/ui/date-time-field";
import { api } from "@/lib/api-client";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { timezoneAbbreviation } from "@/lib/timezone";
import { computeRenewalEnd, type SubscriptionInterval } from "@/lib/subscription-period";
import { formatDate } from "@/lib/utils";

// § diminta user 2026-10-03 — ubah/perpanjang masa aktif langganan langsung dari halaman detail user (kolom "Aksi"),
// bukan cuma dari dialog "Kelola Langganan" di daftar user. Memakai endpoint yang sama (`PATCH /admin/subscriptions/:id`,
// hanya untuk langganan AKTIF, tanggal baru harus di masa depan). Tombol cepat menambah hari dari tanggal expired SAAT INI
// (bukan dari hari ini) — perpanjangan tidak memotong sisa masa aktif.
// § Fase 174, ADR-0041 — tanggal AKHIR kini tanggal + JAM (zona perusahaan), tombol cepat memakai bulan/tahun KALENDER (jam tetap, dari akhir saat ini),
// dan nilai yang tidak diubah tidak pernah dikirim ulang (detik pelanggan tidak terpotong). Mengubah tanggal manual mengosongkan jangkar periode di server.
// § Fase 180 — tombol cepat memakai PERPANJANGAN SERVER berbasis jangkar (`POST /admin/subscriptions/:id/extend`, aturan SAMA dengan Assign/konfirmasi pembayaran: tanggal tidak
// bergeser di akhir bulan, mis. mulai 31 Jan → 28 Feb → 31 Mar), bukan lagi menyimpan tanggal hasil hitung klien lewat PATCH (yang mengosongkan jangkar). Pratinjau di kolom
// tanggal dihitung dengan fungsi yang SAMA (`computeRenewalEnd`). Mengedit tanggal secara manual setelah itu kembali ke PATCH (tanggal persis, jangkar dikosongkan — disengaja).
const QUICK_EXTENSIONS: { label: string; interval: SubscriptionInterval; periods: number }[] = [
  { label: "+1 bulan", interval: "monthly", periods: 1 },
  { label: "+3 bulan", interval: "monthly", periods: 3 },
  { label: "+1 tahun", interval: "yearly", periods: 1 },
];

export function EditSubscriptionEndDialog({
  subscriptionId,
  planName,
  status,
  endAt,
  periodAnchorAt,
  periodMonths,
  onSaved,
}: {
  subscriptionId: string;
  planName: string;
  status: string;
  endAt: string | null;
  // § Fase 180 — jangkar periode langganan (untuk pratinjau perpanjangan; NULL = data lama / tanggal pernah diubah manual).
  periodAnchorAt?: string | null;
  periodMonths?: number | null;
  onSaved: () => void;
}) {
  const timezone = useCompanyTimezone();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  // Perpanjangan yang dipilih lewat tombol cepat (null = tanggal diketik manual → PATCH).
  const [extension, setExtension] = useState<{ interval: SubscriptionInterval; periods: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const editable = status === "active";
  const currentLabel = endAt ? `${formatDate(endAt, timezone)} ${timezoneAbbreviation(timezone)}` : "";
  const changed = value !== "" && value !== endAt;

  async function handleSave() {
    if (!changed) return;
    setSaving(true);
    const res = extension
      ? await api.admin.subscriptions({ id: subscriptionId }).extend.post(extension)
      : await api.admin.subscriptions({ id: subscriptionId }).patch({ endAt: value });
    setSaving(false);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(
        code === "END_AT_MUST_BE_FUTURE"
          ? "Tanggal expired harus di masa depan."
          : code === "SUBSCRIPTION_NOT_ACTIVE" || code === "SUBSCRIPTION_NOT_RENEWABLE"
            ? "Hanya langganan yang masih aktif (belum berakhir) yang bisa diubah/diperpanjang."
            : code === "TRIAL_NOT_EXTENDABLE"
              ? "Trial tidak diperpanjang di sini — assign paket asli."
              : "Gagal ubah masa aktif — coba lagi.",
      );
      return;
    }
    toast.success("Masa aktif berhasil diubah.");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        disabled={!editable}
        onClick={() => {
          setValue(endAt ?? "");
          setExtension(null);
          setOpen(true);
        }}
        title={editable ? "Ubah / perpanjang masa aktif" : "Hanya langganan aktif yang bisa diubah — untuk yang sudah berakhir, assign paket baru"}
        aria-label={`Ubah masa aktif ${planName}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0 disabled:opacity-30")}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <DialogContent>
        <DialogTitle>Ubah Masa Aktif</DialogTitle>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            Paket <strong className="text-foreground">{planName}</strong>
            {currentLabel && (
              <>
                {" "}
                — berlaku sampai <strong className="text-foreground">{currentLabel}</strong>
              </>
            )}
            .
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Tanggal &amp; Jam Expired Baru</span>
            <DateTimeField
              value={value}
              onChange={(iso) => {
                setExtension(null); // diketik manual → tanggal persis (PATCH), bukan perpanjangan berbasis jangkar
                setValue(iso);
              }}
              timeZone={timezone}
              ariaLabel="Expired baru"
            />
          </label>
          {endAt && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Perpanjang dari tanggal &amp; jam berakhir saat ini:</span>
              {QUICK_EXTENSIONS.map(({ label, interval, periods }) => (
                <Button
                  key={label}
                  variant="outline"
                  onClick={() => {
                    const next = computeRenewalEnd(
                      { endAt: new Date(endAt), periodAnchorAt: periodAnchorAt ? new Date(periodAnchorAt) : null, periodMonths: periodMonths ?? null },
                      interval,
                      timezone,
                      periods,
                    );
                    setValue(next.endAt.toISOString());
                    setExtension({ interval, periods });
                  }}
                  className={`h-7 px-2.5 py-0 text-xs ${extension?.interval === interval && extension.periods === periods ? "border-primary-600 bg-primary-50" : ""}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          {extension && <p className="text-xs text-muted-foreground">Perpanjangan dihitung dari jangkar langganan — tanggal tidak bergeser di akhir bulan. Mengetik tanggal sendiri mengganti ini dengan tanggal persis.</p>}
          <Button onClick={handleSave} disabled={saving || !changed} className="self-end">
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
