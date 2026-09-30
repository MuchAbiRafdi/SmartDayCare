import Link from "next/link";
import { cookies } from "next/headers";
import {
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  FileCheck2,
  HeartHandshake,
  MessageSquare,
  ShieldCheck,
  Users2,
  Video,
} from "lucide-react";
import { fetchPublic } from "@/lib/api";
import { HeroCta, SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { AppWindow, ContactForm, FaqList, InteractiveAiDemo, PartnershipPrograms } from "@/components/site/landing-islands";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const FIVE_SERVICES = [
  {
    n: 1,
    icon: <Video size={22} />,
    title: "Pengawasan Keselamatan Pintar",
    sub: "Deteksi Bahaya & Peringatan Otomatis",
    desc: "Kamera cerdas yang aktif memantau area bermain anak. Sistem langsung memberi notifikasi cepat ke pengasuh bila anak terjatuh atau mendekati area tangga dan dapur, sehingga risiko cedera dapat dicegah seketika.",
    bullets: [
      "Deteksi otomatis saat anak terpeleset atau terjatuh",
      "Peringatan pembatas aman di area dapur dan tangga",
      "Pemberitahuan darurat instan ke ponsel pengasuh",
      "Wajah anak terlindungi dengan privasi penyamaran otomatis",
    ],
    tone: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    n: 2,
    icon: <BarChart3 size={22} />,
    title: "Pemantauan Tumbuh Kembang",
    sub: "Terstandar Kementerian Kesehatan RI",
    desc: "Pencatatan perkembangan berkala yang mudah dilakukan pengasuh mengacu pada panduan resmi Kemenkes RI untuk mendeteksi potensi keterlambatan sejak dini pada masa emas usia anak.",
    bullets: [
      "Mengikuti instrumen baku tumbuh kembang resmi (KPSP)",
      "Pantauan 4 pilar: motorik kasar, halus, bicara, dan sosial",
      "Grafik perkembangan anak yang jelas dan bertahap",
      "Saran stimulasi bermain yang tepat untuk pengasuh dan orang tua",
    ],
    tone: "bg-teal-50 text-teal-800 border-teal-200",
  },
  {
    n: 3,
    icon: <Activity size={22} />,
    title: "Kesehatan & Kenyamanan Ruangan",
    sub: "Pemeriksaan Suhu & Kualitas Udara Bersih",
    desc: "Sensor suhu tubuh non-kontak dan pemantau udara ruangan memastikan anak tidur dan bermain di lingkungan yang sejuk, bersih, dan mendeteksi kondisi demam lebih awal.",
    bullets: [
      "Pemantau suhu, kelembapan, dan kesegaran udara kamar",
      "Termometer inframerah ramah anak tanpa rasa takut",
      "Pencatatan durasi dan ketenangan tidur siang",
      "Pemberitahuan dini jika suhu tubuh anak mulai meningkat",
    ],
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  {
    n: 4,
    icon: <MessageSquare size={22} />,
    title: "Laporan Harian & Penanganan Cepat",
    sub: "Komunikasi Hangat & Catatan Transparan",
    desc: "Rangkuman aktivitas makan, tidur, dan belajar tersusun otomatis menjadi laporan harian yang rapi untuk orang tua. Jika terjadi insiden kecil saat bermain, pengasuh mencatat penanganan dengan jelas.",
    bullets: [
      "Laporan harian otomatis tersusun rapi setiap sore",
      "Catatan menu makan, porsi habis, dan jam tidur",
      "Pencatatan tindakan pertolongan pertama secara transparan",
      "Pemberitahuan penting cepat bila anak membutuhkan perhatian khusus",
    ],
    tone: "bg-violet-50 text-violet-700 border-violet-200",
  },
  {
    n: 5,
    icon: <HeartHandshake size={22} />,
    title: "Indeks Mutu & Kepuasan Layanan",
    sub: "Evaluasi Objektif Kepercayaan Orang Tua",
    desc: "Membantu pengelola daycare memahami masukan orang tua mengenai kebersihan, keamanan, menu makanan, dan keramahan staf, sehingga mutu layanan terus meningkat dan dipercaya keluarga.",
    bullets: [
      "Evaluasi berkala kepuasan orang tua terhadap fasilitas",
      "Pemetaan kualitas pada kebersihan, makanan, dan pengasuh",
      "Dasbor peningkatan mutu layanan bagi pimpinan daycare",
      "Pemberitahuan cepat untuk merespons saran atau kendala orang tua",
    ],
    tone: "bg-amber-50 text-amber-800 border-amber-200",
  },
];

export default async function LandingPage() {
  const jar = await cookies();
  const loggedIn = Boolean(jar.get("sd_session")?.value);
  const pub = await fetchPublic();

  return (
    <>
      <SiteHeader loggedIn={loggedIn} />
      <main>
        {/* Hero Section untuk Mitra Daycare */}
        <section className="hero-bg border-line relative overflow-hidden border-b">
          <div className="container-x relative grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-300 bg-teal-100/70 px-3.5 py-1 text-[12.5px] font-semibold text-teal-900 shadow-sm">
                <Building2 size={14} className="text-teal-700" /> Solusi Terpadu Fasilitas Mitra Daycare
              </div>
              <h1 className="mt-5 text-[38px] leading-[1.08] font-bold tracking-[-0.025em] md:text-[54px] text-ink">
                SmartDayCare <span className="grad-text">Partner</span>
              </h1>
              <p className="text-ink-2 mt-3 text-[19px] font-semibold md:text-[22px]">
                Platform Cerdas Pengawasan Anak, Pemantauan Tumbuh Kembang, & Kepercayaan Orang Tua
              </p>
              <p className="text-muted mt-4 max-w-xl text-[15.5px] leading-relaxed">
                Tingkatkan mutu dan reputasi fasilitas daycare Anda dengan teknologi terpadu: kamera keselamatan otomatis, pencatatan tumbuh kembang terstandar Kemenkes RI, pemantau kesehatan anak, dan komunikasi laporan harian yang transparan bagi keluarga.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <HeroCta loggedIn={loggedIn} />
                <Link href="#layanan">
                  <Button size="lg" variant="default" className="border border-line bg-white text-ink hover:bg-wash">
                    Lihat Layanan Utama
                  </Button>
                </Link>
                <Link href="#kemitraan">
                  <Button size="lg" variant="primary" className="bg-teal-700 hover:bg-teal-800 text-white font-semibold">
                    Program Kemitraan
                  </Button>
                </Link>
              </div>

              {/* Badges Kepercayaan & Regulasi */}
              <div className="mt-8 flex flex-wrap items-center gap-4 pt-4 border-t border-line/60 text-[12.5px] text-muted">
                <span className="flex items-center gap-1.5 font-medium text-ink-2">
                  <ShieldCheck size={16} className="text-teal-700" /> Perlindungan Privasi Data Anak Terjamin
                </span>
                <span className="flex items-center gap-1.5 font-medium text-ink-2">
                  <FileCheck2 size={16} className="text-teal-700" /> Pedoman Baku Tumbuh Kembang Kemenkes RI
                </span>
                <span className="flex items-center gap-1.5 font-medium text-ink-2">
                  <Users2 size={16} className="text-teal-700" /> Teruji & Siap Diterapkan di Daycare Anda
                </span>
              </div>
            </div>

            {/* Widget Tampilan Fasilitas Real-time */}
            <AppWindow initial={pub} />
          </div>
        </section>

        {/* 4 Nilai Utama bagi Daycare */}
        <section className="border-line bg-surface border-b">
          <div className="container-x text-ink-2 grid gap-6 py-7 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Keamanan Anak Maksimal", "Kamera pintar yang sigap mendeteksi insiden dan area berbahaya secara langsung."],
              ["Kerja Pengasuh Lebih Efisien", "Pencatatan kehadiran, makanan, dan tidur anak selesai dalam beberapa ketukan."],
              ["Tumbuh Kembang Terpantau Jelas", "Orang tua dan pengasuh mengetahui kemajuan motorik dan bahasa anak setiap bulan."],
              ["Kepercayaan Keluarga Meningkat", "Laporan harian yang rapi dan komunikasi yang transparan membangun loyalitas orang tua."],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-3.5">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-700" aria-hidden />
                <div>
                  <div className="text-ink font-semibold">{t}</div>
                  <div className="text-muted text-[13px] leading-relaxed mt-0.5">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 1: Layanan Unggulan Fasilitas */}
        <section id="layanan" className="container-x scroll-mt-20 py-16 md:py-20">
          <SectionTitle
            kicker="Layanan Unggulan"
            title="Solusi Lengkap untuk Meningkatkan Standar Fasilitas Daycare"
            desc="Dirancang untuk memudahkan pekerjaan pengasuh, menenangkan hati orang tua, dan memberikan keunggulan kompetitif bagi daycare Anda."
          />

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FIVE_SERVICES.map((t) => (
              <article key={t.n} className="panel flex flex-col p-6 transition duration-200 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <span className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border " + t.tone}>
                    {t.icon}
                  </span>
                  <div>
                    <div className="text-muted text-[11px] font-bold tracking-[0.08em] uppercase">
                      Layanan {t.n}
                    </div>
                    <h3 className="text-[17px] font-bold text-ink leading-tight">{t.title}</h3>
                  </div>
                </div>
                <p className="text-teal-800 mt-2 text-[12.5px] font-semibold">{t.sub}</p>
                <p className="text-muted mt-3 text-[14px] leading-relaxed flex-1">{t.desc}</p>
                <ul className="text-ink-2 mt-4 space-y-2 border-t border-line/60 pt-3 text-[13px]">
                  {t.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}

            {/* Banner Keamanan & Privasi */}
            <article className="flex flex-col justify-between rounded-2xl bg-[linear-gradient(145deg,#0d4b4a,#176664)] p-6 text-white shadow-md">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold text-teal-100">
                  <ShieldCheck size={14} /> Jaminan Privasi Keluarga
                </div>
                <h3 className="mt-4 text-[20px] font-bold text-white">Privasi Data Anak Terjaga Sepenuhnya</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/85">
                  Seluruh data rekaman kamera diproses secara aman di fasilitas daycare Anda dengan teknologi penyamaran wajah otomatis bagi pihak ketiga. Akses kamera dibatasi ketat hanya untuk orang tua resmi dan staf yang berwenang.
                </p>
              </div>
              <div className="mt-6 border-t border-white/20 pt-4 text-[13px] text-teal-200">
                Memberikan ketenangan hati bagi orang tua dan menjaga reputasi daycare Anda.
              </div>
            </article>
          </div>

          {/* Pratinjau Interaktif Layanan Cerdas */}
          <div className="mt-12">
            <InteractiveAiDemo />
          </div>
        </section>

        {/* SECTION 2: Program Kemitraan Fasilitas Mitra Daycare */}
        <section id="kemitraan" className="band-wash border-line/70 scroll-mt-20 border-y py-16 md:py-20">
          <div className="container-x">
            <SectionTitle
              kicker="Kerja Sama Fasilitas"
              title="Pilihan Program Kemitraan untuk Daycare Anda"
              desc="Kami mendampingi daycare Anda mulai dari penyesuaian fasilitas, pemasangan sistem, hingga pelatihan pengasuh agar layanan dapat langsung beroperasi optimal."
              center
            />
            <div className="mt-10">
              <PartnershipPrograms />
            </div>
          </div>
        </section>

        {/* SECTION 3: Langkah Penerapan di Fasilitas Daycare */}
        <section id="alur-penerapan" className="container-x scroll-mt-20 py-16 md:py-20">
          <SectionTitle
            kicker="Penerapan Mudah"
            title="Langkah Praktis Bermitra dengan SmartDayCare"
            desc="Proses terstruktur yang cepat dan ramah, tanpa mengganggu rutinitas pengasuhan anak yang sedang berjalan."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-4">
            {[
              {
                step: "01",
                badge: "Tahap Awal",
                title: "Konsultasi & Asesmen Fasilitas",
                desc: "Diskusi kebutuhan ruang daycare Anda, penyesuaian jumlah kamera, dan pendataan kelompok usia anak.",
              },
              {
                step: "02",
                badge: "Pemasangan",
                title: "Penyiapan Perangkat & Sistem",
                desc: "Pemasangan kamera keselamatan, sensor kenyamanan kamar, dan pembuatan akun daycare dalam waktu singkat.",
              },
              {
                step: "03",
                badge: "Pelatihan",
                title: "Bimbingan Praktis Staf Pengasuh",
                desc: "Pelatihan mudah bagi pengasuh untuk mencatat aktivitas harian, pemantauan tumbuh kembang, dan penanganan anak.",
              },
              {
                step: "04",
                badge: "Operasional",
                title: "Layanan Berjalan & Pendampingan",
                desc: "Sistem aktif melayani orang tua setiap hari dengan dukungan teknis dan pembaruan sistem yang berkelanjutan.",
              },
            ].map((st) => (
              <div key={st.step} className="panel flex flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className="text-[28px] font-extrabold text-teal-700/60 font-mono">{st.step}</span>
                  <span className="rounded-full bg-wash px-2.5 py-0.5 text-[11px] font-bold text-ink-2 border border-line">
                    {st.badge}
                  </span>
                </div>
                <h4 className="mt-4 text-[17px] font-bold text-ink">{st.title}</h4>
                <p className="text-muted mt-2 text-[13.5px] leading-relaxed flex-1">{st.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4: Keamanan & Privasi Data Keluarga */}
        <section id="privasi" className="band-wash border-line/70 scroll-mt-20 border-y py-16 md:py-20">
          <div className="container-x">
            <SectionTitle
              kicker="Perlindungan Data"
              title="Komitmen Penuh terhadap Keamanan Data & Privasi Anak"
              desc="Setiap informasi tumbuh kembang, catatan harian, dan rekaman visual dilindungi dengan standar keamanan tertinggi."
            />

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <div className="panel p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-800 mb-4 font-bold">
                  1
                </div>
                <h4 className="text-[17px] font-bold text-ink">Pemrosesan Aman & Penyamaran Wajah</h4>
                <p className="text-muted mt-2 text-[14px] leading-relaxed">
                  Tayangan kamera diawasi dengan perlindungan penyamaran otomatis bagi pihak ketiga untuk menjaga kenyamanan seluruh anak di daycare.
                </p>
              </div>

              <div className="panel p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-800 mb-4 font-bold">
                  2
                </div>
                <h4 className="text-[17px] font-bold text-ink">Akses Khusus Orang Tua & Pengasuh</h4>
                <p className="text-muted mt-2 text-[14px] leading-relaxed">
                  Orang tua hanya dapat melihat catatan anak mereka sendiri melalui kode unik resmi, dengan rekaman riwayat akses yang transparan.
                </p>
              </div>

              <div className="panel p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-800 mb-4 font-bold">
                  3
                </div>
                <h4 className="text-[17px] font-bold text-ink">Penyimpanan Terjadwal & Tanpa Iklan</h4>
                <p className="text-muted mt-2 text-[14px] leading-relaxed">
                  Rekaman kamera dihapus otomatis sesuai jangka waktu yang ditentukan. Data tidak pernah diperjualbelikan atau digunakan untuk periklanan.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: Tanya Jawab Fasilitas Mitra */}
        <section id="faq" className="container-x scroll-mt-20 py-16 md:py-20">
          <SectionTitle kicker="Tanya Jawab" title="Pertanyaan yang Sering Diajukan Pengelola Daycare" />
          <div className="mt-8">
            <FaqList
              items={[
                {
                  q: "Apakah daycare kami perlu mengganti kamera pengawas yang sudah ada?",
                  a: "Tidak perlu. Sistem kami dapat dihubungkan langsung dengan kamera CCTV standar yang sudah terpasang di ruangan daycare Anda melalui perangkat penghubung yang kami sediakan.",
                },
                {
                  q: "Apakah pengasuh daycare akan kesulitan menggunakan aplikasi ini?",
                  a: "Sama sekali tidak. Tampilan aplikasi dirancang sangat sederhana dan cepat. Pengasuh dapat mencatat makan, tidur, dan aktivitas anak hanya dalam beberapa kali ketukan di ponsel.",
                },
                {
                  q: "Bagaimana cara orang tua melihat laporan perkembangan anaknya?",
                  a: "Orang tua cukup masuk ke aplikasi melalui ponsel. Setiap sore, rangkuman aktivitas, foto kegiatan, dan laporan harian anak akan otomatis tampil dengan bahasa yang hangat dan mudah dipahami.",
                },
                {
                  q: "Bagaimana cara daycare kami mulai bermitra?",
                  a: "Anda cukup mengisi formulir di bawah ini atau menghubungi tim kemitraan kami. Kami akan menjadwalkan konsultasi dan peninjauan fasilitas untuk memberikan solusi terbaik bagi daycare Anda.",
                },
              ]}
            />
          </div>
        </section>

        {/* SECTION 6: Form Konsultasi & Pengajuan Kemitraan Daycare */}
        <section id="kontak" className="band-wash border-line/70 scroll-mt-20 border-t py-16 md:py-20">
          <div className="container-x grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <SectionTitle
                kicker="Hubungi Kami"
                title="Konsultasikan Kebutuhan Daycare Anda"
                desc="Diskusikan rencana penerapan sistem cerdas ini untuk daycare, PAUD, atau yayasan penitipan anak Anda bersama tim kemitraan kami."
              />
              <dl className="kv mt-8 text-[14px]">
                <dt className="font-semibold text-ink">Wilayah Layanan</dt>
                <dd className="text-muted">Tersedia untuk seluruh kota di Indonesia</dd>
                <dt className="font-semibold text-ink">Email Kemitraan</dt>
                <dd className="text-muted">mitra@smartdaycare.id</dd>
                <dt className="font-semibold text-ink">Layanan Konsultasi</dt>
                <dd className="text-muted">+62 812-3456-7890 (WhatsApp Kemitraan)</dd>
                <dt className="font-semibold text-ink">Jam Layanan</dt>
                <dd className="text-muted">Senin–Jumat, 08.00–17.00 WIB</dd>
              </dl>
              <div className="mt-8 rounded-xl border border-teal-200 bg-teal-50 p-4 text-[13px] text-teal-900">
                💡 <b>Kemitraan Fasilitas:</b> Formulir ini ditujukan bagi pemilik daycare, kepala sekolah PAUD, dan pengelola yayasan anak.
              </div>
            </div>

            <div className="panel p-6 shadow-sm">
              <h3 className="text-[18px] font-bold text-ink mb-4">Formulir Kemitraan Daycare</h3>
              <ContactForm />
            </div>
          </div>
        </section>

        {/* CTA Bawah */}
        <section className="stage-bg text-white">
          <div className="container-x flex flex-col items-start gap-6 py-14 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[26px] text-white font-bold md:text-[32px]">
                Wujudkan Standar Penitipan Anak Terbaik Bersama Kami.
              </h2>
              <p className="mt-2 max-w-xl text-white/80 text-[15px]">
                Tingkatkan keselamatan anak, pantau tumbuh kembang secara terukur, dan hadirkan ketenangan hati bagi orang tua.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="#kontak">
                <Button size="lg" variant="light" className="font-semibold">
                  Konsultasi Kemitraan Sekarang
                </Button>
              </Link>
              <Link href="/register">
                <Button size="lg" variant="dark" className="border border-white/20 font-semibold">
                  Masuk Portal Fasilitas
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
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
      <p className="text-[12.5px] font-bold tracking-[0.1em] text-teal-700 uppercase">{kicker}</p>
      <h2 className="mt-2 text-[28px] font-bold leading-tight md:text-[36px] text-ink">{title}</h2>
      {desc ? <p className="text-muted mt-3 text-[15.5px] leading-relaxed">{desc}</p> : null}
    </div>
  );
}
