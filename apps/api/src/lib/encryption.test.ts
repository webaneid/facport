import { describe, test, expect } from "bun:test";
import { encrypt, decrypt } from "./encryption";

describe("encrypt/decrypt", () => {
  test("round-trip menghasilkan plaintext yang sama", () => {
    const plaintext = "accurate-access-token-rahasia-123";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  test("payload berbeda tiap kali enkripsi ulang (IV acak)", () => {
    const plaintext = "same-plaintext";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  test("tolak payload yang di-tamper (authTag mismatch)", () => {
    const encrypted = encrypt("some-token");
    const parts = encrypted.split(":");
    const tampered = `${parts[0]}:${parts[1]}:${Buffer.from("tampered-data").toString("base64")}`;
    expect(() => decrypt(tampered)).toThrow();
  });
});
