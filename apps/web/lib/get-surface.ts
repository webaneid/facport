// § architecture-domain-routing.md — SATU sumber kebenaran resolusi surface
// dari Host header, jangan duplikasi logic ini di file lain.
export type Surface = "landing" | "admin" | "app";

export function getSurface(host: string): Surface {
  const h = host.replace(/:\d+$/, ""); // buang port kalau ada (local dev)
  if (h === "admin.facport.com" || h === "admin.localhost") return "admin";
  if (h === "app.facport.com" || h === "app.localhost") return "app";
  return "landing"; // root domain, www, atau localhost polos
}
