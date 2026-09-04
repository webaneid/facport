"use client";

import { useState } from "react";
import { Sidebar, type Surface } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  surface,
  logoUrl,
  subscriptionModules,
  user,
  children,
}: {
  surface: Surface;
  logoUrl?: string;
  subscriptionModules?: string[];
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar
        surface={surface}
        logoUrl={logoUrl}
        subscriptionModules={subscriptionModules}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      {/* § architecture-app-dashboard.md — `min-w-0` WAJIB di flex item ini:
          tanpa ini, konten lebar (tabel `whitespace-nowrap`) mendorong
          seluruh kolom keluar viewport di mobile alih-alih di-scroll lokal
          oleh `overflow-x-auto` milik Table sendiri (gotcha flexbox klasik
          — flex item defaultnya `min-width: auto`, bukan 0). */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar surface={surface} user={user} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
