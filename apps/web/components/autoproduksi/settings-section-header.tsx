import type { LucideIcon } from "lucide-react";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// § diminta user 2026-10-03 — halaman Pengaturan AutoProduksi punya beberapa bagian (Akun Perantara, Default Cabang & Gudang)
// yang dulu tidak jelas batasnya: tombol "Buat Akun Baru" menempel di judul HALAMAN, padahal miliknya bagian Akun Perantara di bawah.
// Header seragam ini: ikon + judul + penjelasan di kiri, tombol aksi bagian itu di kanan — jadi tombol selalu ada DI DALAM kartu
// yang dikelolanya, tidak pernah di judul halaman.
export function SettingsSectionHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border pb-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500">
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </CardHeader>
  );
}
