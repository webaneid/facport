"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { navItemsFor, type Surface } from "./sidebar";
import { breadcrumbLabel } from "@/lib/breadcrumb-label";

// § ADR-0024 — GANTI `currentPageLabel()` (1 label statis) jadi jejak
// navigasi penuh. Segmen PERTAMA dicocokkan ke nav item yang sudah ada
// (label manusiawi, mis. "Import Faktur Pembelian" bukan "Purchase
// Invoice"), sisa segmen (halaman detail lebih dalam, mis. `[batchId]`)
// di-title-case generik — cukup untuk kasus project ini, TIDAK perlu
// override manual per halaman (§ spec sumber menyarankan override kalau
// butuh nama data asli, mis. "Edit Kategori: Elektronik" — belum ada
// halaman sedalam itu di project ini sekarang).
export function Breadcrumbs({ surface }: { surface: Surface }) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname, surface);

  return (
    // § diminta user 2026-10-03 — breadcrumb tidak boleh melebar sampai menimpa logo tengah: `min-w-0` + tiap crumb punya batas
    // lebar (`max-w`) dan dipotong dengan `…` (`truncate`); crumb induk lebih sempit dari crumb terakhir (halaman yang sedang
    // dibuka paling penting). Kolom induknya sendiri dibatasi grid di `topbar.tsx`. Nilai lengkap tersedia lewat `title` (hover).
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-admin-muted" />}
          {i === crumbs.length - 1 ? (
            <span title={c.title ?? c.label} className="max-w-[14rem] truncate font-semibold text-admin-ink">
              {c.label}
            </span>
          ) : (
            <Link href={c.href} title={c.title ?? c.label} className="max-w-[8rem] truncate text-admin-muted hover:text-admin-ink">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

type Crumb = { href: string; label: string; title?: string };

function buildCrumbs(pathname: string, surface: Surface): Crumb[] {
  const navItems = [...navItemsFor(surface)].sort((a, b) => b.href.length - a.href.length);
  const matched = navItems.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));

  const crumbs: Crumb[] = [{ href: "/", label: "Dashboard" }];
  if (!matched || matched.href === "/") {
    return pathname === "/" ? crumbs : [...crumbs, { href: pathname, ...breadcrumbLabel(pathname.split("/").filter(Boolean).pop() ?? "") }];
  }

  crumbs.push({ href: matched.href, label: matched.label });
  const rest = pathname.slice(matched.href.length).split("/").filter(Boolean);
  let href = matched.href;
  for (const segment of rest) {
    href += `/${segment}`;
    crumbs.push({ href, ...breadcrumbLabel(segment) });
  }
  return crumbs;
}
