"""Susun foto latih dari hasil pencarian ke ai/data/raw/<kelas>/.

Kelas mengikuti kategori di web/src/lib/vision.ts (rice, greens, fried, pale,
brown, soup, orange, yellow, red, egg) ditambah kelas `none` (bukan makanan:
piring kosong, meja, dinding, bayangan, lantai, tangan, kain).

Satu foto boleh memuat beberapa kelas (piring anak: nasi + brokoli + jagung).
Tulis labelnya dengan tanda plus, mis. "rice+greens+yellow"; kelas pertama
menjadi folder tujuan, semua label disimpan di data/manifest.json dan dipakai
train.py untuk memberi label tambalan (patch) berdasarkan warna yang masuk akal.

Dua daftar lain menjaga kualitas data:
* `MIN_SIDE` — foto yang lebih kecil dari ini dibuang (diperbesar paksa = tekstur palsu);
* `REJECTED` — foto yang sudah ditinjau tetapi tidak dipakai, beserta alasannya
  (tulisan besar menutupi makanan, piring collase, isi tidak sesuai kueri). Catatan ini
  supaya peninjauan tidak diulang di percobaan berikutnya.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/user/image-search")
OUT = Path(__file__).resolve().parent / "data" / "raw"
MIN_SIDE = 220  # px pada sisi terpendek; di bawah ini foto jadi burem saat diseragamkan ke 300 px

# prefix hasil pencarian -> (label bawaan, nomor yang dikecualikan[, label khusus per nomor])
Entry = tuple[str, set[int]] | tuple[str, set[int], dict[int, str]]
MAP: dict[str, Entry] = {
    "firm-tofu-cubes-on-white-plate-top-view-": ("pale", {1, 3}, {2: "pale+greens", 4: "fried"}),
    "clear-broth-vegetable-soup-in-white-bowl": ("soup", {5}, {1: "soup+orange+greens+pale", 3: "soup+red+greens", 4: "soup+red"}),
    "sayur-sop-bening-wortel-kentang-mangkuk-": ("soup", {1, 2, 4, 5}, {3: "soup+orange+greens"}),
    "orange-fruit-segments-on-white-plate-ove": ("orange", {2, 4}),
    "nasi-putih-di-piring-foto-dari-atas": ("rice", {1, 2, 3, 4}),
    "nasi-tim-ayam-bayi-mangkuk": ("rice", {2, 3}),
    "steamed-white-rice-in-bowl-close-up-top-": ("rice", set()),
    "tumis-sawi-hijau-di-piring": ("greens", set()),
    "brokoli-kukus-di-piring-putih": ("greens", {4}),
    "ayam-goreng-di-piring-putih": ("fried", set()),
    "tempe-goreng-di-piring": ("fried", set()),
    "tahu-kukus-putih-di-piring": ("pale", {1, 3, 4, 5}),
    "ikan-dori-kukus-mpasi-piring": ("pale", set()),
    "steamed-fish-fillet-on-plate-top-view": ("pale", {3}),
    "kentang-rebus-potong-di-piring": ("pale", set()),
    "semur-daging-kecap-di-piring": ("brown", set()),
    "ayam-kecap-manis-di-piring": ("brown", {1, 2}),
    "sup-wortel-kuah-bening-mangkuk": ("soup", set()),
    "sayur-sop-ayam-mangkuk-kuah": ("soup", set()),
    "jeruk-potong-di-piring": ("orange", set()),
    "pepaya-potong-di-piring": ("orange", {5}),
    "wortel-rebus-potong-di-piring-anak": ("orange", set()),
    "pisang-potong-di-piring-anak": ("yellow", {2, 3, 4, 5}),
    "banana-slices-on-plate-top-view": ("yellow", set()),
    "jagung-rebus-pipil-di-mangkuk": ("yellow", {5}),
    "boiled-corn-on-the-cob-on-plate": ("yellow", set()),
    "tomat-potong-di-piring-putih": ("red", {2, 5}),
    "semangka-potong-dadu-di-piring": ("red", {2, 3, 4, 5}),
    "sliced-strawberries-and-watermelon-on-pl": ("red", {3}),
    "telur-mata-sapi-di-piring-foto-dari-atas": ("egg", set()),
    "telur-rebus-belah-dua-di-piring": ("egg", set()),
    "empty-white-plate-on-table-top-view": ("none", set()),
    "piring-plastik-anak-kosong-di-meja": ("none", {3, 4, 5}),
    "lamp-shadow-on-white-wall-photo": ("none", set()),
    "empty-wooden-table-top-view": ("none", set()),
    "white-ceramic-floor-tiles-photo": ("none", set()),
    "hand-resting-on-empty-table-photo": ("none", set()),
    "blank-white-wall-room-corner-ceiling-lig": ("none", set()),
    "empty-bowl-and-spoon-on-tablecloth": ("none", set()),
    "folded-cloth-napkin-on-table-top-view": ("none", set()),
    "gray-concrete-floor-texture-photo": ("none", set()),
    "sepiring-nasi-putih-polos-piring-putih": ("rice", {1, 2, 4}),
    "nasi-putih-di-piring-anak-bento-sederhan": ("rice", {1, 2, 3, 4}),
    "watermelon-cubes-in-bowl-top-view": ("red", set()),
    "sayur-bayam-bening-mangkuk": ("greens", set()),
    "telur-dadar-di-piring": ("fried", set()),
    "rendang-daging-di-piring": ("brown", set()),
    "shadow-of-hand-on-white-wall": ("none", set()),
    "blank-paper-on-desk-top-view": ("none", set()),
    # Catatan: piring hijau/mint tidak boleh diberi label greens (warnanya lolos saringan brokoli).
    # --- tambahan v2 (lebih banyak nasi, lauk pucat, kuning, sup, piring anak campuran, bukan-makanan)
    "bowl-of-plain-white-rice-close-up": ("rice", set()),
    "cooked-white-rice-on-plate-overhead-phot": ("rice", {2, 5}, {1: "rice+brown"}),
    "steamed-white-rice-on-plate-top-view-sto": ("rice", {2, 3}),
    "beef-stew-brown-sauce-on-plate-top-view": ("brown+rice", {4}),
    "semur-ayam-kecap-coklat-di-piring": ("brown", {2, 3, 5}),
    "boiled-carrot-slices-on-plate-top-view": ("orange", {2, 4}, {1: "rice+orange"}),
    "orange-segments-on-white-plate-top-view": ("orange", set()),
    "pepaya-potong-dadu-di-piring-putih": ("orange", {1, 2, 4, 5}),
    "boiled-potato-chunks-on-plate-top-view": ("pale", set(), {1: "pale+greens"}),
    "bubur-ayam-polos-mangkuk-foto-dari-atas": ("pale", {1, 2, 4, 5}),
    "steamed-tofu-cubes-on-white-plate": ("pale", {2, 5}, {1: "fried", 3: "brown"}),
    "chicken-nuggets-on-plate-top-view": ("fried", {4}, {2: "fried+red", 5: "fried+red"}),
    "fried-chicken-pieces-on-white-plate-top-": ("fried", {5}, {2: "fried+red"}),
    "tempe-goreng-potong-di-piring-putih-foto": ("fried", {4, 5}),
    "clear-chicken-vegetable-soup-in-bowl-top": ("soup", {1}),
    "sup-ayam-bening-wortel-kentang-mangkuk-a": ("soup", set()),
    "sayur-sop-bening-mangkuk-putih-foto-dari": ("soup", {1, 2, 4, 5}),
    "fried-egg-sunny-side-up-on-plate-top-vie": ("egg", {1}),
    "halved-hard-boiled-eggs-on-plate-top-vie": ("egg", {3}),
    "steamed-broccoli-florets-on-plate-top-vi": ("greens", set()),
    "sayur-bayam-rebus-di-piring-putih": ("greens", {1, 4}, {5: "soup+greens"}),
    "jagung-manis-pipil-rebus-di-piring": ("yellow", {1, 2, 3, 5}),
    "sweet-corn-kernels-boiled-in-bowl-top-vi": ("yellow", {4}),
    "sliced-banana-pieces-on-plate-top-view": ("yellow", set()),
    "watermelon-cubes-on-white-plate-top-view": ("red", set()),
    "indonesian-lunch-plate-rice-vegetables-t": ("rice+egg", {1, 2, 3, 4}),
    "kids-divided-lunch-plate-rice-chicken-br": (
        "rice",
        {4},
        {1: "rice+yellow", 2: "rice", 3: "rice+yellow+orange+fried", 5: "rice+fried+yellow"},
    ),
    "nasi-putih-di-piring-makan-siang-anak-de": ("rice", {1, 2, 5}, {3: "rice+fried", 4: "rice+greens+fried"}),
    "empty-divided-plastic-plate-for-kids-on-": ("none", {1, 4}),
    "empty-stainless-steel-food-tray-top-view": ("none", set()),
    "nasi-putih-di-piring-melamin-warna": ("none", {1, 2, 3}),
    "plastic-placemat-pattern-on-kitchen-tabl": ("none", {3}),
    "spoon-and-fork-on-empty-plate-top-view": ("none", set()),
    "rendang-daging-sapi-di-piring-putih-foto": ("brown", {2, 3}),
    "teriyaki-chicken-pieces-brown-sauce-on-w": ("brown+rice", {1, 2, 4}),
    "sliced-strawberries-on-white-plate-top-v": ("red", {2, 4}, {5: "red+yellow"}),
    "soto-ayam-bening-mangkuk-foto-dari-atas": ("soup", set()),
    "sup-makaroni-sayur-kuah-bening-mangkuk-a": ("soup", {1, 3}),
    "steamed-chicken-breast-sliced-on-white-p": ("pale", set(), {2: "pale+orange+yellow"}),
    "steamed-cauliflower-florets-on-plate-top": ("pale", {4, 5}),
    # --- tambahan v3: sup & telur & pucat ditambah, piring anak sungguhan, latar bukan-makanan
    "ayam-goreng-kremes-di-piring-putih-atas": ("fried", {2}, {3: "fried+rice+egg", 5: "fried+rice"}),
    "ayam-kukus-suwir-putih-di-piring-anak": ("rice", {1, 2, 3, 5}, {4: "rice+pale"}),
    "boiled-egg-halves-on-white-plate-top-vie": ("egg", {5}),
    "buah-naga-merah-potong-dadu-di-piring": ("red", {1, 2, 3, 4}),
    "bubur-ayam-polos-mangkuk-anak-dari-atas": ("pale", {3, 4}),
    "carrot-sticks-small-bowl-white-table-top": ("orange", {2}),
    "clear-vegetable-soup-in-bowl-top-view-wh": ("soup", {2}, {1: "soup+greens", 3: "soup+orange", 4: "soup+rice+orange"}),
    "corn-kernels-boiled-in-white-bowl-overhe": ("yellow", {4}),
    "empty-blue-plate-on-table-with-napkin-to": ("none", set()),
    "jagung-pipil-manis-rebus-di-mangkuk-puti": ("yellow", {1, 3, 5}, {4: "soup+yellow+greens"}),
    "kentang-rebus-potong-dadu-piring-putih-a": ("pale", set()),
    "kids-lunch-plate-rice-chicken-broccoli-t": ("pale", {4, 5}, {1: "pale+greens+red", 2: "rice+greens", 3: "pale+greens+egg"}),
    "mashed-potato-bowl-smooth-white-plate-to": ("pale", {1, 3}),
    "nampan-makan-anak-nasi-sayur-ayam-goreng": ("rice", {2, 3, 4}, {1: "rice+greens+fried", 5: "rice+greens"}),
    "nasi-putih-anak-di-piring-chia-dari-atas": ("rice", {4}, {1: "rice+egg+brown", 2: "rice+greens+egg", 5: "rice+egg+brown"}),
    "piring-kaca-kosong-di-atas-meja-kayu": ("none", set()),
    "scrambled-eggs-on-white-plate-top-view-b": ("egg", {4}),
    "semangka-potong-segitiga-di-piring-anak": ("rice", {4, 5}, {1: "rice+orange", 2: "rice+orange"}),
    "semur-daging-kentang-kuah-kental-piring": ("brown", {1, 2}, {4: "brown+pale", 5: "brown+pale"}),
    "soto-ayam-kuah-bening-mangkuk-foto-atas": ("soup", set(), {3: "soup+greens+orange+egg", 5: "soup+orange+egg"}),
    "spinach-green-vegetable-stir-fry-plate-o": ("greens", set(), {1: "greens+orange", 2: "greens+pale", 4: "greens+pale"}),
    "steamed-chicken-breast-sliced-white-plat": ("pale", {5}, {3: "pale+orange+yellow", 4: "pale+red"}),
    "steamed-rice-bowl-plain-overhead-wooden-": ("rice", {5}),
    "sup-bening-sayur-mangkuk-foto-dari-atas-": ("soup", {1}, {2: "soup+greens", 3: "rice+greens+yellow"}),
    "sup-kacang-merah-kuah-mangkuk-dari-atas": ("soup", {4}, {2: "soup+brown", 3: "soup+orange", 5: "soup+brown+orange"}),
    "tahu-putih-potong-dadu-di-piring-putih": ("pale", {1, 2, 3, 4}, {5: "pale+greens"}),
    "tahu-putih-rebus-potong-dadu-di-piring": ("pale", {2, 3, 4, 5}, {1: "pale+egg+greens"}),
    "taplak-meja-bermotif-foto-dari-atas-meja": ("none", {3, 4}),
    "telur-dadar-tipis-potong-di-piring-putih": ("egg", {2, 3, 4, 5}, {1: "egg+fried"}),
    "telur-rebus-belah-dua-di-piring-putih-an": ("egg", {1, 3, 4, 5}),
    "telur-rebus-kupas-belah-dua-piring-anak": ("egg", {1, 2, 3, 4}),
    "tempe-goreng-tepung-keemasan-di-piring": ("fried", {2}),
    "tofu-cubes-in-white-bowl-plain-overhead": ("pale", {1, 5}),
    "tomat-merah-iris-di-piring-putih-atas": ("red", {1, 2, 4, 5}),
    "tumis-buncis-wortel-di-piring-putih-atas": ("greens", {1, 3, 4, 5}, {2: "greens+orange"}),
    "wortel-rebus-iris-bulat-di-piring-anak": ("orange", {2}, {3: "rice+orange", 4: "rice+orange", 5: "rice+pale+orange"}),
}

# prefix yang sudah ditinjau dan sengaja tidak dipakai seluruhnya (alasan dicatat supaya tidak ditinjau ulang)
REJECTED: dict[str, str] = {
    "pisang-ambon-potong-bulat-di-piring-anak": "kelima hasilnya kartu tips (tulisan besar di atas piring kurma), bukan pisang di piring",
    "tahu-kukus-putih-piring-dari-atas-makana": "kolase & tulisan besar di hampir semua hasil; satu-satunya yang bersih 300×220 — terlalu lembut untuk sisi terpendek",
}


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    from PIL import Image

    manifest: list[dict[str, object]] = []
    counts: dict[str, int] = {}
    dropped: dict[str, list[str]] = {"terlalu kecil": [], "rusak": [], "tidak dipetakan": []}
    fixed_alpha = 0
    for f in sorted(SRC.iterdir()):
        m = re.match(r"^(.*)-(\d+)\.(jpg|jpeg|png|webp)$", f.name)
        if not m:
            continue
        prefix, num = m.group(1), int(m.group(2))
        if prefix not in MAP:
            dropped["tidak dipetakan"].append(f.name)
            continue
        entry = MAP[prefix]
        label, skip = entry[0], entry[1]
        if num in skip:
            continue
        if len(entry) > 2:
            label = entry[2].get(num, label)
        labels = label.split("+")
        bad = [c for c in labels if c not in CLASSES_OK]
        if bad:
            raise SystemExit(f"label tidak dikenal di {prefix}: {bad}")
        # foto yang lebih kecil dari MIN_SIDE diperbesar paksa saat diseragamkan → tekstur palsu; dibuang
        # berkas berlatar tembus pandang (potongan PNG dari situs stok) disimpan ulang di atas putih,
        # sebab membaca berkas itu sebagai RGB memberi latar hitam palsu yang merusak kelas `none`
        try:
            with Image.open(f) as im:
                if min(im.size) < MIN_SIDE:
                    dropped["terlalu kecil"].append(f.name)
                    continue
                has_alpha = im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info)
                dest = OUT / labels[0]
                dest.mkdir(parents=True, exist_ok=True)
                if has_alpha:
                    rgba = im.convert("RGBA")
                    flat = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
                    Image.alpha_composite(flat, rgba).convert("RGB").save(dest / (f.name.rsplit(".", 1)[0] + ".jpg"), quality=92)
                    saved = dest.name + "/" + f.name.rsplit(".", 1)[0] + ".jpg"
                    fixed_alpha += 1
                else:
                    shutil.copy2(f, dest / f.name)
                    saved = f"{labels[0]}/{f.name}"
        except Exception:
            dropped["rusak"].append(f.name)
            continue
        manifest.append({"file": saved, "labels": labels, "query": prefix})
        for c in labels:
            counts[c] = counts.get(c, 0) + 1
    (OUT.parent / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print({k: counts[k] for k in sorted(counts)}, "total", len(manifest), "foto", "|", fixed_alpha, "berkas transparan diratakan ke latar putih")
    for why, names in dropped.items():
        if names:
            pre = sorted({re.match(r"^(.*)-\d+\.", n).group(1) for n in names})
            print(f"  dilewati ({why}): {len(names)} foto dari {len(pre)} kueri: {', '.join(p[:38] for p in pre[:6])}{' …' if len(pre) > 6 else ''}")
    for p, why in REJECTED.items():
        print(f"  ditinjau, tidak dipakai: {p} — {why}")


CLASSES_OK = {"rice", "greens", "fried", "pale", "brown", "soup", "orange", "yellow", "red", "egg", "none"}


if __name__ == "__main__":
    main()
