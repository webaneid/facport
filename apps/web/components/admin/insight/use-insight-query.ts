"use client";

import { useEffect, useRef, useState } from "react";

// § Fase 189D — pengambil data tunggal untuk semua tab Insight. `key` = identitas kueri (parameter + nonce muat-ulang);
// hasil lama TIDAK ditampilkan untuk key baru (loading = true), jadi tidak ada data basi yang tampak benar.
type Loaded<T> = { data: T | null | undefined; error: unknown };

export function useInsightQuery<T>(key: string, load: () => Promise<Loaded<T>>) {
  const [state, setState] = useState<{ key: string; data: T | null; failed: boolean } | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((res) => {
        if (!cancelled) setState({ key, data: res.error ? null : ((res.data ?? null) as T | null), failed: Boolean(res.error) });
      })
      .catch(() => {
        if (!cancelled) setState({ key, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  const loading = state?.key !== key;
  return { loading, data: loading ? null : (state?.data ?? null), failed: !loading && Boolean(state?.failed) };
}
