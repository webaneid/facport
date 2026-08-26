// § architecture-domain-routing.md — SATU sumber kebenaran resolusi surface
// dari Host header, jangan duplikasi logic ini di file lain.
export type Surface = "landing" | "admin" | "app";

export function getSurface(host: string): Surface {
  const h = host.replace(/:\d+$/, "").toLowerCase(); // buang port kalau ada (local dev)
  if (h.startsWith("admin.")) return "admin";
  if (h.startsWith("app.")) return "app";
  return "landing"; // root domain, subdomain lain (mis. landing/frontend.*), www, atau localhost polos
}
