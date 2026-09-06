import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";

// § Fase 32 — verifikasi fondasi (happy-dom + React Testing Library +
// matcher jest-dom) beneran jalan SEBELUM nulis test komponen sungguhan
// di file lain. Hapus file ini kalau sudah ada test komponen nyata yang
// membuktikan hal yang sama secara tidak langsung.
describe("Fondasi test frontend (happy-dom + RTL)", () => {
  test("bisa render elemen React & query DOM-nya", () => {
    render(<button>Klik Saya</button>);
    expect(screen.getByRole("button", { name: "Klik Saya" })).toBeInTheDocument();
  });
});
