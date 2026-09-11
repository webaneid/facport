"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Link2,
  Landmark,
  Wallet,
  HandCoins,
  BookOpenCheck,
  Banknote,
  Archive,
  Users,
  UserCog,
  Package,
  Settings,
  Receipt,
  CreditCard,
  FileText,
  Megaphone,
  Headset,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Building2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";

// § ADR-0024, Admin UI Kit v2 — nav TETAP didefinisikan DI SINI (file
// "use client"), BUKAN dioper sebagai prop dari Server Component
// layout.tsx. Alasannya BUKAN gaya, tapi teknis: `icon` di tiap item
// adalah REFERENSI KOMPONEN (lucide-react) — Next.js App Router TIDAK
// mengizinkan referensi fungsi/komponen dilewatkan sebagai PROP dari
// Server Component ke Client Component. Server Component cuma oper
// STRING murni (`surface`), `Sidebar` yang lookup nav-nya sendiri.
export type Surface = "app" | "admin";
export type NavItem = { href: string; label: string; icon: LucideIcon; moduleKey?: string; permission?: string };
// § Fase 110 — `ownerOnly: true` = grup ini disembunyikan TOTAL kalau
// `isDataUsahaOwner === false` (user cuma member/seat, bukan pemilik Data
// Usaha aktif) — urusan billing/kepemilikan (Koneksi Accurate/Tagihan/
// Berlangganan/Kelola Tim) BUKAN wilayah member.
export type NavGroup = { label: string; items: NavItem[]; ownerOnly?: boolean };

const NAV_GROUPS_BY_SURFACE: Record<Surface, NavGroup[]> = {
  app: [
    { label: "Utama", items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
    {
      label: "Import Data",
      items: [
        { href: "/purchase-invoice/import", label: "Import Faktur Pembelian", icon: FileSpreadsheet, moduleKey: "purchase_invoice" },
        // § ADR-0026 — dulu moduleKey "purchase_invoice" (bundel gratis),
        // sekarang sub-modul sendiri, dijual terpisah.
        { href: "/vendor/payable-account/import", label: "Import Akun Hutang Pemasok", icon: Landmark, moduleKey: "vendor_payable_account" },
        { href: "/sales-invoice/import", label: "Import Faktur Penjualan", icon: FileSpreadsheet, moduleKey: "sales_invoice" },
        { href: "/purchase-payment/import", label: "Import Purchase Payment", icon: Wallet, moduleKey: "purchase_payment" },
        { href: "/sales-receipt/import", label: "Import Sales Receipt", icon: HandCoins, moduleKey: "sales_receipt" },
        { href: "/journal-voucher/import", label: "Import Jurnal Umum", icon: BookOpenCheck, moduleKey: "journal_voucher" },
        { href: "/other-payment/import", label: "Import Other Payment", icon: Banknote, moduleKey: "other_payment" },
        // § diminta user 2026-09-06 — arsip GABUNGAN lintas semua modul,
        // TANPA moduleKey (selalu tampil, tidak digerbang subscription
        // modul tertentu — beda dari item import di atas). SENGAJA
        // ditaruh PALING BAWAH grup ini.
        { href: "/import/arsip", label: "Arsip Import", icon: Archive },
      ],
    },
    {
      label: "Langganan",
      ownerOnly: true,
      // § Fase 15/17 — TANPA moduleKey (selalu tampil untuk customer login).
      items: [
        { href: "/accurate", label: "Koneksi Accurate", icon: Link2 },
        { href: "/billing", label: "Tagihan", icon: Receipt },
        { href: "/subscribe", label: "Berlangganan", icon: Package },
        // § Fase 110, architecture-user-tambahan.md — "Kelola Tim" (User
        // Tambahan). Grup INI SELURUHNYA disembunyikan untuk member
        // (non-owner) lewat filter `isDataUsahaOwner` di `navGroupsFor`.
        { href: "/team", label: "Kelola Tim", icon: Users },
      ],
    },
  ],
  admin: [
    { label: "Utama", items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] },
    {
      label: "Manajemen",
      items: [
        // § Fase 29, ADR-0027 — diturunkan dari `users.manage`: halaman
        // ini sendiri cuma butuh `users.view` (Admin terbatas juga bisa
        // lihat), aksi tambah/nonaktifkan yang tetap `users.manage`.
        { href: "/users", label: "Pengguna", icon: Users, permission: "users.view" },
        // § diminta user 2026-09-05 — menu KHUSUS tim internal (Super
        // Admin/Admin), terpisah dari "Pengguna" yang sekarang cuma
        // customer (§ ADR-0027 lanjutan).
        { href: "/staff", label: "Tim Internal", icon: UserCog, permission: "users.view" },
        { href: "/plans", label: "Paket", icon: Package, permission: "plans.manage" },
        // § Fase 27, ADR-0025 — kelola invoice, termasuk bikin baru untuk user existing.
        { href: "/invoices", label: "Invoice", icon: FileText, permission: "invoices.view" },
        // § Fase 16, ADR-0022 — antrian konfirmasi pembayaran manual.
        { href: "/orders", label: "Konfirmasi Pembayaran", icon: CreditCard, permission: "orders.manage" },
        // § Fase 45 — broadcast/pengumuman ke customer.
        { href: "/announcements", label: "Pengumuman", icon: Megaphone, permission: "notifications.broadcast" },
        // § Fase 46 — profil CS, jam kerja, rotasi WhatsApp.
        { href: "/customer-care", label: "Customer Care", icon: Headset, permission: "customer_care.manage" },
      ],
    },
    { label: "Sistem", items: [{ href: "/settings", label: "Pengaturan", icon: Settings, permission: "settings.update" }] },
  ],
};

