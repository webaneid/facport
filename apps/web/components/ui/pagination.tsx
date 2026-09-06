import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Generik, dipakai `DataTable` (bawaan) DAN halaman yang belum migrasi
// ke `DataTable` — 1 tampilan Prev/Next+ringkasan halaman di semua
// listing (§ ADR-0023, sebelumnya tiap halaman hand-roll sendiri beda-beda).
export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number; // 0-based
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <p className="text-sm text-muted-foreground">
        Halaman {page + 1} dari {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-8 gap-1 px-2.5"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Sebelumnya
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 gap-1 px-2.5"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
        >
          Berikutnya
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
