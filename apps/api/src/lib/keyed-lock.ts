// § Fase 199 (C4b) — kunci per-kunci: panggilan dengan kunci SAMA berjalan berurutan (yang kedua menunggu yang pertama selesai, lalu menjalankan fungsinya SENDIRI),
// kunci BERBEDA berjalan paralel. Dipakai find-or-create data master Accurate (pelanggan/vendor/barang/klasifikasi/PIC): bila dua grup paralel sama-sama melihat "belum ada"
// lalu sama-sama membuat, yang kedua gagal sebagai duplikat. Dengan kunci, semantik sama dengan eksekusi berurutan (yang kedua menemukan data yang baru dibuat), dan
// TIDAK melewati langkah apa pun (mis. pembaruan akun bila createFields berbeda). Kunci wajib memuat id sesi Accurate agar lintas-database tidak saling menunggu.
const tails = new Map<string, Promise<unknown>>();

export function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn); // galat pemanggil sebelumnya tidak memblokir yang berikutnya
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key); // bersihkan bila tak ada yang antre di belakang
  });
  return run;
}

/** Hanya untuk tes/diagnostik: jumlah kunci yang masih tersimpan. */
export function keyedLockSize(): number {
  return tails.size;
}