// § ADR-0018 — `subscriptionModules` undefined/kosong = tidak ada
// langganan aktif — item ber-moduleKey DISEMBUNYIKAN by default (aman).
// Grup yang jadi KOSONG setelah filter (semua item-nya moduleKey tidak
// aktif) ikut disembunyikan total, bukan ditampilkan sebagai judul tanpa isi.
// § Fase 110 — `isDataUsahaOwner` UNDEFINED (mis. dipanggil `breadcrumbs.tsx`
// tanpa tahu status kepemilikan) SENGAJA TIDAK memfilter grup `ownerOnly`
// (biar breadcrumbs tetap bisa cocokkan path `/team` dst) — filter grup
// `ownerOnly` HANYA aktif kalau nilainya EKSPLISIT `false` (dioper `Sidebar`
// sungguhan, § di bawah, yang SELALU tahu status ini dari `layout.tsx`).
export function navGroupsFor(surface: Surface, subscriptionModules?: string[], isDataUsahaOwner?: boolean): NavGroup[] {
  return NAV_GROUPS_BY_SURFACE[surface]
    .filter((group) => !(group.ownerOnly && isDataUsahaOwner === false))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.moduleKey || (subscriptionModules?.includes(item.moduleKey) ?? false)),
    }))
    .filter((group) => group.items.length > 0);
}

