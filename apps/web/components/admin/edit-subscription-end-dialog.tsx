"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { addDaysToDateString, endOfDayInTimezone } from "@/lib/timezone";

// § diminta user 2026-10-03 — ubah/perpanjang masa aktif langganan langsung dari halaman detail user (kolom "Aksi"),
// bukan cuma dari dialog "Kelola Langganan" di daftar user. Memakai endpoint yang sama (`PATCH /admin/subscriptions/:id`,
// hanya untuk langganan AKTIF, tanggal baru harus di masa depan). Tombol cepat menambah hari dari tanggal expired SAAT INI
// (bukan dari hari ini) — perpanjangan tidak memotong sisa masa aktif.
function dateInTimezone(iso: string | null, timezone: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
}

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
  const currentDate = dateInTimezone(endAt, timezone);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    const res = await api.admin.subscriptions({ id: subscriptionId }).patch({ endAt: endOfDayInTimezone(value, timezone).toISOString() });
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
          setValue(currentDate);
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
            {currentDate && (
              <>
                {" "}
                — berlaku sampai <strong className="text-foreground">{currentDate}</strong>
              </>
            )}
            .
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Tanggal Expired Baru</span>
            <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          {currentDate && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Perpanjang dari tanggal sekarang:</span>
              {[30, 90, 365].map((days) => (
                <Button key={days} variant="outline" onClick={() => setValue(addDaysToDateString(currentDate, days))} className="h-7 px-2.5 py-0 text-xs">
                  +{days} hari
                </Button>
              ))}
            </div>
          )}
          <Button onClick={handleSave} disabled={saving || !value} className="self-end">
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
