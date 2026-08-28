"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

// § Fase 10 — `navItems` sekarang PROP (bukan konstanta hardcode di sini),
// supaya `AppShell` bisa dipakai ulang surface admin (nav beda total dari
// customer) tanpa duplikasi seluruh komponen shell. Tiap surface (`app/app/`,
// `app/admin/`) definisikan daftar nav-nya sendiri di layout.tsx masing-masing,
// SATU sumber per surface — jangan duplikasi ke tempat lain.
export type NavItem = { href: string; label: string; icon: LucideIcon };

function NavList({ navItems, onNavigate }: { navItems: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 p-4">
      {navItems.map((item) => {
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

export function Sidebar({
  navItems,
  mobileOpen,
  onMobileClose,
}: {
  navItems: NavItem[];
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      {/* Desktop — selalu tampil */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border lg:bg-background">
        <div className="flex h-14 items-center border-b border-border px-4 text-lg font-semibold text-primary-700">
          Facport
        </div>
        <NavList navItems={navItems} />
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
            <NavList navItems={navItems} onNavigate={onMobileClose} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
