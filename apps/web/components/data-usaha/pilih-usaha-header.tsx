"use client";

import { FileSpreadsheet, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function getInitials(name: string, email: string) {
  const source = name?.trim() || email;
  return source.slice(0, 2).toUpperCase();
}

// § diminta user 2026-09-11 — header gerbang "Pilih Data Usaha" dibuat
// mirip pola Accurate Online (referensi screenshot user): kiri = mark
// kecil (favicon+nama, GANTI baris "Bahasa | IP" yang tidak relevan buat
// project ini), tengah = logo brand UTAMA (lebih besar, posisi ABSOLUTE
// supaya benar2 di tengah literal, pola sama `Topbar` § `headerLogoUrl`),
// kanan = info akun login (avatar+dropdown, REUSE pola persis `Topbar`).
// Halaman ini TIDAK pakai `Topbar` langsung (beda konteks — belum ada
// Data Usaha aktif jadi tidak ada breadcrumbs/notification bell/sidebar
// toggle yang relevan), tapi styling & interaksi kanan SENGAJA disamakan.
//
// § diminta user 2026-09-12 — GRAFIS logo/favicon WAJIB dari
// `settings.company.logo`/`company.favicon` (§ `lib/get-public-settings.ts`,
// sumber yang SAMA dipakai Topbar/sidebar), JANGAN hardcode. Fallback ke
// ikon bawaan HANYA kalau branding belum pernah di-upload admin
// (`logoUrl`/`faviconUrl` undefined). Teks "Facport" TETAP literal (bukan
// `company.name`) — `company.name` itu identitas BADAN USAHA yang
// menjalankan platform ini (dipakai buat footer copyright/invoice, bisa
// beda dari nama produk, mis. dev DB isinya "Test Co"), BUKAN nama produk
// yang mau ditampilkan di sini.
export function PilihUsahaHeader({
  user,
  logoUrl,
  faviconUrl,
}: {
  user: { name: string; email: string };
  logoUrl?: string;
  faviconUrl?: string;
}) {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="relative flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          {faviconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={faviconUrl} alt="Facport" className="h-7 w-7 shrink-0 rounded-md object-contain" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-600 text-white">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="text-xs font-bold uppercase tracking-wide text-primary-700">Facport</span>
        </div>

        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Facport" className="h-8 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <span className="text-xl font-extrabold tracking-tight text-foreground">Facport</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-full outline-none">
                <span className="hidden text-right sm:block">
                  <span className="block text-sm font-medium leading-tight text-foreground">{user.name || "Pelanggan"}</span>
                  <span className="block text-xs leading-tight text-muted-foreground">{user.email}</span>
                </span>
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
