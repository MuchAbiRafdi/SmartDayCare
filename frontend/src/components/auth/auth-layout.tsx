import Link from "next/link";
import { fetchPublic } from "@/lib/api";
import { airOverall, airTone, AIR_LABEL } from "@/lib/derive";
import { Logo } from "@/components/site/logo";
import { Clock } from "@/components/site/clock";
import { Badge } from "@/components/ui/badge";

/** Bingkai halaman masuk/daftar: panel merek di kiri, formulir di kanan. */
export async function AuthLayout({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  const pub = await fetchPublic();
  const air = pub ? airOverall(pub.air.readings, pub.thresholds) : null;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="stage-bg relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div className="hero-glow pointer-events-none absolute inset-0" aria-hidden />
        <Link href="/" className="relative">
          <Logo dark />
        </Link>
        <div className="relative max-w-md">
          <p className="text-[12.5px] font-semibold tracking-[0.08em] text-white/70 uppercase">Intelligent Child Development & Wellbeing Platform</p>
          <h2 className="mt-2 text-[30px] leading-tight text-white">Catatan harian anak, menjadi insight yang bisa dijelaskan.</h2>
          <ul className="mt-6 space-y-3 text-[15px] text-white/80">
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" aria-hidden />
              Orang tua hanya melihat anak yang tertaut dengan kode dari daycare.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" aria-hidden />
              Kamera dibuka hanya setelah disetujui admin; setiap pembukaan tercatat.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" aria-hidden />
              Insight perkembangan dihitung dari catatan anak itu sendiri dan menyebut buktinya.
            </li>
          </ul>
        </div>
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 text-[13.5px] text-white/70">
          <span>
            Anak hadir: <b className="text-white">{pub ? `${pub.present} dari ${pub.childCount}` : "—"}</b>
          </span>
          <span className="inline-flex items-center gap-2">
            Udara ruang anak:{" "}
            {air ? (
              <Badge tone={airTone(air.status)} dot>
                {AIR_LABEL[air.status]}
              </Badge>
            ) : (
              "—"
            )}
          </span>
          <Clock className="tabular-nums" />
        </div>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center">
        <div className="mb-8 lg:hidden">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="mx-auto w-full max-w-[440px]">
          <h1 className="text-[26px] leading-tight">{title}</h1>
          <p className="text-muted mt-1.5 text-[15px]">{desc}</p>
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
