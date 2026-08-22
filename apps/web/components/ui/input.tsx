import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10",
        className,
      )}
      {...props}
    />
  );
}
