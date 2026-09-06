// § Fase 47 — `body` (root layout, `app/globals.css`) punya gradient
// BIRU global (`--admin-*`, dipakai admin/app) — landing page butuh
// kanvas PUTIH POLOS (desain referensi hijau, bukan biru). Div pembungkus
// OPAQUE ini menutupi gradient body secara visual, TANPA ubah `body`
// global (yang masih dipakai admin/app surface).
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-slate-900">{children}</div>;
}
