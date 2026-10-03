"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Toggle on/off yang terlihat jelas bisa diklik (track + knob), untuk status Aktif/Non-aktif dan sejenisnya.
// Aksesibel: role="switch" + aria-checked, bisa dioperasikan keyboard (Space/Enter) karena memakai <button>.
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "type">) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary-500" : "bg-muted-foreground/30",
        className,
      )}
      {...props}
    >
      <span
        className={cn("pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")}
      />
    </button>
  );
}
