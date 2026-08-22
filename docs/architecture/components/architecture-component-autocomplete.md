# Component — Autocomplete / Combobox

## Aturan
**Semua dropdown-select WAJIB pakai autocomplete/combobox**, bukan `<select>`
HTML polos, begitu opsi lebih dari ~10 item ATAU datanya dari server (async).
`<select>` polos boleh dipakai HANYA untuk pilihan tetap sangat pendek (mis.
status "Aktif/Nonaktif" 2 opsi) yang tidak butuh pencarian.

## Kenapa
Dropdown panjang tanpa pencarian (mis. pilih akun/customer dari ratusan
opsi Accurate Online) itu UX buruk — user harus scroll manual. Ini juga
alasan kenapa UI "cocokkan kolom" import mapping (§
`architecture-accurate-integration.md`) WAJIB pakai pola ini.

## Tool: `cmdk`
Sudah bagian ekosistem shadcn/ui (komponen `Command`), dibungkus `Popover`
untuk jadi combobox — tidak nambah dependency baru di luar stack yang ada.

```tsx
// apps/web/components/ui/combobox.tsx — WAJIB dipakai ulang, jangan bikin varian baru per fitur
"use client";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandItem, CommandList, CommandEmpty } from "@/components/ui/command";

type ComboboxOption = { value: string; label: string };

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  onSearch, // opsional — kalau diisi, search di-debounce ke server (async), bukan filter di client
}: {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSearch?: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm">
          {selected?.label ?? placeholder}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command shouldFilter={!onSearch}>
          <CommandInput
            placeholder="Cari..."
            onValueChange={onSearch}
          />
          <CommandEmpty>Tidak ada hasil.</CommandEmpty>
          <CommandList>
            {options.map((opt) => (
              <CommandItem key={opt.value} onSelect={() => { onChange(opt.value); setOpen(false); }}>
                <Check className={value === opt.value ? "opacity-100" : "opacity-0"} />
                {opt.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

## Async (Server-side Search)
Untuk data besar (mis. cari kecamatan dari ribuan baris), JANGAN load semua
opsi ke client sekaligus. Pakai `onSearch` (debounce ~300ms) yang panggil
endpoint API dengan query param `?search=`, endpoint balikin max ~20 hasil
paling relevan. Filter di client (`shouldFilter`) cuma dipakai untuk dataset
kecil yang memang sudah full di-load (mis. pilih negara dari 250 opsi statis).

## Referensi
Dipakai di: assign role/permission, cocokkan kolom Excel ke field Accurate
saat import (§ `architecture-accurate-integration.md`), pilih akun/customer/
item dari data referensi Accurate, dan mana pun ada pilihan dari daftar panjang.
