import { cn } from "@/lib/utils";

// Satu sumber kebenaran ukuran judul halaman — sebelumnya tiap halaman
// admin hand-code `<h1 className="text-3xl font-bold ...">` sendiri,
// rawan drift ukuran/spacing diam-diam antar halaman (§ ADR-0023).
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-4 compact:gap-3", className)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground compact:text-xl compact:font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
