import { cn } from "@/lib/utils";

// § Fase 24, ADR-0024 — `rounded-xl`→`rounded-2xl`, `border-border/60`→
// `border-border` (opacity dilepas, warna sudah cukup lembut lewat
// token `--admin-line` yang di-reskin di globals.css) — cocok gaya
// Admin UI Kit v2. API/nama TIDAK berubah (`CardContent`, bukan
// `CardBody` — lihat phase-24 doc § Keputusan Kecil kenapa nama
// dipertahankan).
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-border bg-background shadow-[var(--shadow-card)]", className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-6 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold tracking-tight text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 p-6 pt-0", className)} {...props} />;
}
