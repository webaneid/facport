import { formatWorkTimeSaved } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("id-ID");

// § Fase 47 — presentational murni (server-renderable, TIDAK butuh "use
// client") — angka SUNGGUHAN dari `GET /public/stats` (dikonfirmasi user,
// bukan placeholder), diambil `page.tsx` (Server Component) dan
// dilempar ke sini sebagai props.
export function FunfactBar({
  customerCount,
  successfulRowCount,
  estimatedTimeSavedSeconds,
}: {
  customerCount: number;
  successfulRowCount: number;
  estimatedTimeSavedSeconds: number;
}) {
  const stats = [
    { label: "Bisnis Menggunakan Facport", value: `${numberFormatter.format(customerCount)}+` },
    { label: "Baris Data Berhasil Diimpor", value: `${numberFormatter.format(successfulRowCount)}+` },
    { label: "Efisiensi Waktu Kerja", value: formatWorkTimeSaved(estimatedTimeSavedSeconds) },
  ];

  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 py-4 text-center sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-1">
          <span className="text-3xl font-bold text-landing-primary-dark">{stat.value}</span>
          <span className="text-sm text-slate-500">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
