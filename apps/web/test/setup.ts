import { expect, afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// § Fase 32 — WAJIB jalan SETELAH `test/happydom.ts` (§ komentar di
// file itu untuk alasan lengkap kenapa dipisah) — `bunfig.toml`
// `[test].preload` array urutannya berarti, file ini kedua.
expect.extend(matchers);

// § tanpa ini, komponen yang di-render test SEBELUMNYA tetap nempel di
// `document.body` pas test BERIKUTNYA jalan (beda file/describe bisa
// tabrakan query — `getByText` dkk bisa nemu elemen dari test lain).
afterEach(() => {
  cleanup();
});
