import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Notasi bracket ("NODE_ENV") SENGAJA, bukan process.env.NODE_ENV — Bun
  // const-fold pola dot-notation itu SAAT BUILD. Lihat lib/auth.ts §
  // crossSubDomainCookies buat detail lengkap bug class ini.
  transport:
    process.env["NODE_ENV"] !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: ["req.headers.authorization", "*.password", "*.token"],
});
