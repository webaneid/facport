import { Alert } from "@/components/ui/alert";
import { moduleLabel } from "@/lib/module-options";
import { formatDate } from "@/lib/utils";

export type ExpiringSubscriptionRow = {
  subscription: { id: string; status: string; endAt: string | null };
  plan: { modules: string[] };
  dataUsahaName: string | null;
};

// § Fase 132 (diminta user 2026-09-17) — H-7 SAMA dengan threshold
// TERJAUH job backend `NOTIFY_EXPIRING_SOON` (§ lib/subscription-reminders.ts
// `SUBSCRIPTION_REMINDER_THRESHOLDS`) — dipilih terpisah di sini (bukan
// import dari apps/api, 2 app terpisah) supaya banner ini konsisten
// "mulai muncul" di hari yang sama dengan reminder bell/email pertama.
const EXPIRING_SOON_DAYS = 7;

// § Komponen SHARED dashboard (`app/app/(protected)/page.tsx`, scope 1
// Data Usaha aktif) DAN `/pilih-usaha` (`pilih-usaha-form.tsx`, scope
// SEMUA Data Usaha user) — pemanggil yang tanggung jawab filter/fetch
// data, komponen ini MURNI render banner dari subscription yang SUDAH
// difilter "aktif & akan berakhir ≤7 hari".
export function ExpiringSoonAlert({ subscriptions, companyTimezone }: { subscriptions: ExpiringSubscriptionRow[]; companyTimezone: string }) {
  // § "now" cuma dipakai hitung "berapa hari lagi" untuk banner display —
  // TIDAK butuh presisi milidetik/re-render tiap detik, cukup akurat per
  // mount/re-render biasa (sama seperti page reload berkala pada
  // umumnya). eslint-disable krn `react-hooks/purity` menganggap
  // `Date.now()` impure meski dipakai murni display, bukan logic kritis.
  // eslint-disable-next-line react-hooks/purity -- lihat komentar di atas
  const now = Date.now();
  const expiringSoon = subscriptions.filter((s) => {
    if (s.subscription.status !== "active" || !s.subscription.endAt) return false;
    const daysLeft = (new Date(s.subscription.endAt).getTime() - now) / (24 * 60 * 60 * 1000);
    return daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS;
  });
  if (expiringSoon.length === 0) return null;

  return (
    <Alert variant="warning" className="flex-col items-stretch gap-2">
      <p className="font-medium">
        {expiringSoon.length === 1 ? "1 fitur akan segera berakhir" : `${expiringSoon.length} fitur akan segera berakhir`}
      </p>
      <ul className="flex flex-col gap-1">
        {expiringSoon.map((s) => (
          <li key={s.subscription.id}>
            {s.plan.modules.map(moduleLabel).join(", ")} di Data Usaha {s.dataUsahaName ?? "-"} — berakhir{" "}
            {formatDate(s.subscription.endAt!, companyTimezone)}
          </li>
        ))}
      </ul>
    </Alert>
  );
}
