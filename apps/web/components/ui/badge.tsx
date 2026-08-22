import { cn } from "@/lib/utils";

const VARIANT_CLASSES = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary-100 text-primary-700",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  destructive: "bg-destructive-bg text-destructive",
} as const;

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof VARIANT_CLASSES };

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
