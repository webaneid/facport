import { PageHeader } from "@/components/ui/page-header";
import { AccurateStatusCard } from "@/components/accurate/accurate-gate-provider";

// § Fase 144, architecture-accurate-connect-gate.md — halaman koneksi = SATU kartu per Data Usaha (bukan per modul/subscription
// lagi). Status & aksi datang dari konteks gerbang yang dipasang `(protected)/layout.tsx`; tombol membuka popup yang sama.
export default function AccuratePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Koneksi Accurate Online" description="Hubungkan Data Usaha ini ke akun Accurate Online Anda." />
      <AccurateStatusCard detailed />
    </div>
  );
}
