"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileSpreadsheet, Link2, Landmark } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

// § architecture-app-dashboard.md — SATU sumber daftar nav. Modul
// berikutnya (Sales Invoice, Purchase Order, dst) tinggal tambah 1 baris
// di sini, JANGAN duplikasi nav ke tempat lain. Diekspor (bukan cuma
// lokal) supaya Topbar bisa reuse buat judul halaman — SATU sumber, dua
// pemakai, bukan daftar duplikat.
export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/purchase-invoice/import", label: "Import Faktur Pembelian", icon: FileSpreadsheet },
  { href: "/vendor/payable-account/import", label: "Import Akun Hutang Pemasok", icon: Landmark },
  { href: "/accurate", label: "Koneksi Accurate", icon: Link2 },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 p-4">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary-50 text-primary-700" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  return (
    <>
      {/* Desktop — selalu tampil */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border lg:bg-background">
        <div className="flex h-14 items-center border-b border-border px-4 text-lg font-semibold text-primary-700">
          Facport
        </div>
        <NavList />
      </aside>

      {/* Mobile — drawer slide-in kiri, pakai primitif @radix-ui/react-dialog
          langsung (bukan komponen ui/dialog.tsx yang di-styling buat modal
          tengah — posisi beda, tapi dependency & pola yang sama). */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={(open) => !open && onMobileClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-background shadow-lg lg:hidden"
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">Menu Navigasi</DialogPrimitive.Title>
            <div className="flex h-14 items-center border-b border-border px-4 text-lg font-semibold text-primary-700">
              Facport
            </div>
            <NavList onNavigate={onMobileClose} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
