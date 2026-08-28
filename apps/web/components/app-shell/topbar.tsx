"use client";

import { Menu, LogOut } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { navItemsFor, type Surface } from "./sidebar";
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

// Cari nav item paling spesifik yang jadi awalan pathname — supaya
// halaman turunan (mis. `/purchase-invoice/import/[batchId]`) tetap dapat
// judul dari induknya ("Import Faktur Pembelian"), bukan kosong.
function currentPageLabel(pathname: string, surface: Surface): string {
  const match = [...navItemsFor(surface)]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)));
  return match?.label ?? "Dashboard";
}

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
  const pathname = usePathname();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="px-2 lg:hidden" onClick={onMenuClick} aria-label="Buka menu">
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium text-foreground">{currentPageLabel(pathname, surface)}</span>
      </div>
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
          <DropdownMenuItem onSelect={handleLogout}>
            <LogOut className="h-4 w-4" />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
