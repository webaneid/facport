import { KonverterPage } from "@/components/converter/konverter-gate";
import { journalVoucherType } from "@/lib/converter/types/journal-voucher";

export default function KonverterJournalVoucherPage() {
  return <KonverterPage type={journalVoucherType} />;
}
