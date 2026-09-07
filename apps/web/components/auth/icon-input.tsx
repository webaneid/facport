import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// § Redesain halaman auth (2026-09-07) — dipakai bareng `PasswordInput`
// (§ password-input.tsx) di semua form login/register/forgot/reset,
// murni presentasional (ikon kiri) — TIDAK ganti `Input` global (dipakai
// ~puluhan tempat non-auth, ganti di sana berisiko regresi visual yang
// tidak diminta).
export function IconInput({
  icon: Icon,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("pl-9", className)} {...props} />
    </div>
  );
}
