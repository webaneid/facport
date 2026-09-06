import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "outline" | "ghost" | "destructive" | "secondary";
export type ButtonSize = "default" | "sm" | "icon";

// Class string diekspor terpisah dari komponen `<button>`-nya — dipakai
// juga di elemen non-button (mis. `<Link>`) yang butuh TAMPILAN sama
// (pola shadcn `buttonVariants`, tanpa perlu dependency `@radix-ui/react-slot`
// buat `asChild`).
export function buttonVariants(variant: ButtonVariant = "default", classNameOrSize?: string | ButtonSize, className?: string) {
  // § ADR-0023 — sebelumnya dipanggil `buttonVariants(variant, className)`.
  // Overload dipertahankan: kalau argumen ke-2 bukan salah satu ButtonSize
  // yang dikenal, perlakukan sebagai `className` (perilaku lama, backward
  // compatible dengan semua caller existing).
  const isSize = classNameOrSize === "sm" || classNameOrSize === "icon" || classNameOrSize === "default";
  const size: ButtonSize = isSize ? (classNameOrSize as ButtonSize) : "default";
  const finalClassName = isSize ? className : classNameOrSize;

  return cn(
    // § Fase 24, ADR-0024 — `rounded-md`→`rounded-xl` (bumped, cocok
    // gaya Admin UI Kit v2 yang lebih rounded — lihat spec sumber
    // `architecture-component-ui-primitives.md`). Warna TETAP lewat
    // token `primary-*`/`destructive`/`muted`/`border` yang sudah
    // di-reskin biru di `globals.css` — TIDAK perlu ganti di sini.
    "inline-flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50",
    size === "default" && "px-3.5 py-2",
    size === "sm" && "h-8 px-2.5 text-xs",
    size === "icon" && "h-8 w-8 p-0",
    variant === "default" &&
      "bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow-[var(--shadow-card)] active:bg-primary-800",
    variant === "outline" && "border border-border bg-background hover:border-primary-300 hover:bg-muted",
    variant === "ghost" && "hover:bg-muted",
    variant === "destructive" && "bg-destructive text-white shadow-sm hover:opacity-90",
    variant === "secondary" && "bg-muted text-foreground hover:bg-border/60",
    finalClassName,
  );
}

// § Fase 24, ADR-0024 — prop `loading` BARU (opsional, tidak mematahkan
// pemakai lama): tampilkan spinner + `disabled` otomatis, GANTIKAN pola
// manual "disable saat loading" yang sebelumnya ditulis ulang per
// halaman (`disabled={submitting}` + teks "Menyimpan..." manual) — pola
// lama TETAP jalan (prop ini opsional), migrasi ke `loading` per
// halaman menyusul bertahap, bukan dipaksa sekarang.
export function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button className={buttonVariants(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
