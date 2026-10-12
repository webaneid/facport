"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// § Fase 189A, ADR-0044 — input nomor telepon/WhatsApp: pemilih kode negara (default Indonesia +62) + digit lokal; KELUARAN selalu E.164 dengan "+"
// (mis. "+628123456789"). Diport dari project Jalajogja (`components/ui/phone-input.tsx`, standar `docs/arsitektur-kontak.md`); beda: tanpa label bawaan
// (form daftar facport memakai placeholder, bukan label — beri `ariaLabel`), gaya mengikuti `Input` facport, dropdown `absolute` relatif ke pembungkus.
// Komponen TERKONTROL murni (tanpa `name` untuk FormData): angkat nilainya ke state/`Controller` pemanggil. Server tetap menormalisasi + memvalidasi.

// ─── Data negara ──────────────────────────────────────────────────────────────

export type Country = {
  code: string; // ISO 3166-1 alpha-2
  name: string; // nama dalam Bahasa Indonesia
  dial: string; // dial code e.g. "+62"
  flag: string; // emoji flag
};

// Diurutkan: Indonesia di atas, sisanya alfabet
export const COUNTRIES: Country[] = [
  { code: "ID", name: "Indonesia",        dial: "+62",  flag: "🇮🇩" },
  { code: "MY", name: "Malaysia",         dial: "+60",  flag: "🇲🇾" },
  { code: "SA", name: "Arab Saudi",       dial: "+966", flag: "🇸🇦" },
  { code: "EG", name: "Mesir",            dial: "+20",  flag: "🇪🇬" },
  { code: "AE", name: "Uni Emirat Arab",  dial: "+971", flag: "🇦🇪" },
  { code: "QA", name: "Qatar",            dial: "+974", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait",           dial: "+965", flag: "🇰🇼" },
  { code: "OM", name: "Oman",             dial: "+968", flag: "🇴🇲" },
  { code: "BH", name: "Bahrain",          dial: "+973", flag: "🇧🇭" },
  { code: "JO", name: "Yordania",         dial: "+962", flag: "🇯🇴" },
  { code: "TR", name: "Turki",            dial: "+90",  flag: "🇹🇷" },
  { code: "SD", name: "Sudan",            dial: "+249", flag: "🇸🇩" },
  { code: "LY", name: "Libya",            dial: "+218", flag: "🇱🇾" },
  { code: "MA", name: "Maroko",           dial: "+212", flag: "🇲🇦" },
  { code: "DZ", name: "Aljazair",         dial: "+213", flag: "🇩🇿" },
  { code: "TN", name: "Tunisia",          dial: "+216", flag: "🇹🇳" },
  { code: "SG", name: "Singapura",        dial: "+65",  flag: "🇸🇬" },
  { code: "BN", name: "Brunei",           dial: "+673", flag: "🇧🇳" },
  { code: "TH", name: "Thailand",         dial: "+66",  flag: "🇹🇭" },
  { code: "PH", name: "Filipina",         dial: "+63",  flag: "🇵🇭" },
  { code: "PK", name: "Pakistan",         dial: "+92",  flag: "🇵🇰" },
  { code: "IN", name: "India",            dial: "+91",  flag: "🇮🇳" },
  { code: "BD", name: "Bangladesh",       dial: "+880", flag: "🇧🇩" },
  { code: "JP", name: "Jepang",           dial: "+81",  flag: "🇯🇵" },
  { code: "KR", name: "Korea Selatan",    dial: "+82",  flag: "🇰🇷" },
  { code: "CN", name: "Tiongkok",         dial: "+86",  flag: "🇨🇳" },
  { code: "TW", name: "Taiwan",           dial: "+886", flag: "🇹🇼" },
  { code: "HK", name: "Hong Kong",        dial: "+852", flag: "🇭🇰" },
  { code: "AU", name: "Australia",        dial: "+61",  flag: "🇦🇺" },
  { code: "NZ", name: "Selandia Baru",    dial: "+64",  flag: "🇳🇿" },
  { code: "GB", name: "Inggris",          dial: "+44",  flag: "🇬🇧" },
  { code: "DE", name: "Jerman",           dial: "+49",  flag: "🇩🇪" },
  { code: "NL", name: "Belanda",          dial: "+31",  flag: "🇳🇱" },
  { code: "FR", name: "Prancis",          dial: "+33",  flag: "🇫🇷" },
  { code: "BE", name: "Belgia",           dial: "+32",  flag: "🇧🇪" },
  { code: "IT", name: "Italia",           dial: "+39",  flag: "🇮🇹" },
  { code: "ES", name: "Spanyol",          dial: "+34",  flag: "🇪🇸" },
  { code: "CH", name: "Swiss",            dial: "+41",  flag: "🇨🇭" },
  { code: "SE", name: "Swedia",           dial: "+46",  flag: "🇸🇪" },
  { code: "NO", name: "Norwegia",         dial: "+47",  flag: "🇳🇴" },
  { code: "DK", name: "Denmark",          dial: "+45",  flag: "🇩🇰" },
  { code: "FI", name: "Finlandia",        dial: "+358", flag: "🇫🇮" },
  { code: "RU", name: "Rusia",            dial: "+7",   flag: "🇷🇺" },
  { code: "US", name: "Amerika Serikat",  dial: "+1",   flag: "🇺🇸" },
  { code: "CA", name: "Kanada",           dial: "+1",   flag: "🇨🇦" },
  { code: "BR", name: "Brasil",           dial: "+55",  flag: "🇧🇷" },
  { code: "ZA", name: "Afrika Selatan",   dial: "+27",  flag: "🇿🇦" },
  { code: "NG", name: "Nigeria",          dial: "+234", flag: "🇳🇬" },
  { code: "IQ", name: "Irak",             dial: "+964", flag: "🇮🇶" },
  { code: "IR", name: "Iran",             dial: "+98",  flag: "🇮🇷" },
  { code: "YE", name: "Yaman",            dial: "+967", flag: "🇾🇪" },
  { code: "SO", name: "Somalia",          dial: "+252", flag: "🇸🇴" },
  { code: "ET", name: "Etiopia",          dial: "+251", flag: "🇪🇹" },
  { code: "MM", name: "Myanmar",          dial: "+95",  flag: "🇲🇲" },
  { code: "VN", name: "Vietnam",          dial: "+84",  flag: "🇻🇳" },
  { code: "MV", name: "Maladewa",         dial: "+960", flag: "🇲🇻" },
  { code: "LB", name: "Lebanon",          dial: "+961", flag: "🇱🇧" },
];

const DEFAULT_COUNTRY = COUNTRIES[0]!; // Indonesia

// ─── Helper: parse E.164 → { country, localNumber } ──────────────────────────

export function parseE164(value: string): { country: Country; localNumber: string } {
  if (!value) return { country: DEFAULT_COUNTRY, localNumber: "" };

  // Cari dial code yang cocok (yang paling panjang dulu)
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (value.startsWith(c.dial)) {
      return { country: c, localNumber: value.slice(c.dial.length) };
    }
  }

  // Format lama (08xxx) → Indonesia
  if (value.startsWith("0")) {
    return { country: DEFAULT_COUNTRY, localNumber: value.slice(1) };
  }

  return { country: DEFAULT_COUNTRY, localNumber: value };
}

