import { describe, test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { Footer } from "./footer";

// § Fase 103 (2026-09-11) — logic murni footer copyright (rentang
// tahun, fallback versi/nama perusahaan). `new Date()` TIDAK di-mock —
// bandingkan ke teks LENGKAP yang diharapkan (dihitung dari tahun
// sekarang saat test jalan), bukan regex longgar yang bisa cocok ke
// bagian lain teks (mis. "-" di "Facport versi:") — tetap benar berapa
// pun tahun sekarang.
function footerText(container: HTMLElement): string | null {
  return container.querySelector("footer")?.textContent ?? null;
}

describe("Footer", () => {
  test("copyrightStartYear beda dari tahun sekarang -> tampil rentang \"start - sekarang\"", () => {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 1; // WAJIB beda dari tahun sekarang, apa pun tahunnya
    const { container } = render(<Footer companyName="FAC Institute" copyrightStartYear={startYear} appVersion="v1.27.2" />);
    expect(footerText(container)).toBe(`© Copyright ${startYear} - ${currentYear} FAC Institute - Facport versi: 1.27.2`);
  });

  test("copyrightStartYear SAMA dengan tahun sekarang -> tampil 1 tahun saja, tanpa rentang", () => {
    const currentYear = new Date().getFullYear();
    const { container } = render(<Footer companyName="FAC Institute" copyrightStartYear={currentYear} appVersion="v1.0.0" />);
    expect(footerText(container)).toBe(`© Copyright ${currentYear} FAC Institute - Facport versi: 1.0.0`);
  });

  test("copyrightStartYear tidak diisi -> fallback tahun sekarang saja", () => {
    const currentYear = new Date().getFullYear();
    const { container } = render(<Footer companyName="FAC Institute" appVersion="v1.0.0" />);
    expect(footerText(container)).toBe(`© Copyright ${currentYear} FAC Institute - Facport versi: 1.0.0`);
  });

  test("appVersion tidak diisi -> fallback 'dev'", () => {
    const currentYear = new Date().getFullYear();
    const { container } = render(<Footer companyName="FAC Institute" copyrightStartYear={currentYear} />);
    expect(footerText(container)).toBe(`© Copyright ${currentYear} FAC Institute - Facport versi: dev`);
  });

  test("prefix 'v' pada versi dibuang untuk tampilan (contoh: v1.27.2 -> 1.27.2)", () => {
    const currentYear = new Date().getFullYear();
    const { container } = render(<Footer companyName="FAC Institute" copyrightStartYear={currentYear} appVersion="v1.27.2" />);
    expect(footerText(container)).toContain("versi: 1.27.2");
    expect(footerText(container)).not.toContain("versi: v1.27.2");
  });

  test("versi tanpa prefix 'v' (mis. \"staging\") ditampilkan apa adanya", () => {
    const currentYear = new Date().getFullYear();
    const { container } = render(<Footer companyName="FAC Institute" copyrightStartYear={currentYear} appVersion="staging" />);
    expect(footerText(container)).toBe(`© Copyright ${currentYear} FAC Institute - Facport versi: staging`);
  });

  test("companyName tidak diisi -> fallback 'Facport', BUKAN literal 'undefined'", () => {
    const currentYear = new Date().getFullYear();
    const { container } = render(<Footer copyrightStartYear={currentYear} appVersion="v1.0.0" />);
    expect(footerText(container)).toBe(`© Copyright ${currentYear} Facport - Facport versi: 1.0.0`);
  });
});
