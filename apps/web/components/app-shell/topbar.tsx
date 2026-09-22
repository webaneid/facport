"use client";

import { Menu, LogOut, UserRound, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "./breadcrumbs";
import type { Surface } from "./sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { NotificationBell } from "@/components/notifications/notification-bell";

function getInitials(name: string, email: string) {
  const source = name?.trim() || email;
  return source.slice(0, 2).toUpperCase();
}

// § ADR-0024 — Admin UI Kit v2. Breadcrumbs GANTI label statis tunggal
// (Fase 03). Notifikasi bell diaktifkan Fase 45 (§ NotificationBell) —
// sebelumnya `disabled` sejak ADR-0024. § Fase 105 (2026-09-11) — kotak
// "Cari cepat" (search lintas-entity, SENGAJA UI-only/disabled sejak
// ADR-0024) DIHAPUS — tidak pernah berfungsi, pencarian per-halaman
// sekarang ditangani search form masing-masing (§ `SearchForm`, dipakai
// di halaman list admin, bukan lintas-entity global).
// § Fase 103 (2026-09-11) — `headerLogoUrl`/`headerLogoLinkUrl` BARU:
// logo perusahaan PERMANEN di tengah header (dua surface, komponen
// shared ini). Posisi TENGAH PERSIS pakai `absolute` (BUKAN flexbox
// 3-kolom) — kiri (breadcrumbs) dan kanan (search+bell+avatar) TIDAK
// simetris lebarnya, jadi flexbox "di antara" tidak akan pas di tengah
// literal seperti diminta ("pas di tengah2").
// § diminta user 2026-09-22 — surface "app" (dashboard pelanggan) tampilkan nama DATA USAHA AKTIF di sebelah
// avatar (bukan nama user) supaya pelanggan yang punya beberapa Data Usaha selalu tahu Data Usaha mana yang
// sedang dibuka — pola visual disalin dari `pilih-usaha-header.tsx` (teks di sebelah avatar, disembunyikan di
// mobile). Info profil TIDAK hilang, cuma tidak lagi tampil inline — tetap ada persis sama di `DropdownMenuContent`
// begitu avatar diklik. `activeDataUsahaName` SENGAJA `undefined` di surface "admin" (staff tidak terikat 1 Data
// Usaha, § app-shell.tsx) — kalau kosong, render avatar polos seperti sebelumnya, 0 perubahan visual di admin.
// Ini BUKAN switcher baru — mekanisme GANTI Data Usaha tetap di rail bawah Sidebar (§ Fase 109, sengaja begitu).
//
// § diminta user 2026-09-22 — "Tagihan" DIPINDAH dari grup Sidebar "Langganan" (§ sidebar.tsx) ke sini.
// `GET /me/invoices` (`routes/invoices.route.ts`) filter `WHERE invoices.userId = session.user.id` — riwayat
// tagihan PER-USER (akun yang login), BUKAN per-Data-Usaha (§ juga `architecture-user-tambahan.md` soal
// `invoices.userId` yang sengaja tidak ditulis ulang saat transfer kepemilikan). Karena itu tempatnya lebih pas
// di sini (identitas akun) daripada di Sidebar (konteks Data Usaha) — SEKALIGUS memperbaiki gap kecil: grup
// Sidebar lama itu `ownerOnly`, jadi member (non-owner) sebelumnya TIDAK BISA lihat Tagihan pribadinya sendiri
// walau invoice itu jelas miliknya. Cuma surface "app" (admin staff tidak punya tagihan Facport pribadi).
export function Topbar({
  surface,
  user,
  headerLogoUrl,
  headerLogoLinkUrl,
  activeDataUsahaName,
  onMenuClick,
}: {
  surface: Surface;
  user: { name: string; email: string };
  headerLogoUrl?: string;
  headerLogoLinkUrl?: string;
  activeDataUsahaName?: string;
  onMenuClick: () => void;
}) {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-admin-line bg-admin-panel backdrop-blur-xl">
      <div className="relative flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" className="px-2 lg:hidden" onClick={onMenuClick} aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </Button>
          <Breadcrumbs surface={surface} />
        </div>

        {headerLogoUrl && (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
            {headerLogoLinkUrl ? (
              <a
                href={headerLogoLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto"
                title="Kunjungi situs perusahaan"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={headerLogoUrl} alt="Logo Perusahaan" className="h-8 w-auto object-contain" />
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerLogoUrl} alt="Logo Perusahaan" className="pointer-events-auto h-8 w-auto object-contain" />
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <NotificationBell surface={surface} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-full outline-none">
                {activeDataUsahaName && (
                  <span className="hidden text-right sm:block">
                    <span className="block max-w-[14rem] truncate text-sm font-medium leading-tight text-admin-ink">
                      {activeDataUsahaName}
                    </span>
                    <span className="block text-xs leading-tight text-admin-muted">Data Usaha Aktif</span>
                  </span>
                )}
                <Avatar>
                  <AvatarFallback>{getInitials(user.name, user.email)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{user.name || "Pelanggan"}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserRound className="h-4 w-4" />
                  Profil & Ganti Password
                </Link>
              </DropdownMenuItem>
              {surface === "app" && (
                <DropdownMenuItem asChild>
                  <Link href="/billing">
                    <Receipt className="h-4 w-4" />
                    Tagihan
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout}>
                <LogOut className="h-4 w-4" />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
