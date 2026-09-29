import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { fetchPublic, fetchState } from "@/lib/api";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { FaqSearch, TicketForm } from "@/components/site/help-islands";
import { Kv } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Bantuan" };
export const dynamic = "force-dynamic";

const PRIVACY = [
  "Kami hanya menyimpan data yang diperlukan untuk catatan harian anak: kehadiran, suhu tubuh, catatan pengasuh, foto piring makan, dan pembacaan sensor ruang.",
  "Orang tua hanya dapat melihat anak yang tertaut dengan kode dari daycare. Wajah anak lain diburamkan pada tampilan kamera orang tua.",
  "Setiap pembukaan kamera tercatat (siapa, kamera mana, pukul berapa) dan dapat dilihat admin serta diminta oleh orang tua.",
  "Rekaman kamera dihapus otomatis setelah masa simpan yang ditetapkan admin (bawaan 7 hari). Foto piring dihapus setelah 3 hari.",
  "Kata sandi disimpan sebagai hash; sesi berakhir otomatis; akun terkunci sementara setelah beberapa percobaan masuk gagal.",
  "Data tidak dijual atau dipakai untuk iklan. Permintaan salinan atau penghapusan data diproses paling lambat 7 hari.",
];
const TERMS = [
  "Layanan ini membantu daycare mencatat dan menyampaikan kegiatan harian anak; bukan pengganti pengawasan langsung pengasuh.",
  "Angka gizi merupakan perkiraan dari foto piring dan tabel gizi per 100 g; bukan hasil penimbangan laboratorium.",
  "Status kualitas udara mengikuti ambang yang ditetapkan admin daycare dan pembacaan sensor di tiap ruang.",
  "Akun bersifat pribadi. Pemilik akun bertanggung jawab menjaga kata sandi dan tidak membagikan tautan atau tangkapan layar kamera.",
  "Daycare bertanggung jawab atas kebenaran data anak, kode anak, dan kode undangan staf yang diterbitkannya.",
  "Layanan dapat diperbarui sewaktu-waktu; perubahan penting diberitahukan lewat email pemilik akun.",
];

export default async function HelpPage() {
  const jar = await cookies();
  const state = jar.get("sd_session") ? await fetchState(jar.toString()).catch(() => null) : null;
  const pub = state ? null : await fetchPublic();
  const faq = state?.faq ?? pub?.faq ?? [];
  return (
    <>
      <SiteHeader loggedIn={!!state} />
      <main className="container-x grid gap-10 py-10 md:py-14 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-10">
          <section>
            <p className="text-[13px] font-semibold tracking-[0.1em] text-teal-700 uppercase">Bantuan</p>
            <h1 className="mt-2 text-[30px]">Ada yang bisa kami bantu?</h1>
            <p className="text-muted mt-2 max-w-2xl">Cari di pertanyaan yang sering diajukan, atau kirim pertanyaan Anda — dibalas dalam 1 hari kerja.</p>
            <div className="mt-6">
              <FaqSearch items={faq} />
            </div>
          </section>
          <section id="tanya" className="border-line bg-surface scroll-mt-24 rounded-xl border p-6">
            <h2 className="text-[20px]">Kirim pertanyaan</h2>
            <div className="mt-4">
              <TicketForm me={state?.me ?? null} tickets={state?.tickets ?? []} />
            </div>
          </section>
          <section id="privasi" className="scroll-mt-24">
            <h2 className="text-[22px]">Kebijakan privasi</h2>
            <ol className="text-ink-2 mt-4 grid gap-3 text-[15px] leading-relaxed">
              {PRIVACY.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[12px] font-bold text-teal-800">
                    {i + 1}
                  </span>
                  {p}
                </li>
              ))}
            </ol>
          </section>
          <section id="syarat" className="scroll-mt-24">
            <h2 className="text-[22px]">Syarat layanan</h2>
            <ol className="text-ink-2 mt-4 grid gap-3 text-[15px] leading-relaxed">
              {TERMS.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="bg-wash-2 text-ink-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold">
                    {i + 1}
                  </span>
                  {p}
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="grid content-start gap-4">
          <div className="panel p-5">
            <h3 className="text-[15px]">Kontak</h3>
            <Kv
              className="mt-3"
              rows={[
                ["Email", "bantuan@smartdaycare.id"],
                ["Telepon", "+62 22 2034 5510"],
                ["Jam layanan", "Senin–Sabtu, 08.00–17.00 WIB"],
              ]}
            />
          </div>
          <div className="panel p-5 text-[14px]">
            <h3 className="text-[15px]">Pintasan</h3>
            <ul className="mt-3 grid gap-2">
              <li>
                <Link href="#privasi" className="text-teal-800 hover:underline">
                  Kebijakan privasi
                </Link>
              </li>
              <li>
                <Link href="#syarat" className="text-teal-800 hover:underline">
                  Syarat layanan
                </Link>
              </li>
              <li>
                <Link href={state ? "/account" : "/login"} className="text-teal-800 hover:underline">
                  {state ? "Akun & privasi" : "Masuk ke akun"}
                </Link>
              </li>
              <li>
                <Link href="/#harga" className="text-teal-800 hover:underline">
                  Harga
                </Link>
              </li>
            </ul>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
