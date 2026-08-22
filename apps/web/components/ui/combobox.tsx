// WAJIB dipakai ulang, jangan bikin varian baru per fitur — lihat
// docs/architecture/components/architecture-component-autocomplete.md
"use client";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandItem, CommandList, CommandEmpty } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type ComboboxOption = { value: string; label: string };

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  onSearch,
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
        <button className="flex w-full items-center justify-between rounded-md border border-neutral-300 px-3 py-2 text-sm">
          {selected?.label ?? placeholder}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command shouldFilter={!onSearch}>
          <CommandInput placeholder="Cari..." onValueChange={onSearch} />
          <CommandEmpty>Tidak ada hasil.</CommandEmpty>
          <CommandList>
            {options.map((opt) => (
              <CommandItem
                key={opt.value}
                onSelect={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <Check className={cn("h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")} />
                {opt.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
