import { GlobalRegistrator } from "@happy-dom/global-registrator";

// § Fase 32 — SATU-SATUNYA isi file ini SENGAJA cuma registrasi DOM,
// TIDAK BOLEH import package testing-library apa pun di sini (termasuk
// transitif lewat `@testing-library/react`). Alasan: ES module import
// di-hoist — kalau file ini JUGA import `@testing-library/react`,
// import itu (dan `@testing-library/dom` transitifnya) DIEVALUASI
// SEBELUM `await GlobalRegistrator.register()` di bawah sempat jalan.
// `@testing-library/dom`'s `screen` singleton dihitung SEKALI saat
// modul itu dievaluasi (`const screen = typeof document !== "undefined"
// ? ... : (stub yang selalu throw)`) — BUKAN lazy getter. Kalau
// `document` belum ada saat itu, `screen` PERMANEN jadi stub yang throw
// "global document has to be available", walau `document` didaftarkan
// belakangan. Ketemu 2026-09-05 lewat smoke test yang gagal terus
// walau registrasi sudah di-`await` dengan benar.
// FIX: pisah jadi 2 preload file berurutan (`bunfig.toml`) — file ini
// (registrasi DOM saja) jalan PERTAMA sampai selesai, baru `test/setup.ts`
// (import testing-library + matcher) dievaluasi setelahnya.
await GlobalRegistrator.register();
