import { Badge, type BadgeProps } from "@/components/ui/badge";

// § ADR-0023 — sumber TUNGGAL label+warna status di seluruh app,
// menggantikan 6 mapping lokal yang sebelumnya duplikat/beda nama utk
// hal yang sama (`SUBSCRIPTION_STATUS` vs `SUB_STATUS`), ter-triplikasi
// (`BATCH_STATUS` di 3 file), atau tidak ada sama sekali (`order.status`
// belum pernah dipetakan ke Badge). Domain TETAP dipisah (bukan digabung
// jadi 1 status buatan) — invoice/order/subscription/import-batch
// merepresentasikan 4 hal berbeda, yang disatukan cuma SUMBER label/
// warna-nya, bukan maknanya.
//
// Migrasi pemakai lama (Fase 20-21) — hapus objek lokal, pakai
// `<StatusBadge domain="..." status="..." />` atau `getStatusMeta()`.

export type StatusDomain = "invoice" | "order" | "subscription" | "import-batch" | "plan";

type StatusMeta = { label: string; variant: BadgeProps["variant"] };

const STATUS_REGISTRY: Record<StatusDomain, Record<string, StatusMeta>> = {
  // apps/api/src/db/schema/invoice.schema.ts
  invoice: {
    unpaid: { label: "Belum Dibayar", variant: "warning" },
    paid: { label: "Lunas", variant: "success" },
    void: { label: "Dibatalkan", variant: "default" },
    expired: { label: "Kadaluarsa", variant: "destructive" },
  },
  // apps/api/src/db/schema/payment.schema.ts (orders)
  order: {
    pending: { label: "Menunggu Pembayaran", variant: "default" },
    submitted: { label: "Menunggu Verifikasi", variant: "warning" },
    paid: { label: "Lunas", variant: "success" },
    rejected: { label: "Ditolak", variant: "destructive" },
    cancelled: { label: "Dibatalkan", variant: "default" },
    expired: { label: "Kadaluarsa", variant: "destructive" },
  },
  // apps/api/src/db/schema/subscription.schema.ts
  subscription: {
    pending_payment: { label: "Menunggu Pembayaran", variant: "warning" },
    active: { label: "Aktif", variant: "success" },
    expired: { label: "Kadaluarsa", variant: "destructive" },
    cancelled: { label: "Dibatalkan", variant: "default" },
  },
  // Batch import Purchase/Sales Invoice — status disatukan di sini,
  // sebelumnya `BATCH_STATUS` di-copy verbatim di 3 file (§ Fase 09, ADR-0013)
  "import-batch": {
    completed: { label: "Selesai", variant: "success" },
    completed_with_errors: { label: "Selesai (ada gagal)", variant: "warning" },
    processing: { label: "Memproses", variant: "warning" },
    mapping_pending: { label: "Menunggu Konfirmasi", variant: "default" },
    failed: { label: "Gagal", variant: "destructive" },
    cancelling: { label: "Membatalkan...", variant: "warning" },
    cancelled: { label: "Dibatalkan", variant: "default" },
    cancelled_partial: { label: "Dibatalkan (sebagian)", variant: "warning" },
  },
  // apps/api/src/db/schema/subscription.schema.ts (plans.isActive) —
  // § Fase 21: sebelumnya ternary inline `plan.isActive ? "success" :
  // "default"` di admin/plans/page.tsx, disatukan di sini juga supaya
  // SEMUA badge status (termasuk boolean toggle) lewat 1 sumber.
  plan: {
    active: { label: "Aktif", variant: "success" },
    inactive: { label: "Nonaktif", variant: "default" },
  },
};

// Fallback untuk status yang belum terdaftar — TIDAK crash, tampilkan
// apa adanya supaya gap ketahuan dari UI (bukan exception di runtime).
export function getStatusMeta(domain: StatusDomain, status: string): StatusMeta {
  return STATUS_REGISTRY[domain][status] ?? { label: status, variant: "default" };
}

export function StatusBadge({ domain, status, className }: { domain: StatusDomain; status: string; className?: string }) {
  const meta = getStatusMeta(domain, status);
  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
    </Badge>
  );
}
