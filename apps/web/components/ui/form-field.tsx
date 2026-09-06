import { cn } from "@/lib/utils";

// § Fase 25, ADR-0024 — GANTI pola manual `<label className="flex
// flex-col gap-1.5"><span className="text-xs font-medium
// text-foreground">Label</span>{children}</label>` yang berulang di
// hampir semua form project ini — struktur label/error/hint SERAGAM.
// Dipasang di ≥2 form (`CreateInvoiceDialog`, `ProfileSettings`) sesuai
// prinsip ADR-0024 "primitif baru wajib dipakai nyata" — TIDAK memaksa
// migrasi SEMUA form existing sekaligus (pelajaran Fase 24: jangan
// churn tanpa manfaat jelas per file, adopsi bertahap wajar).
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
