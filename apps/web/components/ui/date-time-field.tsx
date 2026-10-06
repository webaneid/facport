"use client";

import { Input } from "@/components/ui/input";
import { dateTimeFieldsInTimezone, timezoneAbbreviation, zonedDateTimeToUtc } from "@/lib/timezone";

// § Fase 174, ADR-0041 — input tanggal + jam (jam dinding di zona perusahaan) untuk tanggal akhir langganan. `value`/`onChange` = ISO instant
// ("" = kosong). Hanya MENGEMIT saat admin mengubah salah satu kolom (detik 0); nilai awal yang tidak disentuh tidak pernah dipotong detiknya.
export function DateTimeField({
  value,
  onChange,
  timeZone,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  timeZone: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const fields = value ? dateTimeFieldsInTimezone(value, timeZone) : { date: "", time: "" };

  function emit(date: string, time: string) {
    if (!date) {
      onChange("");
      return;
    }
    onChange(zonedDateTimeToUtc(date, time || "23:59", timeZone).toISOString());
  }

  return (
    <div className="flex items-center gap-2">
      <Input type="date" disabled={disabled} aria-label={ariaLabel ? `${ariaLabel} (tanggal)` : "Tanggal"} value={fields.date} onChange={(e) => emit(e.target.value, fields.time)} className="min-w-0 flex-1" />
      <Input type="time" disabled={disabled} aria-label={ariaLabel ? `${ariaLabel} (jam)` : "Jam"} value={fields.time} onChange={(e) => emit(fields.date, e.target.value)} className="w-28" />
      <span className="text-xs text-muted-foreground">{timezoneAbbreviation(timeZone)}</span>
    </div>
  );
}
