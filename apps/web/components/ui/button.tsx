import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "outline" | "ghost";

// Class string diekspor terpisah dari komponen `<button>`-nya — dipakai
// juga di elemen non-button (mis. `<Link>`) yang butuh TAMPILAN sama
// (pola shadcn `buttonVariants`, tanpa perlu dependency `@radix-ui/react-slot`
// buat `asChild`).
export function buttonVariants(variant: ButtonVariant = "default", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-md px-3.5 py-2 text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50",
    variant === "default" &&
      "bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow-[var(--shadow-card)] active:bg-primary-800",
    variant === "outline" && "border border-border bg-background hover:border-primary-300 hover:bg-muted",
    variant === "ghost" && "hover:bg-muted",
    className,
  );
}

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return <button className={buttonVariants(variant, className)} {...props} />;
}