// ─── PhoneInput ───────────────────────────────────────────────────────────────

type Props = {
  /** Nilai E.164 penuh, mis. "+628xxxxxxxxx" ("" = kosong). */
  value: string;
  onChange: (e164: string) => void;
  onBlur?: () => void;
  /** Wajib: input ini tidak punya label terlihat. */
  ariaLabel: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
};

export function PhoneInput({ value, onChange, onBlur, ariaLabel, id, disabled, invalid, placeholder = "8xxxxxxxxxx", className }: Props) {
  // Nomor DITURUNKAN dari `value` (satu sumber kebenaran, tanpa state salinan). Yang disimpan hanya negara PILIHAN pengguna: dibutuhkan saat `value` masih
  // kosong (kode negara belum bisa dibaca dari nilai) dan untuk kode yang dipakai >1 negara (+1 = AS/Kanada). Aturan lint React Compiler melarang setState di effect.
  const [pickedCountry, setPickedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = parseE164(value);
  const country: Country = !value ? pickedCountry : value.startsWith(pickedCountry.dial) ? pickedCountry : parsed.country;
  const number = value ? parsed.localNumber : "";

  // Tutup dropdown saat klik luar
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function emit(c: Country, n: string) {
    const normalized = n.replace(/^0+/, ""); // buang angka 0 lokal di depan
    onChange(normalized ? `${c.dial}${normalized}` : "");
  }

  function handleCountrySelect(c: Country) {
    setPickedCountry(c);
    setOpen(false);
    setQuery("");
    emit(c, number);
    inputRef.current?.focus();
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = e.target.value.replace(/[^\d]/g, ""); // hanya digit
    emit(country, n);
  }

  const filtered = query.trim()
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.dial.includes(query))
    : COUNTRIES;

  return (
    <div className={cn("relative", className)} ref={wrapRef}>
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-md border bg-background text-sm transition-shadow focus-within:ring-4",
          invalid ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500/10" : "border-border focus-within:border-primary-500 focus-within:ring-primary-500/10",
        )}
      >
        {/* Tombol pilih negara */}
        <button
          type="button"
          aria-label="Pilih kode negara"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            setOpen((o) => !o);
            setQuery("");
          }}
          className={cn(
            "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-r border-border px-2.5 transition-colors",
            "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
            open && "bg-muted",
          )}
        >
          <span aria-hidden="true">{country.flag}</span>
          <span className="font-mono text-xs text-muted-foreground">{country.dial}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>

        {/* Input nomor */}
        <input
          id={id}
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          value={number}
          onChange={handleNumberChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* Dropdown negara */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-white shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              aria-label="Cari negara atau kode"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari negara atau kode..."
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul role="listbox" aria-label="Daftar negara" className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Tidak ditemukan.</li>
            ) : (
              filtered.map((c) => (
                <li key={c.code} role="option" aria-selected={country.code === c.code}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleCountrySelect(c);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                      country.code === c.code && "bg-primary-50 font-medium text-primary-700",
                    )}
                  >
                    <span className="text-base">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{c.dial}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
