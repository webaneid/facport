import { CompactSurface } from "@/components/app-shell/compact-surface";

// § Fase 190, ADR-0046 — seluruh surface admin (termasuk halaman login) memakai skala "Kompak & tajam".
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <CompactSurface>{children}</CompactSurface>;
}
