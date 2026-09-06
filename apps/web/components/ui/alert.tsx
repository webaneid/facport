import { Info, TriangleAlert, CircleCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANT_CLASSES = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  destructive: "bg-destructive-bg text-destructive",
} as const;

const VARIANT_ICON = {
  default: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleX,
} as const;

export type AlertVariant = keyof typeof VARIANT_CLASSES;

// Pengganti `<p className="rounded-md bg-warning-bg ...">` ad hoc yang
// ditulis ulang beda-beda per dialog/form (§ ADR-0023) — 1 komponen
// untuk semua pesan info/warning/error di admin & app.
export function Alert({
  variant = "default",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  const Icon = VARIANT_ICON[variant];
  return (
    <div
      className={cn("flex items-start gap-2.5 rounded-md px-3.5 py-3 text-sm", VARIANT_CLASSES[variant], className)}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
