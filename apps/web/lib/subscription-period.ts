// § Fase 173, ADR-0041 — re-export dari `apps/api/src/lib/subscription-period.ts` (fungsi murni; satu-satunya tempat aritmetika periode
// langganan — pratinjau UI harus identik dengan server). JANGAN menulis ulang hitungan tanggal di web.
export {
  SUBSCRIPTION_INTERVALS,
  isSubscriptionInterval,
  intervalMonths,
  intervalCompatDays,
  inferIntervalFromDays,
  addCalendarMonths,
  addCalendarPeriod,
  computeRenewalEnd,
  computeSubscriptionPeriod,
  type RenewableSubscription,
  type SubscriptionInterval,
} from "../../api/src/lib/subscription-period";