// § dipertahankan untuk `topbar.tsx` (currentPageLabel butuh flat list,
// bukan grup) — turunan dari `navGroupsFor`, bukan sumber data terpisah.
export function navItemsFor(surface: Surface, subscriptionModules?: string[]): NavItem[] {
  return navGroupsFor(surface, subscriptionModules).flatMap((g) => g.items);
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function IdentityCard({ collapsed, logoUrl, subtitle }: { collapsed: boolean; logoUrl?: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-white/22 bg-white/14 p-3">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="size-9 shrink-0 rounded-xl bg-white/22 object-contain p-1" />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/22 text-sm font-bold text-white">F</div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-semibold text-white">Facport</p>
            <p className="m-0 truncate text-[11px] text-white/70">{subtitle}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NavGroupBlock({
  group,
  collapsed,
  pathname,
  onNavigate,
  modulePlanNames,
}: {
  group: NavGroup;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
  modulePlanNames?: Record<string, string>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      {!collapsed && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mb-2 flex w-full items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/56"
        >
          {group.label}
          <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} />
        </button>
      )}
      {open && (
        <div className="space-y-1">
          {group.items.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              // § label diganti nama paket yang aktif untuk modul ini, KALAU
              // ada — href/ikon/urutan item TIDAK berubah sama sekali,
              // cuma teks yang ditampilkan. Diminta user 2026-09-05 supaya
              // customer langsung tahu link itu bagian dari paket apa yang
              // mereka beli, bukan nama fitur generik.
              displayLabel={(item.moduleKey && modulePlanNames?.[item.moduleKey]) || item.label}
              collapsed={collapsed}
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavRow({
  item,
  displayLabel,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  displayLabel?: string;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const label = displayLabel ?? item.label;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
        active ? "bg-white text-admin-accent-strong shadow-[0_10px_26px_rgba(4,18,24,.28)]" : "text-white/90 hover:bg-white/12",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

// § Fase 109, architecture-user-tambahan.md § Fase B2 — "kembali ke
// laman awal" (gerbang pilih Data Usaha), SENGAJA di rail PALING BAWAH
// sebelum tombol Ciutkan (diminta eksplisit user, bukan di Topbar/dropdown
// user — Data Usaha itu konteks seluruh dashboard, bukan preferensi akun).
// Link polos ke `/pilih-usaha` (BUKAN tombol Server Action) — halaman
// tujuan sendiri yang fetch ulang daftar Data Usaha, konsisten pola
// navigasi biasa di project ini.
function DataUsahaSwitcher({ name, collapsed, onNavigate }: { name: string; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/pilih-usaha"
      onClick={onNavigate}
      title={collapsed ? `Data Usaha: ${name} — klik untuk ganti` : undefined}
      className="mb-3 flex min-h-11 items-center gap-2.5 rounded-xl border border-white/16 bg-white/8 px-3 text-left transition hover:bg-white/14"
    >
      <Building2 className="size-4 shrink-0 text-white/80" />
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-white">{name}</span>
          <span className="block text-[10px] text-white/60">Ganti Data Usaha</span>
        </span>
      )}
    </Link>
  );
}

const COLLAPSE_STORAGE_KEY = "facport-admin-sidebar-collapsed";

// § ADR-0024 — gradient rail gelap + radial spot (accent+warm), diambil
// persis dari spec `master-typescript` Admin UI Kit (ADR-0006), token
// warna via `--admin-*` (biru, § globals.css). Collapsible (state
// dipersist localStorage per-browser, BUKAN per-akun/server — preferensi
// murni tampilan, tidak perlu disinkron lintas device) + grup nav nested
// (label kategori, collapse per grup) — sebelumnya (Fase 03) flat list
// tanpa grup/collapse sama sekali.
export function Sidebar({
  surface,
  logoUrl,
  subscriptionModules,
  modulePlanNames,
  activeDataUsahaName,
  isDataUsahaOwner,
  mobileOpen,
  onMobileClose,
}: {
  surface: Surface;
  logoUrl?: string;
  subscriptionModules?: string[];
  // § label sidebar "Import Data" ikut nama paket (bukan nama fitur
  // generik) supaya customer tahu link itu bagian paket apa yang mereka
  // beli — map moduleKey→nama paket AKTIF user ini. TIDAK mempengaruhi
  // filter `subscriptionModules` di atas (yang menentukan tampil/tidak),
  // ini CUMA override teks tampilan (§ NavGroupBlock/NavRow).
  modulePlanNames?: Record<string, string>;
  // § Fase 109 — switcher "Ganti Data Usaha" di rail bawah, surface
  // "app" saja (admin layout.tsx tidak pernah mengisi prop ini).
  activeDataUsahaName?: string;
  // § Fase 110 — sembunyikan grup `ownerOnly` (Langganan) kalau false.
  isDataUsahaOwner?: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const permissions = usePermissions();
  // § Fase 26, ADR-0024 — filter tambahan DI SINI (bukan di `navGroupsFor`,
  // fungsi murni tanpa akses hook yang juga dipakai `breadcrumbs.tsx`).
  // Item tanpa `permission` selalu tampil; grup yang jadi kosong ikut
  // disembunyikan, sama seperti filter `moduleKey` di atas. Ini HANYA UI
  // hint (§ `components/auth/can.tsx`) — endpoint tetap dijaga backend.
  const groups = navGroupsFor(surface, subscriptionModules, isDataUsahaOwner)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || permissions.includes(item.permission)),
    }))
    .filter((group) => group.items.length > 0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrasi dari localStorage saat mount, bukan derived state
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // localStorage bisa gagal (private window dkk) — biarkan default expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // gagal simpan preferensi bukan hal fatal, cuma tidak persist.
      }
      return next;
    });
  }

  const railStyle = {
    background:
      "linear-gradient(180deg, transparent 60%, rgba(4,18,24,.34) 100%)," +
      "radial-gradient(circle at 14% 4%, color-mix(in oklch, var(--admin-accent) 40%, transparent), transparent 52%)," +
      "radial-gradient(circle at 106% 96%, color-mix(in oklch, var(--admin-warm) 28%, transparent), transparent 48%)," +
      "var(--admin-accent-strong)",
  };
  const subtitle = surface === "admin" ? "Admin Panel" : "Dashboard Pelanggan";

  return (
    <>
      {/* Desktop — selalu tampil */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col rounded-2xl px-4 py-4 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[84px]" : "w-[262px]",
        )}
        style={railStyle}
      >
        <IdentityCard collapsed={collapsed} logoUrl={logoUrl} subtitle={subtitle} />

        <nav className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
          {groups.map((group) => (
            <NavGroupBlock key={group.label} group={group} collapsed={collapsed} pathname={pathname} modulePlanNames={modulePlanNames} />
          ))}
        </nav>

        {activeDataUsahaName && <DataUsahaSwitcher name={activeDataUsahaName} collapsed={collapsed} />}

        <button
          type="button"
          onClick={toggleCollapsed}
          className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 text-xs font-semibold text-white/85 hover:bg-white/16"
        >
          {collapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <>
              <ChevronsLeft className="size-4" />
              Ciutkan
            </>
          )}
        </button>
      </aside>

      {/* Mobile — drawer slide-in kiri, pakai primitif @radix-ui/react-dialog
          langsung (bukan components/ui/dialog.tsx yang di-styling buat modal
          tengah — posisi beda, tapi dependency & pola yang sama). */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={(open) => !open && onMobileClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 left-0 z-50 flex w-[262px] flex-col rounded-r-2xl px-4 py-4 lg:hidden"
            style={railStyle}
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">Menu Navigasi</DialogPrimitive.Title>
            <IdentityCard collapsed={false} logoUrl={logoUrl} subtitle={subtitle} />
            <nav className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
              {groups.map((group) => (
                <NavGroupBlock
                  key={group.label}
                  group={group}
                  collapsed={false}
                  pathname={pathname}
                  onNavigate={onMobileClose}
                  modulePlanNames={modulePlanNames}
                />
              ))}
            </nav>
            {activeDataUsahaName && <DataUsahaSwitcher name={activeDataUsahaName} collapsed={false} onNavigate={onMobileClose} />}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
