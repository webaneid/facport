"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  className,
  children,
  variant = "default",
  hideClose = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** § Fase 144 — "glass": kaca-transparan (popup gerbang koneksi Accurate), gaya di `globals.css` (.glass-card/.glass-overlay). */
  variant?: "default" | "glass";
  /** Sembunyikan tombol X (dialog yang menyediakan aksi tutup sendiri, mis. tombol "Nanti"). */
  hideClose?: boolean;
}) {
  const glass = variant === "glass";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={glass ? "glass-overlay fixed inset-0 z-50" : "fixed inset-0 z-50 bg-black/40"} />
      <DialogPrimitive.Content
        className={cn(
          // § Fase 24, ADR-0024 — radius+shadow dibumpin cocok gaya Modal
          // Admin UI Kit v2 (spec `architecture-component-feedback.md`),
          // tetap Radix Dialog (focus-trap/portal teruji) — bukan Modal
          // custom baru, lihat phase-24 doc § Keputusan Kecil.
          // § Fase 126 — `max-h-[85vh] overflow-y-auto` (bug ditemukan
          // user: form panjang seperti "Tambah Paket", yang makin panjang
          // seiring jumlah modul bertambah, tumpah ke luar viewport TANPA
          // cara scroll — tombol submit di bawah jadi tidak terjangkau
          // sama sekali). Komponen SHARED dipakai semua dialog di app,
          // bukan tambal 1 halaman.
          glass
            ? "glass-card fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-7"
            : "fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-white p-6 shadow-[0_30px_70px_rgba(16,24,40,.22)]",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 pr-6", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex items-center justify-end gap-2", className)} {...props} />;
}
