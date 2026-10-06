"use client";

import { cn } from "@/lib/utils";

// § Fase 178 — pilihan MODE PEMBAYARAN saat admin memberi paket (Tambah User & Kelola Langganan). Tiga mode, dibedakan jelas karena berdampak ke pembukuan:
//  - invoice      : kirim invoice, customer membayar sendiri (aktif setelah pembayaran disetujui);
//  - paid_invoice : invoice dibuat OTOMATIS LUNAS + langganan langsung aktif (ada catatan & PDF invoice);
//  - free         : aktifkan langsung TANPA invoice (hadiah/kompensasi/kontrak khusus).
export type PaymentMode = "invoice" | "paid_invoice" | "free";

const OPTIONS: { value: PaymentMode; label: string; description: string }[] = [
  { value: "invoice", label: "Kirim invoice", description: "Customer membayar sendiri lewat halaman tagihan. Langganan aktif setelah pembayaran disetujui." },
  { value: "paid_invoice", label: "Sudah dibayar", description: "Invoice dibuat otomatis berstatus LUNAS dan langganan langsung aktif. Ada catatan & PDF invoice untuk pembukuan." },
  { value: "free", label: "Gratis (tanpa invoice)", description: "Langganan langsung aktif tanpa invoice — untuk hadiah, kompensasi, atau kontrak khusus. Boleh atur tanggal & jam expired sendiri." },
];

export function PaymentModeField({
  value,
  onChange,
  allowed,
  disabled,
}: {
  value: PaymentMode;
  onChange: (mode: PaymentMode) => void;
  /** Mode yang boleh dipilih pemanggil (menurut izin); sisanya disembunyikan. */
  allowed: PaymentMode[];
  disabled?: boolean;
}) {
  const options = OPTIONS.filter((o) => allowed.includes(o.value));
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-xs font-medium text-foreground">Pembayaran</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn("flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2", value === o.value ? "border-primary-500 bg-primary-50" : "border-border hover:bg-muted/50")}
        >
          <input type="radio" name="payment-mode" className="mt-1" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="flex flex-col">
            <span className="text-foreground">{o.label}</span>
            <span className="text-xs text-muted-foreground">{o.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
