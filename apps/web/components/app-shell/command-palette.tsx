"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { usePermissions } from "@/lib/use-permissions";

// § Fase 190D, ADR-0046 — palet perintah admin (Ctrl/⌘+K): berpindah halaman dan mencari pelanggan dari mana saja. Hanya navigasi ke rute yang sudah ada:
// item menu disaring izin (`permission`), pencarian pelanggan memakai endpoint admin yang sudah ber-izin `users.view` (tanpa izin → bagian itu tidak ada). Tidak ada
// data pribadi disimpan di penyimpanan browser; hasil hanya di memori selama dialog terbuka.
export type PaletteItem = { href: string; label: string; permission?: string };
type UserHit = { id: string; name: string; email: string };

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const permissions = usePermissions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const canSearchUsers = permissions.includes("users.view");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // pencarian pelanggan: debounce 300ms, minimal 2 karakter; hasil basi dibuang bila kueri berubah
  useEffect(() => {
    const q = query.trim();
    if (!open || !canSearchUsers || q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await api.admin.users.get({ query: { search: q, limit: 6 } });
      if (cancelled) return;
      const data = res.data as unknown as { users?: UserHit[] } | null;
      setHits(data?.users?.map((u) => ({ id: u.id, name: u.name, email: u.email })) ?? []);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, canSearchUsers]);

  const q = query.trim().toLowerCase();
  const visible = items.filter((i) => (!i.permission || permissions.includes(i.permission)) && (q === "" || i.label.toLowerCase().includes(q)));
  const shownHits = q.length >= 2 && canSearchUsers ? hits : [];

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setHits([]);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka pencarian cepat"
        className="hidden items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary-300 hover:text-foreground md:inline-flex"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Cari…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 text-[10px] font-medium">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQuery(""); setHits([]); } }}>
        <DialogContent className="max-w-lg p-0" hideClose>
          <DialogTitle className="sr-only">Pencarian cepat</DialogTitle>
          <DialogDescription className="sr-only">Ketik untuk berpindah halaman atau mencari pelanggan.</DialogDescription>
          <Command shouldFilter={false} className="rounded-xl">
            <CommandInput value={query} onValueChange={setQuery} placeholder="Ketik nama halaman atau nama/email pelanggan…" aria-label="Kolom pencarian" />
            <CommandList>
              <CommandEmpty>Tidak ada hasil.</CommandEmpty>
              {visible.map((item) => (
                <CommandItem key={item.href} value={`halaman ${item.label} ${item.href}`} onSelect={() => go(item.href)}>
                  <span className="flex-1">{item.label}</span>
                  <CornerDownLeft className="h-3 w-3 opacity-40" />
                </CommandItem>
              ))}
              {shownHits.map((u) => (
                <CommandItem key={u.id} value={`pelanggan ${u.id}`} onSelect={() => go(`/users/${u.id}`)}>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{u.name || u.email}</span> <span className="text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">Pelanggan</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
