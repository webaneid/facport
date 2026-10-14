import { describe, test, expect, spyOn } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { user as userTable } from "../db/schema";
import { boss } from "./queue";

// § Fase 194 — laporan client: klik link verifikasi dari email → mendarat di `api.facinstitute.id/` (404). Penyebab: login tanpa callbackURL mengirim ulang link
// (`sendOnSignIn`) dengan callbackURL "/" (relatif) → setelah verifikasi dialihkan ke domain API. Email sekarang SELALU membawa callbackURL ke domain aplikasi.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler);
const post = (path: string, body: unknown) =>
  testApp.handle(new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function captureVerificationUrls(run: () => Promise<unknown>): Promise<string[]> {
  const spy = spyOn(boss, "send").mockImplementation((async () => "job-id") as never);
  try {
    await run();
    return spy.mock.calls
      .map((c) => c[1] as { subject?: string; html?: string })
      .filter((job) => job?.subject === "Verifikasi email Facport")
      .map((job) => /href="([^"]+)"/.exec(job.html ?? "")![1]!.replaceAll("&amp;", "&"));
  } finally {
    spy.mockRestore();
  }
}

describe("email verifikasi tidak pernah mengarah kembali ke domain API", () => {
  test("login akun belum terverifikasi TANPA callbackURL (sendOnSignIn) → link berisi callbackURL absolut ke origin aplikasi", async () => {
    const email = `verif-signin-${runId}@test.local`;
    await post("/api/auth/sign-up/email", { email, password: "PasswordTest123!", name: "Verif Test" });
    const urls = await captureVerificationUrls(() => post("/api/auth/sign-in/email", { email, password: "PasswordTest123!" }));
    expect(urls).toHaveLength(1);
    const callback = new URL(urls[0]!).searchParams.get("callbackURL")!;
    expect(callback.startsWith("http")).toBe(true);
    expect(callback.endsWith("/")).toBe(true);
    expect(callback).not.toBe("/");
  });

  test("daftar dengan callbackURL absolut (jalur register-form) tetap dihormati", async () => {
    const email = `verif-signup-${runId}@test.local`;
    const urls = await captureVerificationUrls(() =>
      post("/api/auth/sign-up/email", { email, password: "PasswordTest123!", name: "Verif Test 2", callbackURL: "http://localhost:6209/subscribe?plans=x" }),
    );
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]!).searchParams.get("callbackURL")).toBe("http://localhost:6209/subscribe?plans=x");
  });

  test("klik link hasil login (callback dinormalisasi) → akun terverifikasi dan redirect ke aplikasi, BUKAN ke domain API", async () => {
    const email = `verif-click-${runId}@test.local`;
    await post("/api/auth/sign-up/email", { email, password: "PasswordTest123!", name: "Verif Test 3" });
    const [urlOnSignIn] = await captureVerificationUrls(() => post("/api/auth/sign-in/email", { email, password: "PasswordTest123!" }));
    const u = new URL(urlOnSignIn!);
    const res = await testApp.handle(new Request(`http://localhost${u.pathname}${u.search}`));
    expect([301, 302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe(u.searchParams.get("callbackURL"));
    const [row] = await db.select().from(userTable).where(eq(userTable.email, email));
    expect(row!.emailVerified).toBe(true);
  });
});
