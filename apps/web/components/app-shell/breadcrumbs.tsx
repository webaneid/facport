"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { navItemsFor, type Surface } from "./sidebar";

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
    <nav className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-admin-muted" />}
          {i === crumbs.length - 1 ? (
            <span className="truncate font-semibold text-admin-ink">{c.label}</span>
          ) : (
            <Link href={c.href} className="truncate text-admin-muted hover:text-admin-ink">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function humanize(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildCrumbs(pathname: string, surface: Surface) {
  const navItems = [...navItemsFor(surface)].sort((a, b) => b.href.length - a.href.length);
  const matched = navItems.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));

  const crumbs = [{ href: "/", label: "Dashboard" }];
  if (!matched || matched.href === "/") {
    return pathname === "/" ? crumbs : [...crumbs, { href: pathname, label: humanize(pathname.split("/").filter(Boolean).pop() ?? "") }];
  }

  crumbs.push({ href: matched.href, label: matched.label });
  const rest = pathname.slice(matched.href.length).split("/").filter(Boolean);
  let href = matched.href;
  for (const segment of rest) {
    href += `/${segment}`;
    crumbs.push({ href, label: humanize(segment) });
  }
  return crumbs;
}
