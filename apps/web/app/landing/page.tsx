import { api } from "@/lib/api-client";

// Link daftar/login WAJIB absolute URL ke surface "app" (subdomain BEDA
// dari landing) — path relatif (`/register`) bakal resolve ke surface
// landing sendiri lewat proxy, bukan surface app (§ architecture-domain-routing.md,
// lesson dari pola tenancy-domain-routing lama soal hardcoded relative path).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:6209";

export default async function LandingPage() {
  // § docs/decisions/adr-0010-response-format-eden.md — res.data langsung
  // array plans (bare), tidak perlu `as unknown as` lagi (root cause double-
  // wrap sudah diperbaiki di server).
  const { data: plans } = await api.plans.get();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <section className="flex flex-col items-center gap-3 py-12 text-center">
        <h1 className="text-3xl font-semibold">Facport</h1>
        <p className="max-w-md text-neutral-500">
          Jembatan otomatis impor data transaksi dari Excel ke Accurate Online — satu klik, bukan input manual.
        </p>
        <div className="mt-4 flex gap-3">
          <a href={`${APP_URL}/register`}>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">Daftar</button>
          </a>
          <a href={`${APP_URL}/login`}>
            <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm">Login</button>
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Paket Langganan</h2>
        {!plans || plans.length === 0 ? (
          <p className="text-sm text-neutral-500">Belum ada paket tersedia.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-lg border border-neutral-200 p-4">
                <h3 className="font-medium">{plan.name}</h3>
                {/* § Fase 10, ADR-0015 — plan.price nullable (Facport
                    sementara tanpa harga, supporting app) */}
                <p className="text-2xl font-semibold">
                  {plan.price != null ? (
                    <>
                      Rp{plan.price.toLocaleString("id-ID")}
                      <span className="text-sm font-normal text-neutral-500">/{plan.durationDays} hari</span>
                    </>
                  ) : (
                    <span className="text-base font-normal text-neutral-500">Hubungi kami</span>
                  )}
                </p>
                <ul className="mt-2 text-sm text-neutral-500">
                  {plan.modules.map((m) => (
                    <li key={m}>• {m}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
