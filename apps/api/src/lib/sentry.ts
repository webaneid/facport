import * as Sentry from "@sentry/bun";
import { env } from "./env";

Sentry.init({
  dsn: env.SENTRY_DSN_API, // kosong = disabled, aman untuk dev lokal
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
});

export { Sentry };
