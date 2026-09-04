"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileSpreadsheet, Link2, Landmark, Users, Package, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

// § Fase 10 — nav TETAP didefinisikan DI SINI (file "use client"), BUKAN
// dioper sebagai prop dari Server Component layout.tsx. Alasannya BUKAN
// gaya, tapi teknis: `icon` di tiap item adalah REFERENSI KOMPONEN
// (lucide-react, dibangun via forwardRef) — Next.js App Router TIDAK
// mengizinkan referensi fungsi/komponen dilewatkan sebagai PROP dari
// Server Component ke Client Component (cuma boleh sebagai children/JSX
// yang sudah di-render). Sempat dicoba dioper sebagai prop `navItems`
// (ke `<AppShell navItems={...}>` dari `layout.tsx` Server Component) —
// error runtime "Functions cannot be passed directly to Client
// Components" (ketemu 2026-08-28). Solusinya: Server Component cuma
// oper STRING murni (`surface`, aman diserialisasi), `Sidebar`/`Topbar`
// (client, sudah "use client") yang lookup daftar nav-nya SENDIRI di
// sini — modul baru (Sales Invoice dst) tinggal tambah 1 baris di array
// surface yang relevan, JANGAN duplikasi ke tempat lain.
export type Surface = "app" | "admin";
export type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ITEMS_BY_SURFACE: Record<Surface, NavItem[]> = {
  app: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/purchase-invoice/import", label: "Import Faktur Pembelian", icon: FileSpreadsheet },
    { href: "/vendor/payable-account/import", label: "Import Akun Hutang Pemasok", icon: Landmark },
    { href: "/accurate", label: "Koneksi Accurate", icon: Link2 },
  ],
  admin: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/users", label: "Pengguna", icon: Users },
    { href: "/plans", label: "Paket", icon: Package },
    { href: "/settings", label: "Pengaturan", icon: Settings },
  ],
};

export function navItemsFor(surface: Surface): NavItem[] {
  return NAV_ITEMS_BY_SURFACE[surface];
}

function NavList({ surface, onNavigate }: { surface: Surface; onNavigate?: () => void }) {
  const pathname = usePathname();
  const navItems = navItemsFor(surface);
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

// § Fase 12, ADR-0017 — logo company (kalau admin sudah upload di
// `/admin/settings`), fallback wordmark teks "Facport" kalau belum diisi.
// `<img>` biasa (bukan `next/image`) SENGAJA — URL-nya dari host eksternal
// (`media.<domain>`, bucket public MinIO) yang tidak terdaftar di
// `next.config` `images.domains`, dan logo company bukan gambar besar yang
// butuh optimasi lazy-load/responsive srcset.
function BrandLogo({ logoUrl }: { logoUrl?: string }) {
  if (!logoUrl) return "Facport";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logoUrl} alt="Logo" className="h-8 w-auto" />;
}

export function Sidebar({
  surface,
  logoUrl,
  mobileOpen,
  onMobileClose,
}: {
  surface: Surface;
  logoUrl?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      {/* Desktop — selalu tampil */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border lg:bg-background">
        <div className="flex h-14 items-center border-b border-border px-4 text-lg font-semibold text-primary-700">
          <BrandLogo logoUrl={logoUrl} />
        </div>
        <NavList surface={surface} />
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
              <BrandLogo logoUrl={logoUrl} />
            </div>
            <NavList surface={surface} onNavigate={onMobileClose} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
