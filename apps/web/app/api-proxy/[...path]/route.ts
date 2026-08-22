import { NextRequest, NextResponse } from "next/server";

// § next.config.ts (dihapus), lessons-learned.md 2026-08-19 — `rewrites()`
// bawaan Next.js TIDAK meneruskan `Set-Cookie` dengan benar untuk tujuan
// lintas-origin (diverifikasi via Playwright: header hilang total di
// response yang di-proxy). Route Handler manual ini forward SEMUA header
// termasuk multi-`Set-Cookie` (pakai `getSetCookie()`, BUKAN `Headers`
// biasa yang bisa menggabung jadi satu string tidak valid). DEV SAJA —
// production tidak butuh proxy ini (apps/web & apps/api satu situs asli).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function proxy(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const targetUrl = `${API_URL}/${path.join("/")}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host"); // host asli app.localhost:6209 membingungkan apps/api, biarkan fetch() set ulang

  const hasBody = !["GET", "HEAD"].includes(request.method);

  const backendRes = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual", // terusin redirect APA ADANYA ke browser, jangan diam-diam diikuti server-side
  });

  const responseHeaders = new Headers();
  backendRes.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") responseHeaders.set(key, value);
  });
  for (const cookie of backendRes.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new NextResponse(backendRes.body, { status: backendRes.status, headers: responseHeaders });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
