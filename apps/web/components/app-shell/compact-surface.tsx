"use client";

import { useEffect } from "react";

// § Fase 190, ADR-0046 — menandai surface admin sebagai "kompak" untuk varian Tailwind `compact:` (globals.css). Pembungkus `display: contents` melayani konten yang
// dirender server (tanpa kedip); atribut di <body> melayani PORTAL Radix (Dialog, Dropdown, Popover) yang dirender di luar pembungkus. Dilepas saat unmount.
export function CompactSurface({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.dataset.ui = "compact";
    return () => {
      delete document.body.dataset.ui;
    };
  }, []);
  return (
    <div data-ui="compact" className="contents">
      {children}
    </div>
  );
}
