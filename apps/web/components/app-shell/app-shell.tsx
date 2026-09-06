"use client";

import { useState } from "react";
import { Sidebar, type Surface } from "./sidebar";
import { Topbar } from "./topbar";
import { PermissionsProvider } from "@/lib/use-permissions";

// § ADR-0024, Admin UI Kit v2 — shell dibungkus 2 panel rounded terpisah
// (rail Sidebar gelap + panel konten terang) mengambang di atas kanvas
// gradient `body` (§ globals.css), BUKAN edge-to-edge seperti Fase 03-21.
// Sidebar sudah rounded sendiri (§ sidebar.tsx) — panel konten (Topbar+
// main) dibungkus di sini supaya jadi kartu terpisah yang senada.
export function AppShell({
  surface,
  logoUrl,
  subscriptionModules,
  modulePlanNames,
  user,
  children,
}: {
  surface: Surface;
  logoUrl?: string;
  subscriptionModules?: string[];
  modulePlanNames?: Record<string, string>;
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    // § Fase 26, ADR-0024 — `PermissionsProvider` mount SEKALI di sini
    // (bukan per-halaman) supaya `Sidebar` (filter nav by permission)
    // DAN halaman di dalam `main` sama-sama bisa pakai `usePermissions()`/`Can`
    // dari 1 fetch `/me` yang sama.
    <PermissionsProvider>
      <div className="min-h-screen p-3 sm:p-4 lg:p-6">
        <div className="mx-auto flex max-w-[1600px] gap-3">
          <Sidebar
            surface={surface}
            logoUrl={logoUrl}
            subscriptionModules={subscriptionModules}
            modulePlanNames={modulePlanNames}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
          {/* § architecture-app-dashboard.md — `min-w-0` WAJIB di flex item ini:
              tanpa ini, konten lebar (tabel `whitespace-nowrap`) mendorong
              seluruh kolom keluar viewport di mobile alih-alih di-scroll lokal
              oleh `overflow-x-auto` milik Table sendiri (gotcha flexbox klasik
              — flex item defaultnya `min-width: auto`, bukan 0). */}
          <div className="flex min-h-[calc(100vh-1.5rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-admin-line bg-admin-panel-solid shadow-[0_10px_26px_rgba(16,24,40,.05)]">
            <Topbar surface={surface} user={user} onMenuClick={() => setMobileNavOpen(true)} />
            <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
          </div>
        </div>
      </div>
    </PermissionsProvider>
  );
}
