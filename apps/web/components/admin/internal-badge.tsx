import { Badge } from "@/components/ui/badge";

// § Fase 189G, ADR-0044 — lencana status INTERNAL (trainer, karyawan, mitra). "role" = internal otomatis karena memegang role Admin/Super Admin (tidak bisa dicabut
// lewat tanda); "flag" = ditandai Super Admin. Komersil (null) tidak diberi lencana (default, tidak perlu ramai).
export type InternalReason = "role" | "flag" | null;

export function InternalBadge({ reason, className }: { reason: InternalReason | undefined; className?: string }) {
  if (!reason) return null;
  return (
    <Badge variant="warning" className={className} title={reason === "role" ? "Internal otomatis: akun ini memegang role Admin/Super Admin" : "Ditandai internal oleh Super Admin"}>
      {reason === "role" ? "Internal · admin" : "Internal"}
    </Badge>
  );
}
