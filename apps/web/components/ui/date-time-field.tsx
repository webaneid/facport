"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { dateTimeFieldsInTimezone, timezoneAbbreviation, zonedDateTimeToUtc } from "@/lib/timezone";

// § Fase 174, ADR-0041 — input tanggal + jam (jam dinding di zona perusahaan) untuk tanggal akhir langganan. `value`/`onChange` = ISO instant ("" = kosong/belum lengkap).
// Hanya MENGEMIT saat admin mengubah salah satu kolom (detik 0); nilai awal yang tidak disentuh tidak pernah dipotong detiknya.
//
// § BUG diperbaiki 2026-10-07 (laporan: "tahun tidak bisa diketik, selalu 1902") — versi pertama MENURUNKAN isi kolom dari `value` di setiap render. `<input type="date">` melaporkan nilai
// SEMENTARA saat tahun diketik digit demi digit ("0002" → "0020" → "0202" → "2027"); nilai sementara itu langsung dikonversi (`Date.UTC` memetakan tahun 0–99 ke 1900–1999, jadi
// "0002" menjadi 1902), dikirim ke induk, lalu kolom DITIMPA ulang dari nilai itu — setiap ketukan terhapus. Sekarang kolom memegang TEKS KETIKAN sendiri (`draft`) dan hanya
// mengemit nilai kalau tanggalnya LENGKAP dan masuk akal (tahun 4 digit); selama belum lengkap mengemit "" (induk menonaktifkan Simpan). `draft` baru disinkronkan dari `value`
// bila `value` diubah dari LUAR (mis. tombol "+1 bulan", reset dialog), bukan akibat emisi komponen ini sendiri.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function completeDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return !!m && Number(m[1]) >= MIN_YEAR && Number(m[1]) <= MAX_YEAR;
}

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
  const fieldsOf = (iso: string) => (iso ? dateTimeFieldsInTimezone(iso, timeZone) : { date: "", time: "" });
  const [draft, setDraft] = useState(() => fieldsOf(value));
  const [seenValue, setSeenValue] = useState(value);
  const [emitted, setEmitted] = useState(value);

  // `value` berubah dari LUAR (bukan gema emisi kita) → ikuti. Pola "sesuaikan state saat render" (bukan effect).
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== emitted) {
      setDraft(fieldsOf(value));
      setEmitted(value);
    }
  }

  function update(next: { date: string; time: string }, source: "date" | "time") {
    // tanggal baru dilengkapi tapi jam masih kosong → jam bawaan 23:59 (tidak memotong hak hari itu), ditampilkan juga di kolom jam. Hanya saat TANGGAL yang diubah:
    // jam yang sengaja dikosongkan admin tidak diisi ulang diam-diam (dianggap belum lengkap).
    const filled = source === "date" && completeDate(next.date) && !next.time ? { ...next, time: "23:59" } : next;
    setDraft(filled);
    const iso = completeDate(filled.date) && /^\d{2}:\d{2}$/.test(filled.time) ? zonedDateTimeToUtc(filled.date, filled.time, timeZone).toISOString() : "";
    setEmitted(iso);
    onChange(iso);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        min={`${MIN_YEAR}-01-01`}
        max={`${MAX_YEAR}-12-31`}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} (tanggal)` : "Tanggal"}
        value={draft.date}
        onChange={(e) => update({ date: e.target.value, time: draft.time }, "date")}
        className="min-w-0 flex-1"
      />
      <Input
        type="time"
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} (jam)` : "Jam"}
        value={draft.time}
        onChange={(e) => update({ date: draft.date, time: e.target.value }, "time")}
        className="w-28"
      />
      <span className="text-xs text-muted-foreground">{timezoneAbbreviation(timeZone)}</span>
    </div>
  );
}
