"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

// § diminta client 2026-10-02 — Akun Perantara jadi master data lokal
// (bukan live-search Accurate lagi). Dialog ini dipakai DUA tempat:
// halaman Settings AutoProduksi (Tambah/Edit penuh) DAN form Formula
// (tombol "+ Buat Akun Baru" di sebelah Combobox pilih akun — submit
// langsung tersimpan DAN otomatis terpilih lewat `onSaved`).
export type IntermediaryAccount = { id: string; accountNo: string; accountName: string };

export function IntermediaryAccountFormDialog({
  account,
  trigger,
  onSaved,
}: {
  account?: IntermediaryAccount;
  trigger?: "icon" | "button";
  onSaved: (account: IntermediaryAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  const [accountNo, setAccountNo] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset isian tiap dialog dibuka, pola standar
    setAccountNo(account?.accountNo ?? "");
    setAccountName(account?.accountName ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset isian tiap dialog dibuka, pola standar
  }, [open]);

  async function handleSave() {
    if (!accountNo.trim() || !accountName.trim()) {
      setError("Kode dan Nama Akun wajib diisi.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = { accountNo: accountNo.trim(), accountName: accountName.trim() };
    const res = account ? await api.autoproduksi.accounts({ id: account.id }).put(body) : await api.autoproduksi.accounts.post(body);
    setSubmitting(false);
    if (res.error) {
      const value = res.error.value as { code?: string } | undefined;
      setError(value?.code === "ACCOUNT_NO_DUPLICATE" ? "Kode akun ini sudah ada di daftar — pakai kode lain atau pilih yang sudah ada." : "Gagal menyimpan akun — coba lagi.");
      return;
    }
    const saved = (res.data as unknown as { account: IntermediaryAccount }).account;
    toast.success(account ? "Akun Perantara diperbarui." : "Akun Perantara dibuat.");
    setOpen(false);
    onSaved(saved);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {account ? (
        trigger === "icon" ? (
          <button type="button" onClick={() => setOpen(true)} title="Edit" aria-label={`Edit akun ${account.accountName}`} className={buttonVariants("ghost", "h-8 w-8 p-0")}>
            <Pencil className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className={buttonVariants("outline", "h-8")}>
            Edit
          </button>
        )
      ) : (
        <Button onClick={() => setOpen(true)} variant={trigger === "icon" ? "outline" : "default"} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Buat Akun Baru
        </Button>
      )}
      <DialogContent>
        <DialogTitle>{account ? "Edit Akun Perantara" : "Buat Akun Perantara Baru"}</DialogTitle>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Kode Akun</span>
            <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} placeholder="mis. 110501" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Nama Akun</span>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="mis. Perantara Produksi" />
          </label>
          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={submitting} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
