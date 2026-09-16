import { cn } from "@/lib/utils";

// § architecture-app-dashboard.md — primitif semantik + `overflow-x-auto`
// bawaan (WAJIB, § artifact/responsive convention: tabel lebar tidak boleh
// bikin body ikut scroll horizontal). Dipakai bareng `@tanstack/react-table`
// (ADR-0004) untuk sorting/pagination kalau perlu — komponen ini cuma
// urusan tampilan, bukan logic data.
// § ADR-0034 (2026-09-17) — `table-fixed` (BUKAN `table-auto` default
// browser) supaya lebar kolom yang dideklarasikan tiap caller (className
// `w-[..]` di `TableHead`, atau `meta.width` via `DataTable`) BENAR-BENAR
// dihormati, bukan auto-mengikuti konten kolom terlebar (root cause tabel
// melebar tak terkendali sebelum ADR ini).
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full table-fixed text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground" {...props} />;
}

export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-border" {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-muted/50", className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap px-4 py-2 font-medium", className)} {...props} />;
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("whitespace-nowrap px-4 py-3", className)} {...props} />;
}
