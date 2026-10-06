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
import { addCalendarMonths } from "@/lib/subscription-period";
import { formatDate } from "@/lib/utils";

// § diminta user 2026-10-03 — ubah/perpanjang masa aktif langganan langsung dari halaman detail user (kolom "Aksi"),
// bukan cuma dari dialog "Kelola Langganan" di daftar user. Memakai endpoint yang sama (`PATCH /admin/subscriptions/:id`,
// hanya untuk langganan AKTIF, tanggal baru harus di masa depan). Tombol cepat menambah hari dari tanggal expired SAAT INI
// (bukan dari hari ini) — perpanjangan tidak memotong sisa masa aktif.
// § Fase 174, ADR-0041 — tanggal AKHIR kini tanggal + JAM (zona perusahaan), tombol cepat memakai bulan/tahun KALENDER (jam tetap, dari akhir saat ini),
// dan nilai yang tidak diubah tidak pernah dikirim ulang (detik pelanggan tidak terpotong). Mengubah tanggal manual mengosongkan jangkar periode di server.
const QUICK_EXTENSIONS = [
  { months: 1, label: "+1 bulan" },
  { months: 3, label: "+3 bulan" },
  { months: 12, label: "+1 tahun" },
];

export function EditSubscriptionEndDialog({
  subscriptionId,
  planName,
  status,
  endAt,
  onSaved,
}: {
  subscriptionId: string;
  planName: string;
  status: string;
  endAt: string | null;
  onSaved: () => void;
}) {
  const timezone = useCompanyTimezone();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const editable = status === "active";
  const currentLabel = endAt ? `${formatDate(endAt, timezone)} ${timezoneAbbreviation(timezone)}` : "";
  const changed = value !== "" && value !== endAt;

  async function handleSave() {
    if (!changed) return;
    setSaving(true);
    const res = await api.admin.subscriptions({ id: subscriptionId }).patch({ endAt: value });
    setSaving(false);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(
        code === "END_AT_MUST_BE_FUTURE"
          ? "Tanggal expired harus di masa depan."
          : code === "SUBSCRIPTION_NOT_ACTIVE"
            ? "Hanya langganan yang masih aktif yang bisa diubah."
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
            <DateTimeField value={value} onChange={setValue} timeZone={timezone} ariaLabel="Expired baru" />
          </label>
          {endAt && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Perpanjang dari tanggal &amp; jam berakhir saat ini:</span>
              {QUICK_EXTENSIONS.map(({ months, label }) => (
                <Button key={months} variant="outline" onClick={() => setValue(addCalendarMonths(new Date(endAt), months, timezone).toISOString())} className="h-7 px-2.5 py-0 text-xs">
                  {label}
                </Button>
              ))}
            </div>
          )}
          <Button onClick={handleSave} disabled={saving || !changed} className="self-end">
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
