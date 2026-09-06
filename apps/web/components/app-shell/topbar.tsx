"use client";

import { Menu, LogOut, UserRound, Search } from "lucide-react";
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
// (Fase 03). Search SENGAJA masih UI-only (belum ada pencarian
// lintas-entity di project ini). Notifikasi bell diaktifkan Fase 45
// (§ NotificationBell) — sebelumnya `disabled` sejak ADR-0024.
export function Topbar({
  surface,
  user,
  onMenuClick,
}: {
  surface: Surface;
  user: { name: string; email: string };
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
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" className="px-2 lg:hidden" onClick={onMenuClick} aria-label="Buka menu">
            <Menu className="h-5 w-5" />
          </Button>
          <Breadcrumbs surface={surface} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-admin-line bg-white/70 px-3 py-2 md:flex">
            <Search className="size-4 text-admin-muted" />
            <input
              type="search"
              placeholder="Cari cepat..."
              disabled
              title="Pencarian belum tersedia"
              className="w-40 bg-transparent text-sm outline-none placeholder:text-admin-muted disabled:cursor-not-allowed"
            />
          </div>

          <NotificationBell surface={surface} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full outline-none">
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
