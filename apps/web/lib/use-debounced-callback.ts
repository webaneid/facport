import { useCallback, useEffect, useRef } from "react";

// § HOTFIX 2026-09-29 (Fase 163) — `Combobox.onSearch` (§ components/ui/combobox.tsx)
// dipanggil LANGSUNG oleh `CommandInput.onValueChange`, jadi tiap keystroke =
// 1 request ke `GET /accurate/items/search`/`glaccounts/search` (panggilan
// Accurate SUNGGUHAN, bukan cuma DB lokal) — TERBUKTI NYATA di production:
// ketik "gula" (4 huruf) langsung 429 Too Many Requests. Project ini SUDAH
// punya pola wajib debounce untuk search box (§ ADR-0024, ditemukan pertama
// kali di `admin/users/page.tsx`, § `search-form.tsx`) — kelas bug yang SAMA
// terulang di sini karena `Combobox` (beda dari `SearchForm`) tidak
// mengelola state input-nya sendiri, jadi debounce harus dipasang di sisi
// pemanggil. Hook generic ini (bukan cuma fix lokal 1 file) supaya
// pemakaian `Combobox.onSearch` LAIN di masa depan tidak mengulang bug ini.
export function useDebouncedCallback<Args extends unknown[]>(callback: (...args: Args) => void, delayMs = 350): (...args: Args) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbackRef = useRef(callback);

  // § ref di-update di effect, BUKAN langsung saat render — eslint
  // `react-hooks/refs` (React 19) melarang tulis `ref.current` di badan
  // komponen ("Cannot access refs during render").
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return useCallback(
    (...args: Args) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => callbackRef.current(...args), delayMs);
    },
    [delayMs],
  );
}
