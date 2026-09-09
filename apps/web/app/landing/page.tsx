import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { FunfactBar } from "./funfact-bar";
import { ModuleFeatures } from "./module-features";

// Link daftar/login WAJIB absolute URL ke surface "app" (subdomain BEDA
// dari landing) — path relatif (`/register`) bakal resolve ke surface
// landing sendiri lewat proxy, bukan surface app (§ architecture-domain-routing.md,
// lesson dari pola tenancy-domain-routing lama soal hardcoded relative path).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:6209";

const HERO_ILLUSTRATION = "https://facinstitute.id/wp-content/uploads/2025/02/facport-hero-560x700.webp";
const CLOSING_ILLUSTRATION = "https://facinstitute.id/wp-content/uploads/2025/02/facport-price-copy.webp";

type PublicStats = { customerCount: number; successfulRowCount: number; estimatedTimeSavedSeconds: number };

// § Fase 47 — redesign total, nyontek desain referensi (screenshot user).
// Section STATIS (hero, banner CTA hijau, penutup) TETAP hardcode JSX —
// cuma section Fitur (§ ModuleFeatures) dan Funfact (§ FunfactBar) yang
// dinamis (data admin/database), sesuai instruksi eksplisit user.
export default async function LandingPage() {
  const [{ data: plans }, statsRes] = await Promise.all([
    api.plans.get(),
    // § cache 5 menit — hindari query COUNT berulang tiap visitor buka
    // landing, pola sama `getPublicSettings()` (Fase 12). `.catch(() =>
    // null)` WAJIB — saat `docker build` (next build prerender halaman ini),
    // API belum jalan sama sekali (connection refused), fetch mentah
    // melempar error dan menggagalkan build TOTAL kalau tidak ditangkap
    // (beda dari `statsRes.ok` yang cuma nangkep response HTTP error, bukan
    // kegagalan koneksi). Fallback default di bawah, self-correct lewat ISR
    // revalidate begitu API sungguhan hidup pasca-deploy.
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/public/stats`, {
      next: { revalidate: 300 },
    }).catch(() => null),
  ]);
  const stats: PublicStats = statsRes?.ok
    ? await statsRes.json()
    : { customerCount: 0, successfulRowCount: 0, estimatedTimeSavedSeconds: 0 };

  return (
    <main className="flex flex-col">
      {/* HERO */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-extrabold leading-tight text-slate-900 md:text-5xl">
            Import <span className="text-landing-primary">File Excel</span> ke Accurate Online
          </h1>
          <p className="max-w-md text-slate-500">
            Facport memudahkan bisnis Anda dengan mengimpor semua jenis transaksi dari <strong>Excel</strong> ke{" "}
            <strong>Accurate Online</strong> secara instan. Tanpa ribet, lebih cepat, dan efisien!
          </p>
          <div className="flex items-center gap-6">
            <a
              href={`${APP_URL}/register`}
              className="rounded-full bg-landing-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-landing-primary-dark"
            >
              Kontak Kami
            </a>
            <a href="#fitur" className="inline-flex items-center gap-1 text-sm font-medium text-slate-900">
              Coba Dulu <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HERO_ILLUSTRATION} alt="Import Excel ke Accurate Online" className="w-full max-w-sm" />
        </div>
      </section>

      {/* BANNER CTA HIJAU */}
      <section className="bg-landing-primary-light px-6 py-16 text-center">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
          <h2 className="text-2xl font-extrabold text-slate-900 md:text-3xl">
            Tinggalkan Cara Manual dan Beralih ke Cara Mudah, Efektif dan Efisien.
          </h2>
          <p className="text-sm text-slate-600">
            Coba Facport sekarang dan rasakan kemudahan impor transaksi ke Accurate Online hanya dalam 1 klik! Hemat
            waktu, minim kesalahan, dan tingkatkan efisiensi bisnis Anda.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a
              href={`${APP_URL}/register`}
              className="rounded-full bg-landing-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-landing-primary-dark"
            >
              Konsultasi Gratis
            </a>
            <a
              href="#fitur"
              className="inline-flex items-center gap-1 rounded-full border border-landing-primary px-6 py-3 text-sm font-medium text-landing-primary"
            >
              Coba Gratis <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* FUNFACT — DINAMIS */}
      <section className="px-6 pt-16">
        <FunfactBar
          customerCount={stats.customerCount}
          successfulRowCount={stats.successfulRowCount}
          estimatedTimeSavedSeconds={stats.estimatedTimeSavedSeconds}
        />
      </section>

      {/* FITUR — DINAMIS (1 kartu = 1 sub-modul, sumber: paket aktif admin) */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-landing-primary">Fitur Facport</p>
        <h2 className="mt-2 max-w-lg text-3xl font-extrabold text-slate-900">Dari Excel ke Accurate Online, Lebih Cepat &amp; Mudah!</h2>
        <div className="mt-10">
          <ModuleFeatures plans={plans ?? []} appUrl={APP_URL} />
        </div>
      </section>

      {/* PENUTUP / CTA — STATIS (harga spesifik TIDAK direplikasi, § Keputusan Kecil phase-47 doc) */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 md:grid-cols-2">
        <div className="flex justify-center md:order-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CLOSING_ILLUSTRATION} alt="Hemat waktu dengan Facport" className="w-full max-w-sm" />
        </div>
        <div className="flex flex-col gap-4 md:order-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-landing-primary">Harga</p>
          <h2 className="text-3xl font-extrabold text-slate-900">Hemat Waktu, Minim Kesalahan, Maksimalkan Akurasi!</h2>
          <p className="text-sm text-slate-500">
            Mulai dari paket fitur yang kamu butuhkan — lihat daftar lengkap &amp; harga di section Fitur di atas.
          </p>
          <a
            href="#fitur"
            className="w-fit rounded-full bg-landing-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-landing-primary-dark"
          >
            Pesan Sekarang
          </a>
        </div>
      </section>
    </main>
  );
}
