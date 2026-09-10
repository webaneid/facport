import { describe, test, expect } from "bun:test";
import { parseMinioPublicEndpoint } from "./minio";

// § Fase 93 (2026-09-10, BUG DITEMUKAN via laporan user "bukti transfer
// tidak bisa dibuka") — presigned URL untuk bukti pembayaran SEBELUM
// fix ini dibuat pakai `minioClient` (host INTERNAL Docker, `minio`,
// tidak bisa di-resolve browser sama sekali di production). Fix:
// client TERPISAH (`minioPublicClient`) dikonfigurasi dari
// `MINIO_PUBLIC_URL` (host publik lewat reverse proxy) — `presignedGetObject`
// TIDAK pernah benar-benar connect saat generate URL (signature dihitung
// lokal), jadi aman. Test ini pastikan PARSING `MINIO_PUBLIC_URL`-nya
// benar untuk berbagai bentuk URL (production HTTPS default port, dev
// HTTP dengan port eksplisit) — bukan test jaringan sungguhan.
describe("parseMinioPublicEndpoint", () => {
  test("HTTPS tanpa port eksplisit -> port 443, useSSL true (kasus production, mis. media.<domain>)", () => {
    expect(parseMinioPublicEndpoint("https://media.facinstitute.id")).toEqual({
      endPoint: "media.facinstitute.id",
      port: 443,
      useSSL: true,
    });
  });

  test("HTTP dengan port eksplisit -> port sesuai URL, useSSL false (kasus dev lokal)", () => {
    expect(parseMinioPublicEndpoint("http://localhost:9000")).toEqual({
      endPoint: "localhost",
      port: 9000,
      useSSL: false,
    });
  });

  test("HTTP tanpa port eksplisit -> port 80, useSSL false", () => {
    expect(parseMinioPublicEndpoint("http://media.example.com")).toEqual({
      endPoint: "media.example.com",
      port: 80,
      useSSL: false,
    });
  });

  test("HTTPS dengan port eksplisit non-default -> port sesuai URL, useSSL tetap true", () => {
    expect(parseMinioPublicEndpoint("https://media.example.com:8443")).toEqual({
      endPoint: "media.example.com",
      port: 8443,
      useSSL: true,
    });
  });
});
