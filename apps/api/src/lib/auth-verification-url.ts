// § Fase 194 — link verifikasi email selalu berakhir di domain APLIKASI. Better Auth memakai `callbackURL` "/" (relatif) bila login tidak membawa callback
// (`sendOnSignIn`, sign-in.mjs) — setelah verifikasi berhasil browser dialihkan ke "/" di domain API (`api.*` → 404). Di sini callback yang kosong/relatif diubah
// menjadi alamat di `appOrigin`. Callback absolut dibiarkan (sudah lolos pengecekan origin tepercaya Better Auth saat link dibuat). Nilai relatif yang tidak
// aman (protocol-relative `//host`, backslash, bukan diawali `/`) TIDAK dipakai — jatuh ke halaman utama aplikasi.
const SAFE_RELATIVE = /^\/(?!\/)[^\\]*$/;

export function normalizeVerificationUrl(url: string, appOrigin: string): string {
  const origin = appOrigin.replace(/\/+$/, "");
  const parsed = new URL(url);
  const callback = parsed.searchParams.get("callbackURL");
  let next: string;
  if (callback && /^https?:\/\//i.test(callback)) return url;
  if (callback && SAFE_RELATIVE.test(callback)) next = `${origin}${callback}`;
  else next = `${origin}/`;
  parsed.searchParams.set("callbackURL", next);
  return parsed.toString();
}
