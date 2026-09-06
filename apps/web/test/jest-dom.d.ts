// § Fase 32 — augmentasi tipe `bun:test`'s `expect()` supaya matcher
// jest-dom (didaftarkan runtime via `expect.extend()` di `test/setup.ts`)
// juga dikenal TypeScript. `@testing-library/jest-dom` SEBENARNYA
// menyediakan `types/bun.d.ts` persis untuk ini, TAPI path itu TIDAK
// ada di `exports` map package.json-nya (cuma ".", "./jest-globals",
// "./matchers", "./vitest" yang resmi diekspos) — mengimpor path
// internal yang tidak diekspos itu rapuh (bisa berhenti resolve kalau
// struktur internal paket berubah versi berikutnya). Ditulis manual di
// sini, CUMA matcher yang benar-benar dipakai test — tambah baris baru
// kalau nanti butuh matcher jest-dom lain.
declare module "bun:test" {
  interface Matchers<T> {
    toBeInTheDocument(): void;
    toHaveAttribute(attr: string, value?: string): void;
  }
}

export {};
