from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt


SOURCE = Path(r"C:\Users\ACER\Downloads\Template Hackathon USM 2026.docx")
OUTPUT = Path(r"D:\Smartdaycare\_docx_work\SmartDayCare_Usulan_Hackathon_USM_2026_updated.docx")


def set_cell_shading(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = tcPr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tcPr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=100, bottom=80, end=100):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = tcPr.first_child_found_in("w:tcMar")
    if tcMar is None:
        tcMar = OxmlElement("w:tcMar")
        tcPr.append(tcMar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tcMar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tcMar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def clear_cell(cell):
    tc = cell._tc
    for child in list(tc):
        if child.tag != qn("w:tcPr"):
            tc.remove(child)
    p = OxmlElement("w:p")
    tc.append(p)


def style_run(run, size=9.2, bold=False, italic=False):
    run.font.name = "Arial"
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Arial")
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Arial")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic


def add_para(cell, text="", bold=False, italic=False, align=None, before=0, after=2, size=9.2):
    p = cell.paragraphs[-1] if len(cell.paragraphs) == 1 and not cell.paragraphs[-1].text else cell.add_paragraph()
    p.alignment = align
    fmt = p.paragraph_format
    fmt.space_before = Pt(before)
    fmt.space_after = Pt(after)
    fmt.line_spacing = 1.0
    r = p.add_run(text)
    style_run(r, size=size, bold=bold, italic=italic)
    return p


def fill_section(cell, heading, body, size=9.2):
    clear_cell(cell)
    set_cell_margins(cell, top=90, start=120, bottom=90, end=120)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
    add_para(cell, heading, bold=True, size=10.2, after=1)
    if isinstance(body, list):
        for item in body:
            if isinstance(item, tuple):
                lead, rest = item
                p = add_para(cell, after=2, size=size)
                r = p.runs[0]
                r.clear()
                style_run(r, size=size, bold=True)
                r.add_text(lead)
                r2 = p.add_run(rest)
                style_run(r2, size=size)
            else:
                add_para(cell, item, size=size)
    else:
        add_para(cell, body, size=size)


def heading_only(cell, heading):
    clear_cell(cell)
    set_cell_margins(cell, top=90, start=120, bottom=90, end=120)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
    add_para(cell, heading, bold=True, size=10.2, after=1)


def add_schedule(cell):
    clear_cell(cell)
    set_cell_margins(cell, top=90, start=120, bottom=90, end=120)
    add_para(cell, "Rencana penelitian satu semester selama enam bulan, Oktober 2026–Maret 2027.", size=9.2, after=4)
    table = cell.add_table(rows=1, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    headers = ["Tahap", "Waktu", "Kegiatan utama", "Target terukur"]
    for i, h in enumerate(headers):
        c = table.rows[0].cells[i]
        c.text = h
        set_cell_shading(c, "1F4E79")
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for p in c.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                style_run(r, size=8.2, bold=True)
                r.font.color.rgb = None
                r.font.color.theme_color = 0
    rows = [
        ("1", "Okt 2026", "Kajian literatur, kebutuhan pengguna, regulasi, dan pemetaan proses daycare.", "Spesifikasi kebutuhan, indikator keberhasilan, dan TKT awal."),
        ("2", "Nov 2026", "Desain arsitektur, data, privasi, perangkat, dan pembuktian prinsip lima modul.", "Desain sistem, bukti konsep, dan rencana pengujian TKT 1–2."),
        ("3", "Des 2026", "Implementasi frontend, backend, database, autentikasi peran, dan alur pencatatan inti.", "Prototipe perangkat lunak dan uji API awal."),
        ("4", "Jan 2027", "Integrasi lima modul AI/IoT, dashboard tiga peran, pemindai piring, dan sinkronisasi SSE.", "Prototipe terintegrasi; benchmark AI, keamanan dasar, dan E2E teruji."),
        ("5", "Feb 2027", "Uji penerimaan internal, konfigurasi perangkat, simulasi lingkungan relevan, dan pelatihan pengguna.", "Laporan uji, SOP, daftar risiko, dan perbaikan prioritas."),
        ("6", "Mar 2027", "Demonstrasi terbatas bersama calon mitra serta evaluasi keselamatan, kelengkapan catatan, dan penerimaan.", "Laporan validasi awal TKT 5–6 dan rencana hilirisasi."),
    ]
    for row in rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = value
            cells[i].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
            if i % 2 == 0:
                set_cell_shading(cells[i], "F3F6FA")
            for p in cells[i].paragraphs:
                p.paragraph_format.space_after = Pt(1)
                p.paragraph_format.line_spacing = 1.0
                for r in p.runs:
                    style_run(r, size=8.1, bold=(i == 0))
    for row in table.rows:
        for c in row.cells:
            set_cell_margins(c, top=70, start=70, bottom=70, end=70)


doc = Document(SOURCE)
tbl = doc.tables[0]

heading_only(tbl.cell(0, 0), "A. JUDUL")
fill_section(tbl.cell(1, 0), "", "SmartDayCare AI Intelligent Platform for Child Development and Wellbeing", size=10.4)
heading_only(tbl.cell(2, 0), "B. RINGKASAN")
fill_section(tbl.cell(3, 0), "", "SmartDayCare AI adalah platform digital terpadu untuk daycare, PAUD, dan yayasan penitipan anak. Urgensinya adalah menyatukan keselamatan anak, pencatatan harian, pemantauan kesejahteraan, informasi tumbuh kembang, serta komunikasi keluarga yang selama ini tersebar di catatan manual, grup percakapan, dan perangkat terpisah. Tujuan pengembangan adalah menghasilkan sistem yang dapat dipakai orang tua, pengasuh, dan admin melalui alur kerja yang sederhana, dapat dilacak, dan menjaga privasi anak. Produk mengintegrasikan lima pilar: OmniWatch untuk analisis multi-CCTV, Child Development Intelligence berbasis KPSP, SmartDayCare IoT & Wellbeing, Smart Communication untuk laporan dan eskalasi insiden, serta TrustMeter untuk analitik umpan balik orang tua. Metode pengembangan menggunakan frontend Next.js, backend FastAPI, basis data terstruktur, server-sent events untuk pembaruan lintas peran, serta mesin AI yang dapat dijelaskan. Luaran yang ditargetkan ialah aplikasi web berjalan, lima modul AI teruji, pemindai piring berbasis perangkat pengasuh, dashboard tiga peran, dokumentasi perangkat dan SOP, serta rancangan pilot bersama daycare mitra. Penelitian dimulai dari TKT 1 melalui kajian dan pembuktian prinsip, berkembang ke TKT 2–4 melalui prototipe dan integrasi, lalu diarahkan ke demonstrasi TKT 5–6 dalam lingkungan relevan selama satu semester.", size=9.0)
heading_only(tbl.cell(4, 0), "C. KATA KUNCI")
fill_section(tbl.cell(5, 0), "", "SmartDayCare AI; keselamatan anak; tumbuh kembang KPSP; Internet of Things; kemitraan daycare", size=10.0)
heading_only(tbl.cell(6, 0), "D. PENDAHULUAN")
fill_section(tbl.cell(7, 0), "", "Daycare membutuhkan cara yang konsisten untuk memastikan anak aman, tercatat aktivitasnya, terpantau kesejahteraannya, dan mendapatkan komunikasi yang jelas dengan keluarga. Pada praktiknya, pengawasan kamera belum otomatis mendeteksi kejadian penting; catatan makan, tidur, mood, obat, dan kehadiran mudah terfragmentasi; hasil pengamatan perkembangan belum selalu disajikan dalam bentuk yang mudah dipahami; sedangkan komunikasi insiden dan laporan harian bergantung pada waktu pengasuh. Kesenjangan ini berisiko menunda respons, menyulitkan evaluasi layanan, dan menurunkan kepercayaan orang tua.\n\nSmartDayCare AI menawarkan kebaruan pada integrasi lima fungsi dalam satu sumber data. OmniWatch memadukan pelacakan multi-kamera, deteksi anak jatuh, virtual geofencing untuk dapur/tangga/pintu keluar, dan indikasi ruang tanpa pengawasan. Modul perkembangan menggunakan butir KPSP pada beberapa kelompok usia, empat dimensi perkembangan, deteksi red flag, dan rekomendasi stimulasi. Modul IoT membaca suhu tubuh non-kontak, kenyamanan udara CO2, dan kondisi tidur. Modul komunikasi menyusun laporan harian berbasis catatan nyata serta mengklasifikasikan tingkat eskalasi insiden. TrustMeter mengolah aspek umpan balik orang tua menjadi Parent Trust Index. Pemindai piring memperkirakan menu, porsi, dan gizi dari foto; hasilnya tetap dapat diperiksa dan dikoreksi pengasuh.\n\nInovasi utama bukan sekadar penambahan fitur, melainkan penyatuan alur kerja lintas peran: catatan pengasuh menjadi dasar laporan orang tua dan analitik admin; pembaruan dikirim tanpa muat ulang; setiap angka memiliki sumber; dan akses kamera mengikuti persetujuan serta audit trail. Privasi diterapkan melalui pemrosesan lokal/edge bila memungkinkan, penyamaran wajah untuk pihak yang tidak berwenang, pembatasan akses, retensi data, dan kepatuhan terhadap UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi [1]. Kebutuhan mitra adalah solusi yang dapat dipasang bertahap pada fasilitas yang sudah memiliki CCTV, mudah dipakai pengasuh, dan memberikan bukti operasional yang dapat ditinjau bersama. Karena itu, tahap berikutnya memerlukan pilot bersama mitra daycare/PAUD/yayasan untuk menguji kecocokan perangkat, SOP, kualitas data, beban kerja, dan penerimaan keluarga.", size=8.9)
heading_only(tbl.cell(8, 0), "E. PETA JALAN PENGEMBANGAN PRODUK")
fill_section(tbl.cell(9, 0), "", "Bulan 1–2 | TKT 1–2 — Kajian kebutuhan pengguna, studi literatur dan regulasi, perumusan indikator, desain arsitektur, pemetaan data, serta pembuktian prinsip deteksi keselamatan, KPSP, IoT wellbeing, komunikasi-insiden, dan TrustMeter. Output: spesifikasi kebutuhan, desain sistem, dan bukti konsep.\n\n→ Bulan 3–4 | TKT 3–4 — Pembuatan prototipe terintegrasi Next.js–FastAPI, database, autentikasi peran, dashboard orang tua–pengasuh–admin, pemindai piring, pengamanan akses, benchmark AI, uji API, dan uji E2E. Output: prototipe tervalidasi di laboratorium dan dokumentasi teknis.\n\n→ Bulan 5–6 | TKT 5–6 — Demonstrasi terbatas di lingkungan relevan bersama calon mitra daycare/PAUD/yayasan, konfigurasi kamera/sensor, pelatihan pengguna, pengukuran keselamatan, kelengkapan catatan, kualitas laporan, dan penerimaan pengguna. Output: laporan validasi awal, SOP, daftar kesenjangan, serta rencana hilirisasi.", size=9.0)
heading_only(tbl.cell(10, 0), "E. METODE")
fill_section(tbl.cell(11, 0), "", "Pengembangan memakai Work Package (WP) berikut. WP1 Analisis kebutuhan dan co-design: tim memetakan alur pengasuh, orang tua, admin, kebutuhan ruang, perangkat, persetujuan, dan indikator layanan bersama mitra. Capaian: daftar kebutuhan tervalidasi dan baseline proses. WP2 Rekayasa platform: membangun antarmuka responsif Next.js, API FastAPI, model data anak/aktivitas/perangkat, autentikasi berbasis peran, SSE, audit log, backup, dan pengujian API. Capaian: seluruh alur utama tiga peran lulus uji dan tidak ada konflik sumber angka. WP3 Integrasi AI: menguji OmniWatch, KPSP, IoT wellbeing, komunikasi-insiden, dan TrustMeter dengan keluaran yang dapat dijelaskan, ambang keyakinan, dan kalimat batasan. Capaian: lima benchmark tersedia dan hasil dapat diulang. WP4 Pemindai piring: segmentasi foto, model food-patch, ambang per kelas dari data uji, estimasi porsi/gizi, dan jalur koreksi pengasuh. Capaian: hasil uji per foto tersimpan; sistem tidak mengklaim kepastian saat kualitas foto rendah. WP5 Validasi lapangan: pemasangan perangkat, pelatihan, observasi penggunaan, pengukuran respons insiden, kelengkapan catatan, waktu kerja, dan kepuasan. Capaian: laporan pilot dan daftar perbaikan prioritas. WP6 Privasi, keamanan, dan hilirisasi: face blurring, pembatasan kamera, retensi, penghapusan, audit akses, SOP insiden, dan paket implementasi.\n\nMitigasi risiko: kamera/sensor terputus ditampilkan sebagai status terhenti, bukan dianggap online; data kurang menghasilkan keterangan data tidak cukup; model pangan lemah pada sup, telur, dan makanan pucat memerlukan foto daycare nyata serta koreksi pengasuh; akses kamera tanpa persetujuan ditolak dan dicatat; dan perubahan regulasi ditinjau bersama pengelola mitra. Tanggung jawab tim meliputi pengembangan perangkat lunak, AI, pengujian, keamanan, dokumentasi, dan pelatihan. Mitra menyediakan akses lokasi dan pengguna uji, inventaris CCTV/sensor, waktu observasi, masukan SOP, serta dukungan natura berupa ruang pilot, listrik, jaringan, dan pendamping operasional yang dikonversi berdasarkan harga sewa/perangkat/jam kerja setempat pada saat penyusunan RAB. RAB tahunan ditautkan ke WP melalui kebutuhan server, sensor, kamera, pengujian, pelatihan, dan pendampingan.", size=8.7)
heading_only(tbl.cell(12, 0), "F. RENCANA OPERASIONAL PENGEMBANGAN PRODUK")
fill_section(tbl.cell(13, 0), "", "Produk akhir berupa layanan web SmartDayCare AI dengan tiga peran pengguna. Orang tua memperoleh ringkasan aktivitas, makan, tidur, mood, kehadiran, kesehatan, perkembangan, laporan, pesan, umpan balik, dan kamera sesuai persetujuan. Pengasuh mencatat aktivitas, makan, tidur, mood, kehadiran/foto, obat, kejadian, serah terima, kondisi kamera, dan udara; pemindai piring berjalan pada perangkat pengasuh. Admin mengelola anak, akun, kode akses, perangkat, izin kamera, laporan, rekomendasi, analitik, kepercayaan orang tua, dan riwayat akses.\n\nSkema produksi dan layanan: kode sumber dikembangkan dan diuji per modul; backend dijalankan dengan FastAPI dan database; frontend dikemas dengan Next.js; deployment menyediakan Caddy dan MediaMTX bila dibutuhkan; model AI disimpan dengan metadata versi dan hasil evaluasi. Operasional dimulai dari survei fasilitas, konfigurasi ruang/zona, pendaftaran perangkat, pembuatan akun, pelatihan, uji penerimaan, lalu aktivasi bertahap. Lokasi awal yang direncanakan adalah fasilitas daycare/PAUD/yayasan mitra di Semarang dan kota lain yang siap menjadi lokasi pilot. Infrastruktur minimal meliputi komputer/server, jaringan lokal stabil, CCTV yang kompatibel, sensor suhu/CO2, perangkat mobile pengasuh, ruang pelatihan, serta prosedur persetujuan orang tua.\n\nManajemen inventori mencatat nomor perangkat, lokasi, token, status, masa pakai, dan jadwal pemeriksaan. Pengadaan dilakukan melalui perangkat yang tersedia di mitra terlebih dahulu, kemudian dilengkapi sensor/kamera yang memenuhi spesifikasi; suku cadang dan perangkat pengganti disiapkan untuk titik kritis. Pemeliharaan mencakup pemeriksaan konektivitas, backup database, pembaruan model, audit akses, dan evaluasi laporan. Distribusi layanan dilakukan melalui akun terotorisasi; laporan harian dikirim sesuai preferensi dan kotak keluar admin mencatat berhasil/gagal. Rantai pasok dikelola melalui daftar pemasok, penerimaan perangkat, pengujian, pemasangan, dokumentasi, dan serah terima. Keberlanjutan usaha ditopang paket kemitraan bertahap, pelatihan, dukungan teknis, dan peningkatan mutu berbasis data yang sah.", size=8.7)
heading_only(tbl.cell(14, 0), "G. JADWAL PENELITIAN")
add_schedule(tbl.cell(15, 0))
heading_only(tbl.cell(16, 0), "H. DAFTAR PUSTAKA")
fill_section(tbl.cell(17, 0), "", [
    "[1] Republik Indonesia. Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi. JDIH BPK RI, https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022.",
    "[2] Kementerian Kesehatan Republik Indonesia. Peraturan Menteri Kesehatan Nomor 66 Tahun 2014 tentang Pemantauan Pertumbuhan, Perkembangan, dan Gangguan Tumbuh Kembang Anak. JDIH Kemenkes, https://jdih.kemkes.go.id/documents/peraturan-menteri-kesehatan-nomor-66-tahun-2014.",
    "[3] World Health Organization, UNICEF, World Bank Group, et al. Nurturing Care for Early Childhood Development: A Framework for Helping Children Survive and Thrive. WHO, 2018. https://www.who.int/publications/i/item/9789241514064.",
    "[4] World Health Organization. Guidelines on Physical Activity, Sedentary Behaviour and Sleep for Children under 5 Years of Age. WHO, 2019. https://www.who.int/publications/i/item/9789241550536.",
    "[5] Tabassi, E. Artificial Intelligence Risk Management Framework (AI RMF 1.0). NIST AI 100-1, National Institute of Standards and Technology, 2023. https://doi.org/10.6028/NIST.AI.100-1.",
    "[6] International Organization for Standardization. ISO/IEC 27001:2022 Information Security, Cybersecurity and Privacy Protection — Information Security Management Systems — Requirements. ISO, 2022.",
    "[7] Kementerian Kesehatan Republik Indonesia. SATUSEHAT Platform: Pemetaan Data Tumbuh Kembang dan Kuesioner Pra Skrining Perkembangan (KPSP). https://satusehat.kemkes.go.id/platform/docs/id/interoperability/tumbuh-kembang-new/.",
    "[8] Badan Standardisasi Nasional. SNI ISO/IEC 23053:2022: Kerangka Kerja untuk Sistem Kecerdasan Artifisial Menggunakan Pemelajaran Mesin. BSN, 2022.",
], size=8.4)

# Preserve the template's single-page geometry but allow filled rows to expand naturally.
for row in tbl.rows:
    trPr = row._tr.get_or_add_trPr()
    h = trPr.find(qn("w:trHeight"))
    if h is not None:
        h.set(qn("w:hRule"), "atLeast")

doc.core_properties.title = "Usulan Pengembangan SmartDayCare AI"
doc.core_properties.subject = "Template Hackathon USM 2026"
doc.core_properties.author = "Tim SmartDayCare"
doc.save(OUTPUT)
print(OUTPUT)
