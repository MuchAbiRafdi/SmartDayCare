import Link from "next/link";
import { cookies } from "next/headers";
import { Activity, BarChart3, Building2, HeartHandshake, MessageCircle, ShieldCheck, Sparkles, Video } from "lucide-react";
import { fetchPublic } from "@/lib/api";
import { HeroCta, SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { AppWindow, ContactForm, FaqList, Pricing } from "@/components/site/landing-islands";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const THEMES: { n: number; icon: React.ReactNode; title: string; en: string; desc: string; items: string[]; tone: string }[] = [
  {
    n: 1,
    icon: <Activity size={20} />,
    title: "Catatan Aktivitas Harian",
    en: "Interactive Daily Activity System",
    desc: "Pengasuh mencatat aktivitas, makan, tidur, mood, kehadiran, dan foto kegiatan dari ponsel. Orang tua melihatnya saat itu juga.",
    items: ["8 jenis aktivitas dengan catatan pengasuh", "Menu & porsi tiap waktu makan", "Tidur siang beserta kualitasnya", "Mood pagi dan siang"],
    tone: "bg-blue-50 text-blue-700",
  },
  {
    n: 2,
    icon: <MessageCircle size={20} />,
    title: "Komunikasi Orang Tua–Daycare",
    en: "Parent–Daycare Communication",
    desc: "Percakapan langsung dengan pengasuh kelompok anak, pengumuman resmi dari daycare, dan grup orang tua dalam satu tempat.",
    items: ["Balasan pengasuh pada jam kerja", "Pengumuman tercatat dengan waktu", "Ringkasan harian pukul 16.00"],
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    n: 3,
    icon: <Video size={20} />,
    title: "Kamera dengan Hak Akses",
    en: "CCTV Transparency with Role-Based Access",
    desc: "Orang tua mengajukan akses kamera ruang anaknya; admin menyetujui untuk jangka waktu tertentu. Setiap pembukaan kamera tercatat.",
    items: ["Akses hanya setelah disetujui", "Berlaku selama anak hadir", "Riwayat siapa membuka apa, kapan"],
    tone: "bg-slate-100 text-slate-700",
  },
  {
    n: 4,
    icon: <BarChart3 size={20} />,
    title: "Dashboard Analitik Perkembangan",
    en: "Visual Analytics Dashboard",
    desc: "Tren aktivitas, mood, tidur, makan, dan kehadiran per anak — mingguan, bulanan, atau semester — dengan insight dan rekomendasi yang menyebut buktinya.",
    items: ["Profil sosial, motorik, kognitif, emosi", "Insight dari pola catatan anak sendiri", "Laporan perkembangan siap cetak"],
    tone: "bg-violet-50 text-violet-700",
  },
  {
    n: 5,
    icon: <HeartHandshake size={20} />,
    title: "Kepercayaan & Keterlibatan",
    en: "Smart Trust & Engagement",
    desc: "Umpan balik orang tua dengan bintang dan komentar, kecepatan balasan daycare, dan keterlibatan orang tua diukur apa adanya.",
    items: ["Kepuasan orang tua per minggu", "Umpan balik dibalas dan tercatat", "Skor kepercayaan dengan rumus terbuka"],
    tone: "bg-orange-50 text-orange-700",
  },
];

export default async function LandingPage() {
  const jar = await cookies();
  const loggedIn = Boolean(jar.get("sd_session")?.value);
  const pub = await fetchPublic();
  const faq = (pub?.faq ?? []).slice(0, 5);

  return (
    <>
      <SiteHeader loggedIn={loggedIn} />
      <main>
        <section className="hero-bg border-line relative overflow-hidden border-b">
          <div className="container-x relative grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-100/60 px-3 py-1 text-[12.5px] font-semibold text-teal-800">
                <Building2 size={14} /> Smart City · Smart Health & Living
              </p>
              <h1 className="mt-4 text-[38px] leading-[1.06] font-bold tracking-[-0.02em] md:text-[54px]">
                SmartDayCare <span className="grad-text">AI</span>
              </h1>
              <p className="text-ink-2 mt-2 text-[19px] font-semibold md:text-[22px]">Intelligent Child Development & Wellbeing Platform</p>
              <p className="mt-4 text-[15px] font-medium text-teal-800 italic md:text-[16px]">
                “Transforming Daily Child Activities into Personalized Development Insights”
              </p>
              <p className="text-muted mt-4 max-w-xl text-[16px] leading-relaxed">
                Platform berbasis AI untuk mencatat aktivitas harian anak dan memberikan analisis perkembangan yang personal — dari catatan pengasuh yang
                sederhana menjadi insight yang bisa dibaca orang tua dan pengelola daycare.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <HeroCta loggedIn={loggedIn} />
                <Link href="#kemampuan">
                  <Button size="lg">Lihat kemampuan</Button>
                </Link>
              </div>
              <p className="text-muted mt-4 text-[13px]">Akun orang tua gratis; daycare membayar per anak aktif. Tanpa kartu kredit.</p>
            </div>
            <AppWindow initial={pub} />
          </div>
        </section>

        <section className="border-line bg-surface border-b">
          <div className="container-x text-ink-2 grid gap-4 py-6 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Setiap catatan menyebut pencatatnya", "Nama pengasuh dan waktu tersimpan pada semua catatan dan foto."],
              ["Kamera hanya dengan persetujuan", "Orang tua mengajukan akses; admin menyetujui; setiap pembukaan tercatat."],
              ["Insight yang bisa dijelaskan", "Setiap insight menunjukkan angka dan rentang catatan yang menjadi dasarnya."],
              ["Foto & rekaman disimpan terbatas", "Dihapus otomatis setelah masa simpan yang diatur admin."],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-3">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" aria-hidden />
                <div>
                  <div className="text-ink font-semibold">{t}</div>
                  <div className="text-muted">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="kemampuan" className="container-x scroll-mt-20 py-16 md:py-20">
          <SectionTitle
            kicker="Lima kemampuan utama"
            title="Dari catatan harian sampai insight perkembangan"
            desc="Satu platform untuk orang tua, pengasuh, dan admin daycare — tiap peran melihat bagian yang memang menjadi urusannya."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {THEMES.map((t) => (
              <article key={t.n} className="panel flex flex-col p-6">
                <div className="flex items-center gap-3">
                  <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] " + t.tone}>{t.icon}</span>
                  <div>
                    <div className="text-muted text-[11.5px] font-semibold tracking-[0.08em] uppercase">Tema {t.n}</div>
                    <h3 className="text-[17px] leading-tight">{t.title}</h3>
                  </div>
                </div>
                <p className="text-faint mt-1.5 text-[12.5px] font-medium">{t.en}</p>
                <p className="text-muted mt-3 text-[14.5px] leading-relaxed">{t.desc}</p>
                <ul className="text-ink-2 mt-4 space-y-1.5 text-[13.5px]">
                  {t.items.map((i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden />
                      {i}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            <article className="flex flex-col justify-center rounded-[14px] bg-[linear-gradient(150deg,#1d47a3,#2f6fed)] p-6 text-white">
              <Sparkles size={22} className="text-white/80" />
              <h3 className="mt-3 text-[18px] text-white">Bagaimana AI-nya bekerja</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-white/85">
                Insight dihitung dari catatan anak itu sendiri: rata-rata dan tren per minggu, perbandingan dengan periode sebelumnya, dan penyimpangan dari
                kebiasaan anak. Tidak ada tebakan tanpa data; bila catatan belum cukup, dasbor mengatakannya.
              </p>
              <Link href="#cara-ai" className="mt-4 text-[14px] font-semibold text-white underline-offset-2 hover:underline">
                Baca penjelasannya →
              </Link>
            </article>
          </div>
        </section>

        <section id="untuk-siapa" className="band-wash border-line/70 scroll-mt-20 border-y">
          <div className="container-x py-16 md:py-20">
            <SectionTitle
              kicker="Untuk siapa"
              title="Satu catatan harian, tiga sudut pandang"
              desc="Orang tua melihat anaknya, pengasuh mencatat dengan cepat, admin menjaga semuanya berjalan."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <RoleCard
                title="Orang tua"
                desc="Ringkasan hari ini, mood, jadwal, foto kegiatan, pesan dengan pengasuh, kamera setelah disetujui, dan perkembangan anak per bulan."
                href="/register?role=parent"
                cta="Daftar sebagai orang tua"
              />
              <RoleCard
                title="Pengasuh"
                desc="Catat aktivitas, makan, tidur, mood, kehadiran, dan foto dalam beberapa ketukan; pindai piring; obat, kejadian, dan serah terima shift."
                href="/register?role=caregiver"
                cta="Daftar dengan kode undangan"
              />
              <RoleCard
                title="Admin daycare"
                desc="Dashboard perkembangan tiap anak, insight & rekomendasi, persetujuan akses kamera, kepuasan orang tua, perangkat, akun, dan pengaturan."
                href="#kontak"
                cta="Hubungi kami untuk fasilitas Anda"
              />
            </div>
          </div>
        </section>

        <section id="cara-ai" className="container-x scroll-mt-20 py-16 md:py-20">
          <SectionTitle
            kicker="Lapisan insight"
            title="Dari catatan menjadi rekomendasi, langkah demi langkah"
            desc="Kami menyebutnya AI karena sistem mengenali pola dan menyusun insight sendiri — tetapi setiap kesimpulan bisa ditelusuri ke catatan asalnya."
          />
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["Catatan pengasuh", "Aktivitas, porsi makan, durasi & kualitas tidur, mood, kehadiran. Semua bertanggal dan bernama pencatat."],
              ["Analisis pola", "Rata-rata mingguan, tren naik/turun, perbandingan dengan periode sebelumnya, dan hari yang menyimpang dari kebiasaan anak."],
              [
                "Insight & rekomendasi",
                "Kalimat sederhana dengan buktinya, profil sosial–motorik–kognitif–emosi, dan saran kegiatan yang bisa dilakukan di rumah maupun di daycare.",
              ],
            ].map(([t, d], i) => (
              <li key={t} className="panel p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-[15px] font-bold text-white">{i + 1}</div>
                <h3 className="mt-4 text-[17px]">{t}</h3>
                <p className="text-muted mt-2 text-[14.5px] leading-relaxed">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-xl border border-teal-200 bg-teal-100/60 p-5 text-[15px] leading-relaxed text-teal-900">
            <b>Bukan diagnosis.</b> Insight menggambarkan kebiasaan anak dari catatan harian, bukan penilaian medis atau psikologis. Untuk kekhawatiran tentang
            tumbuh kembang, dasbor menyarankan berbicara dengan pengasuh dan tenaga kesehatan.
          </div>
        </section>

        <section id="cara-kerja" className="band-wash border-line/70 scroll-mt-20 border-y">
          <div className="container-x py-16 md:py-20">
            <SectionTitle kicker="Cara mulai" title="Tiga langkah untuk daycare Anda" />
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                ["Daycare mendaftarkan anak", "Admin membuat kode anak untuk setiap keluarga dan kode undangan untuk pengasuh."],
                ["Orang tua menautkan kode", "Orang tua mendaftar gratis, memasukkan kode anak, dan langsung melihat catatan hari itu."],
                ["Pengasuh mencatat, orang tua melihat", "Setiap catatan sampai ke dasbor orang tua saat itu juga, dengan nama pencatatnya."],
              ].map(([t, d], i) => (
                <li key={t} className="panel p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-[15px] font-bold text-white">{i + 1}</div>
                  <h3 className="mt-4 text-[17px]">{t}</h3>
                  <p className="text-muted mt-2 text-[14.5px] leading-relaxed">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="privasi" className="container-x scroll-mt-20 py-16 md:py-20">
          <SectionTitle kicker="Privasi" title="Data anak adalah milik keluarga" />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="panel p-6">
              <h3 className="text-[17px]">Yang dapat dilihat orang tua</h3>
              <ul className="text-ink-2 mt-3 space-y-2 text-[14.5px] leading-relaxed">
                <li>Hanya anak yang tertaut dengan kode dari daycare.</li>
                <li>Kamera ruang anaknya setelah permintaan disetujui admin, selama anak hadir.</li>
                <li>Siapa saja yang membuka kamera anaknya, dan kapan.</li>
                <li>Foto kegiatan dan foto piring anaknya sendiri, disimpan terbatas.</li>
              </ul>
            </div>
            <div className="panel p-6">
              <h3 className="text-[17px]">Yang kami lakukan dengan data</h3>
              <ul className="text-ink-2 mt-3 space-y-2 text-[14.5px] leading-relaxed">
                <li>Kata sandi disimpan sebagai hash; sesi berakhir otomatis.</li>
                <li>Rekaman kamera dihapus setelah masa simpan yang diatur admin.</li>
                <li>Analisis perkembangan dihitung dari catatan anak itu sendiri, di server daycare.</li>
                <li>Tidak ada data yang dijual atau dipakai untuk iklan.</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="harga" className="band-wash border-line/70 scroll-mt-20 border-y">
          <div className="container-x py-16 text-center md:py-20">
            <SectionTitle kicker="Harga" title="Dibayar daycare per anak aktif" desc="Akun orang tua selalu gratis. Harga belum termasuk PPN." center />
            <div className="mt-8">
              <Pricing />
            </div>
          </div>
        </section>

        <section id="faq" className="container-x scroll-mt-20 py-16 md:py-20">
          <SectionTitle kicker="Tanya jawab" title="Yang sering ditanyakan orang tua" />
          <div className="mt-8">
            <FaqList items={faq} />
          </div>
          <p className="text-muted mt-4 text-[14px]">
            Pertanyaan lain ada di{" "}
            <Link href="/help" className="font-semibold text-teal-800 underline-offset-2 hover:underline">
              halaman bantuan
            </Link>
            .
          </p>
        </section>

        <section id="kontak" className="band-wash border-line/70 scroll-mt-20 border-t">
          <div className="container-x grid gap-10 py-16 md:py-20 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <SectionTitle
                kicker="Kontak"
                title="Bicara dengan tim kami"
                desc="Untuk uji coba di fasilitas Anda, atau pertanyaan tentang harga dan penerapan."
              />
              <dl className="kv mt-8">
                <dt>Telepon</dt>
                <dd>+62 22 2034 5510</dd>
                <dt>Email</dt>
                <dd>halo@smartdaycare.id</dd>
                <dt>Jam layanan</dt>
                <dd>Senin–Sabtu, 08.00–17.00 WIB</dd>
                <dt>Alamat</dt>
                <dd>Jl. Cihampelas No. 118, Bandung 40131</dd>
              </dl>
            </div>
            <div className="panel p-6">
              <ContactForm />
            </div>
          </div>
        </section>

        <section className="stage-bg text-white">
          <div className="container-x flex flex-col items-start gap-6 py-14 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[26px] text-white md:text-[30px]">Mulai dari satu ruang, satu kelompok anak.</h2>
              <p className="mt-2 max-w-lg text-white/80">Tim kami membantu penyiapan kamera, sensor udara, dan kode anak dalam satu kunjungan.</p>
            </div>
            <div className="flex gap-3">
              <Link href="/register">
                <Button size="lg" variant="light">
                  Buat akun
                </Button>
              </Link>
              <Link href="#kontak">
                <Button size="lg" variant="dark">
                  Hubungi kami
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function SectionTitle({ kicker, title, desc, center }: { kicker: string; title: string; desc?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl" : "max-w-2xl"}>
      <p className="text-[13px] font-semibold tracking-[0.1em] text-teal-700 uppercase">{kicker}</p>
      <h2 className="mt-2 text-[28px] leading-tight md:text-[34px]">{title}</h2>
      {desc ? <p className="text-muted mt-3 text-[16px] leading-relaxed">{desc}</p> : null}
    </div>
  );
}

function RoleCard({ title, desc, href, cta }: { title: string; desc: string; href: string; cta: string }) {
  return (
    <div className="panel flex flex-col p-6">
      <h3 className="text-[18px]">{title}</h3>
      <p className="text-muted mt-2 flex-1 text-[14.5px] leading-relaxed">{desc}</p>
      <Link href={href} className="mt-5 text-[14px] font-semibold text-teal-800 underline-offset-2 hover:underline">
        {cta} →
      </Link>
    </div>
  );
}
