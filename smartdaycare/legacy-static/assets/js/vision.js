/* SmartDaycare AI — pengenalan makanan di perangkat.
   Menerima gambar piring (kamera atau foto), mengembalikan daftar makanan yang dikenali,
   perkiraan berat per menu, dan kotak posisinya. Seluruh perhitungan berjalan di peramban;
   foto tidak dikirim ke mana pun. */
(function (root) {
  "use strict";
  const V = {};

  /* Kategori visual → menu bawaan (nama pertama), alternatif, dan massa per cm² area terlihat. */
  V.CATS = {
    rice:   { label: "Nasi",            family: "staple",  density: 2.8,  menu: ["Nasi putih", "Nasi tim"] },
    greens: { label: "Sayur hijau",     family: "veg",     density: 1.1,  menu: ["Tumis sawi", "Brokoli kukus", "Labu kukus"] },
    fried:  { label: "Lauk goreng",     family: "protein", density: 1.8,  menu: ["Ayam goreng", "Tempe goreng", "Telur dadar"] },
    pale:   { label: "Lauk kukus",      family: "protein", density: 1.0,  menu: ["Ayam cincang kukus", "Tahu kukus", "Ikan dori kukus"] },
    brown:  { label: "Lauk berkuah",    family: "protein", density: 1.2,  menu: ["Ayam kecap", "Semur daging"] },
    soup:   { label: "Sup",             family: "soup",    density: 2.4,  menu: ["Sup wortel", "Sup ayam"] },
    orange: { label: "Buah jingga",     family: "fruit",   density: 2.0,  menu: ["Jeruk", "Pepaya", "Wortel rebus"] },
    yellow: { label: "Buah kuning",     family: "fruit",   density: 0.9,  menu: ["Pisang", "Jagung rebus", "Telur rebus"] },
    red:    { label: "Buah merah",      family: "fruit",   density: 1.4,  menu: ["Tomat", "Semangka"] },
    egg:    { label: "Telur",           family: "protein", density: 1.4,  menu: ["Telur mata sapi", "Telur dadar", "Telur rebus"] }
  };
  const ORDER = ["rice", "fried", "egg", "pale", "brown", "soup", "greens", "orange", "yellow", "red"];
  /* Kelas piksel sementara: 1 latar, 2 piring, 3 putih, 4 hijau, 5 merah, 6 cokelat, 7 pucat, 8 jingga, 9 goreng, 10 kuning */
  const K = { BG: 1, PLATE: 2, WHITE: 3, GREENS: 4, RED: 5, BROWN: 6, PALE: 7, ORANGEISH: 8, FRIED: 9, YELLOW: 10, WHITE_S: 11 };

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const hsv = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx / 255];
  };

  /* Analisis utama. img = { data: Uint8ClampedArray RGBA, width, height }.
     opts: { plateCm (diameter piring, cm), stage ("pre"|"post"), onStage(fn) } */
  V.analyzeImageData = async function (img, opts) {
    opts = opts || {};
    const W = img.width, H = img.height, N = W * H, px = img.data;
    const plateCm = +opts.plateCm || 22, stage = opts.stage || "pre";
    const report = async (name, i) => { if (typeof opts.onStage === "function") await opts.onStage(name, i, 4); };
    const t0 = now(); const notes = [];

    /* Tahap 1 — warna, tekstur, latar */
    await report("Membaca warna dan tekstur", 0);
    const hue = new Float32Array(N), sat = new Float32Array(N), val = new Float32Array(N), gray = new Uint8Array(N), tex = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; const c = hsv(r, g, b); hue[i] = c[0]; sat[i] = c[1]; val[i] = c[2]; gray[i] = (r * 299 + g * 587 + b * 114) / 1000; }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; tex[i] = Math.min(255, Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + W] - gray[i - W])); }
    const border = []; const bw = Math.max(2, Math.round(Math.min(W, H) * 0.04));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < bw || y < bw || x >= W - bw || y >= H - bw) border.push(y * W + x);
    const med = (idx, ch) => { const a = idx.map((i) => px[i * 4 + ch]).sort((p, q) => p - q); return a[a.length >> 1]; };
    const bg = [med(border, 0), med(border, 1), med(border, 2)];
    const dist = (i, c) => { const dr = px[i * 4] - c[0], dg = px[i * 4 + 1] - c[1], db = px[i * 4 + 2] - c[2]; return Math.sqrt(dr * dr + dg * dg + db * db); };
    const devs = border.map((i) => dist(i, bg)).sort((p, q) => p - q); const mad = devs[devs.length >> 1];
    const tol = Math.min(72, Math.max(30, mad * 3 + 22));
    const cls = new Uint8Array(N);
    const stack = [];
    for (const i of border) if (dist(i, bg) < tol) { cls[i] = K.BG; stack.push(i); }
    while (stack.length) {
      const i = stack.pop(); const x = i % W;
      if (x > 0 && !cls[i - 1] && tex[i - 1] < 56 && dist(i - 1, bg) < tol) { cls[i - 1] = K.BG; stack.push(i - 1); }
      if (x < W - 1 && !cls[i + 1] && tex[i + 1] < 56 && dist(i + 1, bg) < tol) { cls[i + 1] = K.BG; stack.push(i + 1); }
      if (i >= W && !cls[i - W] && tex[i - W] < 56 && dist(i - W, bg) < tol) { cls[i - W] = K.BG; stack.push(i - W); }
      if (i < N - W && !cls[i + W] && tex[i + W] < 56 && dist(i + W, bg) < tol) { cls[i + W] = K.BG; stack.push(i + W); }
    }
    await tick();

    /* Tahap 2 — piring: warna dominan bukan-makanan di bagian tengah */
    await report("Mencari piring", 1);
    const cx0 = Math.round(W * 0.18), cx1 = Math.round(W * 0.82), cy0 = Math.round(H * 0.18), cy1 = Math.round(H * 0.82);
    const bins = new Float64Array(15), binSat = new Float64Array(15), binVal = new Float64Array(15);
    const binOf = (i) => { const s = sat[i], v = val[i]; if (v < 0.22) return 14; if (s < 0.2) return v > 0.65 ? 12 : 13; if (s < 0.3 && v < 0.65) return 13; return Math.min(11, Math.floor(hue[i] / 30)); };
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) { const i = y * W + x; if (cls[i] !== K.BG) { const b = binOf(i); bins[b]++; binSat[b] += sat[i]; binVal[b] += val[i]; } }
    /* warna piring: biru/ungu/abu-abu/gelap, atau warna pastel apa pun (jarang ada makanan pastel seluas piring) */
    const pastel = (b) => b >= 2 && b < 12 && binSat[b] / (bins[b] || 1) < 0.45 && binVal[b] / (bins[b] || 1) > 0.7;
    const nonFood = (b) => (b >= 6 && b <= 10) || b === 13 || b === 14 || (b === 11 && binSat[b] / (bins[b] || 1) < 0.5) || pastel(b);
    let top = -1; for (let b = 0; b < 15; b++) if (nonFood(b) && bins[b] > N * 0.02 && (top < 0 || bins[b] > bins[top])) top = b;
    let plate = { found: false, box: null, diameterPx: 0, white: false };
    if (top >= 0) {
      const pc = [0, 0, 0]; let pn = 0;
      for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) { const i = y * W + x; if (cls[i] !== K.BG && binOf(i) === top) { pc[0] += px[i * 4]; pc[1] += px[i * 4 + 1]; pc[2] += px[i * 4 + 2]; pn++; } }
      pc[0] /= pn; pc[1] /= pn; pc[2] /= pn;
      const ph = hsv(pc[0], pc[1], pc[2]); const hueNear = (h) => top < 12 && Math.min(Math.abs(h - ph[0]), 360 - Math.abs(h - ph[0])) < 20;
      /* piksel sewarna piring: bin yang sama, atau rona sama dengan bayangan/pantulan (saturasi & terang berbeda) */
      for (let i = 0; i < N; i++) if (!cls[i] && ((binOf(i) === top && dist(i, pc) < 95) || (hueNear(hue[i]) && sat[i] > 0.12 && sat[i] < ph[1] + 0.2 && Math.abs(val[i] - ph[2]) < 0.35))) cls[i] = K.PLATE;
      const pcs = components(cls, W, H, K.PLATE, tex, sat, val);
      pcs.sort((a, b) => b.n - a.n);
      if (pcs.length && pcs[0].n > N * 0.03) { const p = pcs[0]; plate = { found: true, box: box(p, W, H), diameterPx: Math.max(p.x1 - p.x0, p.y1 - p.y0) + 1, white: false }; }
    }
    await tick();

    /* Tahap 3 — klasifikasi makanan per piksel dan pengelompokan */
    await report("Mengenali makanan", 2);
    for (let i = 0; i < N; i++) {
      if (cls[i]) continue;
      const h = hue[i], s = sat[i], v = val[i]; let c = 0;
      if (s < 0.2 && v > 0.62) c = tex[i] >= 12 ? K.WHITE : K.WHITE_S;
      else if (h >= 62 && h <= 175 && s > 0.18 && v > 0.12) c = K.GREENS;
      else if ((h >= 340 || h < 14) && s > 0.45 && v > 0.3) c = K.RED;
      else if (h >= 14 && h < 52) {
        if (s < 0.18) c = 0;
        else if (v < 0.48) c = s >= 0.3 ? K.BROWN : 0;
        else if (s < 0.42) c = K.PALE;
        else if (h >= 44) c = K.YELLOW;
        else if (s >= 0.72 && v >= 0.78) c = K.ORANGEISH;
        else c = K.FRIED;
      }
      else if (h >= 52 && h < 62 && s > 0.35 && v > 0.5) c = K.YELLOW;
      cls[i] = c;
    }
    const minArea = Math.max(24, N * 0.0012);
    const groups = {};
    const put = (cat, o) => { const g = groups[cat] || (groups[cat] = { cat, n: 0, x0: W, y0: H, x1: 0, y1: 0, tex: 0, count: 0 }); g.n += o.n; g.tex += o.tex * o.n; g.count++; g.x0 = Math.min(g.x0, o.x0); g.y0 = Math.min(g.y0, o.y0); g.x1 = Math.max(g.x1, o.x1); g.y1 = Math.max(g.y1, o.y1); };
    const overlap = (a, b) => { const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1), y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1); const s = Math.min((a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1), (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1)) || 1; return (x * y) / s; };
    const byClass = {}; [K.WHITE, K.WHITE_S, K.GREENS, K.RED, K.BROWN, K.PALE, K.ORANGEISH, K.FRIED, K.YELLOW].forEach((k) => { byClass[k] = components(cls, W, H, k, tex, sat, val); });
    const debug = []; const soupComps = []; let whitePlate = null;
    const usable = (o) => {
      const bwid = o.x1 - o.x0 + 1, bh = o.y1 - o.y0 + 1; o.thick = o.n / Math.max(bwid, bh); o.elong = Math.max(bwid, bh) / Math.max(1, Math.min(bwid, bh));
      if (opts.debug) debug.push({ k: o.k, n: o.n, tex: Math.round(o.tex), sat: +o.sat.toFixed(2), val: +o.val.toFixed(2), thick: +o.thick.toFixed(1), box: box(o, W, H) });
      return o.n >= minArea && o.thick >= 4 && !(o.elong > 3.5 && o.thick < 8);
    };
    const central = (o) => o.x1 > W * 0.2 && o.x0 < W * 0.8 && o.y1 > H * 0.2 && o.y0 < H * 0.8;
    /* piring putih: bidang putih halus yang besar di tengah */
    if (!plate.found) byClass[K.WHITE_S].forEach((o) => { if (usable(o) && o.n > N * 0.05 && central(o) && (!whitePlate || o.n > whitePlate.n)) whitePlate = o; });
    if (whitePlate) plate = { found: true, box: box(whitePlate, W, H), diameterPx: Math.max(whitePlate.x1 - whitePlate.x0, whitePlate.y1 - whitePlate.y0) + 1, white: true };
    const inPlate = (o) => { if (!plate.found) return true; const b = plate.box; const cx = (o.x0 + o.x1) / 2 / W, cy = (o.y0 + o.y1) / 2 / H; return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h; };
    /* sup dulu, supaya bagian kuah yang lebih gelap bisa digabungkan */
    byClass[K.ORANGEISH].forEach((o) => { if (!usable(o)) return; if (o.tex < 15 && o.n > N * 0.004) { put("soup", o); soupComps.push(o); } else put("orange", o); });
    const nearSoup = (o) => soupComps.some((sc) => overlap(o, sc) > 0.3);
    /* nasi: putih bertekstur di dalam piring; tanpa piring, putih bertekstur yang cukup tebal */
    const inner = (o) => { const b = plate.box, m = 0.06; return o.x0 / W >= b.x + b.w * m && o.x1 / W <= b.x + b.w * (1 - m) && o.y0 / H >= b.y + b.h * m && o.y1 / H <= b.y + b.h * (1 - m); };
    /* telur mata sapi: bidang kuning bulat di dalam bidang putih */
    const contains = (a, b) => b.x0 >= a.x0 && b.x1 <= a.x1 && b.y0 >= a.y0 && b.y1 <= a.y1;
    const yellows = byClass[K.YELLOW].filter((o) => usable(o)); const eggWhites = new Set(), yolks = new Set();
    byClass[K.WHITE].forEach((o) => { if (o.n < minArea * 3) return; const fill = o.n / ((o.x1 - o.x0 + 1) * (o.y1 - o.y0 + 1)); if (fill < 0.4 || (plate.found && (o.x1 - o.x0 + 1) > plate.diameterPx * 0.6)) return; yellows.forEach((y) => { if (y.elong < 1.8 && y.n < o.n && contains(o, y)) { eggWhites.add(o); yolks.add(y); } }); });
    eggWhites.forEach((o) => put("egg", o)); yolks.forEach((y) => put("egg", y));
    byClass[K.WHITE].forEach((o) => { if (eggWhites.has(o) || !usable(o)) return; if (plate.found ? (plate.white ? inner(o) && o.tex >= 18 && o.thick >= 6 : inPlate(o) && o.val >= 0.8) : o.tex >= 20 && o.val >= 0.78 && o.thick >= 6) put("rice", o); });
    if (plate.found && !plate.white) byClass[K.WHITE_S].forEach((o) => { if (usable(o) && inPlate(o) && o.val >= 0.8) put("rice", o); });
    byClass[K.GREENS].forEach((o) => { if (!usable(o)) return; if (o.tex >= 30 || (o.tex >= 13 && o.val >= 0.4)) put("greens", o); else notes.push("alas daun diabaikan"); });
    byClass[K.RED].forEach((o) => { if (usable(o)) put("red", o); });
    yellows.forEach((o) => { if (!yolks.has(o)) put("yellow", o); });
    /* warna cokelat/pucat/goreng di luar piring biasanya meja atau alas — hanya diterima bila menyatu dengan sup */
    byClass[K.BROWN].forEach((o) => { if (!usable(o) || o.n < N * 0.003) return; if (nearSoup(o)) put("soup", o); else if (inPlate(o)) put("brown", o); });
    byClass[K.PALE].forEach((o) => { if (!usable(o) || o.n < N * 0.006 || o.sat < 0.2) return; if (nearSoup(o)) put("soup", o); else if (inPlate(o)) put("pale", o); });
    byClass[K.FRIED].forEach((o) => { if (!usable(o)) return; if (nearSoup(o)) put("soup", o); else if (inPlate(o)) put(o.tex < 20 && o.sat >= 0.8 ? "soup" : "fried", o); });
    /* bagian gelap/pucat dari lauk goreng yang sama digabungkan */
    ["brown", "pale"].forEach((c) => { if (groups[c] && groups.fried && overlap(groups[c], groups.fried) > 0.5) { const g = groups[c]; groups.fried.n += g.n; groups.fried.tex += g.tex; groups.fried.count += g.count; groups.fried.x0 = Math.min(groups.fried.x0, g.x0); groups.fried.y0 = Math.min(groups.fried.y0, g.y0); groups.fried.x1 = Math.max(groups.fried.x1, g.x1); groups.fried.y1 = Math.max(groups.fried.y1, g.y1); delete groups[c]; } });
    /* satu "makanan" yang menutupi sebagian besar bingkai hampir pasti latar/meja */
    Object.keys(groups).forEach((c) => { if (groups[c].n > N * 0.3) { delete groups[c]; notes.push("latar mirip warna makanan diabaikan; gunakan alas polos"); } });
    await tick();

    /* Tahap 4 — skala dan porsi */
    await report("Menghitung porsi", 3);
    const cmPerPx = plate.found ? plateCm / plate.diameterPx : 36 / W;
    if (!plate.found) notes.push("piring tidak terdeteksi; skala memakai lebar bingkai");
    /* sisa makanan tersebar tipis, kuah tinggal lapisan: faktor tebal lebih kecil */
    const flat = (c) => (stage === "post" ? (c === "soup" ? 0.15 : 0.6) : 1);
    const items = ORDER.filter((c) => groups[c]).map((c) => {
      const g = groups[c], def = V.CATS[c];
      const cm2 = g.n * cmPerPx * cmPerPx;
      /* di piring putih hanya kulit nasi yang bertekstur terdeteksi; bagian dalam yang halus menyatu dengan piring */
      const whiteFix = c === "rice" && plate.white ? 1.5 : 1;
      let grams = Math.round((cm2 * def.density * flat(c) * whiteFix) / 5) * 5; if (grams < 5) grams = 5;
      const areaFrac = g.n / N;
      const conf = Math.min(0.95, Math.max(0.5, 0.52 + 0.28 * Math.min(1, areaFrac / 0.03) + (plate.found ? 0.1 : 0) + (g.count <= 3 ? 0.05 : 0)));
      /* jingga di dalam piring biasanya wortel; di luar piring biasanya buah */
      const menu = def.menu.slice(); if (c === "orange" && plate.found && inPlate(g)) { menu.splice(menu.indexOf("Wortel rebus"), 1); menu.unshift("Wortel rebus"); }
      return { cat: c, label: def.label, family: def.family, name: menu[0], alts: menu, grams, cm2: Math.round(cm2), areaFrac: +areaFrac.toFixed(4), box: { x: g.x0 / W, y: g.y0 / H, w: (g.x1 - g.x0 + 1) / W, h: (g.y1 - g.y0 + 1) / H }, conf: +conf.toFixed(2), texture: Math.round(g.tex / g.n), parts: g.count };
    });
    items.sort((a, b) => b.grams - a.grams);
    /* bercak sangat kecil tidak ditampilkan bila ada makanan lain yang jelas */
    if (items.length > 1) { const keep = items.filter((i) => i.areaFrac >= 0.0025); if (keep.length) items.splice(0, items.length, ...keep); }
    const totalG = items.reduce((s, i) => s + i.grams, 0);
    const conf = items.length ? +(items.reduce((s, i) => s + i.conf * i.grams, 0) / totalG).toFixed(2) : 0;
    const out = { items, plate: { found: plate.found, white: plate.white, box: plate.box, cm: plateCm }, cmPerPx, size: { w: W, h: H }, ms: Math.round(now() - t0), conf, level: V.level(conf), notes: notes.filter((n, i) => notes.indexOf(n) === i) };
    if (opts.debug) out.debug = debug;
    return out;
  };

  V.level = (c) => (c >= 0.8 ? "tinggi" : c >= 0.65 ? "sedang" : "rendah");

  /* Komponen terhubung (4-arah) untuk satu kelas piksel. */
  function components(cls, W, H, k, tex, sat, val) {
    const N = W * H, seen = new Uint8Array(N), out = [], st = [];
    for (let i = 0; i < N; i++) {
      if (cls[i] !== k || seen[i]) continue;
      const o = { k, n: 0, x0: W, y0: H, x1: 0, y1: 0, tex: 0, sat: 0, val: 0 };
      seen[i] = 1; st.push(i);
      while (st.length) {
        const j = st.pop(); const x = j % W, y = (j - x) / W;
        o.n++; o.tex += tex[j]; o.sat += sat[j]; o.val += val[j];
        if (x < o.x0) o.x0 = x; if (x > o.x1) o.x1 = x; if (y < o.y0) o.y0 = y; if (y > o.y1) o.y1 = y;
        if (x > 0 && cls[j - 1] === k && !seen[j - 1]) { seen[j - 1] = 1; st.push(j - 1); }
        if (x < W - 1 && cls[j + 1] === k && !seen[j + 1]) { seen[j + 1] = 1; st.push(j + 1); }
        if (j >= W && cls[j - W] === k && !seen[j - W]) { seen[j - W] = 1; st.push(j - W); }
        if (j < N - W && cls[j + W] === k && !seen[j + W]) { seen[j + W] = 1; st.push(j + W); }
      }
      o.tex /= o.n; o.sat /= o.n; o.val /= o.n; out.push(o);
    }
    return out;
  }
  const box = (o, W, H) => ({ x: o.x0 / W, y: o.y0 / H, w: (o.x1 - o.x0 + 1) / W, h: (o.y1 - o.y0 + 1) / H });

  /* Nilai gizi dari daftar menu (per 100 g). Mengembalikan item dengan kkal dan makro, plus total. */
  V.nutrition = function (items, foods) {
    const find = (n) => foods.find((f) => f.name.toLowerCase() === String(n).toLowerCase());
    const out = items.map((it) => { const f = find(it.name) || { kcal: 0, protein: 0, carbs: 0, fat: 0 }; const g = Math.max(0, +it.grams || 0); return Object.assign({}, it, { grams: g, kcal: Math.round((f.kcal * g) / 100), protein: +((f.protein * g) / 100).toFixed(1), carbs: +((f.carbs * g) / 100).toFixed(1), fat: +((f.fat * g) / 100).toFixed(1), known: !!find(it.name) }); });
    const total = out.reduce((t, i) => ({ grams: t.grams + i.grams, kcal: t.kcal + i.kcal, protein: +(t.protein + i.protein).toFixed(1), carbs: +(t.carbs + i.carbs).toFixed(1), fat: +(t.fat + i.fat).toFixed(1) }), { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 });
    return { items: out, total };
  };

  /* Cocokkan hasil pindaian sesudah makan dengan menu yang disajikan (sebelum makan).
     Setiap item sisa dipasangkan dengan menu sekeluarga (nasi↔nasi, lauk↔lauk, sayur↔sayur, ...). */
  V.matchLeftovers = function (preItems, postItems, cats) {
    cats = cats || V.CATS;
    const famOf = (name) => { for (const k in cats) if (cats[k].menu.some((m) => m.toLowerCase() === String(name).toLowerCase())) return cats[k].family; return "other"; };
    const used = new Set(); const rows = [];
    preItems.forEach((p) => {
      const fam = p.family || famOf(p.name);
      let best = null;
      postItems.forEach((q, qi) => { if (used.has(qi)) return; const qf = q.family || famOf(q.name); const same = q.name.toLowerCase() === p.name.toLowerCase(); if (same || qf === fam) { if (!best || same || q.grams > postItems[best].grams) best = qi; } });
      let post = 0; if (best !== null) { used.add(best); post = Math.min(p.grams, postItems[best].grams); }
      rows.push({ name: p.name, pre: p.grams, post, eaten: p.grams - post });
    });
    const unmatched = postItems.filter((q, qi) => !used.has(qi)).map((q) => q.name);
    return { rows, unmatched };
  };

  /* Ringkasan konsumsi dari baris pre/post + tabel gizi. */
  V.consumption = function (rows, foods) {
    const find = (n) => foods.find((f) => f.name.toLowerCase() === String(n).toLowerCase()) || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const items = rows.map((r) => { const f = find(r.name), e = Math.max(0, r.pre - r.post); return { name: r.name, pre: r.pre, post: r.post, eaten: e, kcal: Math.round((f.kcal * e) / 100), protein: +((f.protein * e) / 100).toFixed(1), carbs: +((f.carbs * e) / 100).toFixed(1), fat: +((f.fat * e) / 100).toFixed(1) }; });
    const t = items.reduce((a, i) => ({ pre: a.pre + i.pre, post: a.post + i.post, kcal: a.kcal + i.kcal, protein: +(a.protein + i.protein).toFixed(1), carbs: +(a.carbs + i.carbs).toFixed(1), fat: +(a.fat + i.fat).toFixed(1) }), { pre: 0, post: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 });
    t.pct = t.pre ? Math.round(((t.pre - t.post) / t.pre) * 100) : 0;
    return { items, total: t };
  };

  /* ---------- Bagian yang butuh peramban: kamera, kanvas, gambar ---------- */
  if (typeof document !== "undefined") {
    V.camera = {
      stream: null, facing: "environment",
      supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && (window.isSecureContext !== false); },
      async start(video) {
        this.stop(video);
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        this.stream = s; video.srcObject = s;
        await new Promise((res) => { if (video.readyState >= 2) res(); else video.onloadedmetadata = () => res(); });
        try { await video.play(); } catch (e) { /* autoplay ditolak: video tetap punya bingkai */ }
        return s;
      },
      stop(video) { if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; } if (video) { try { video.pause(); } catch (e) { /* abaikan */ } video.srcObject = null; } },
      async count() { try { const d = await navigator.mediaDevices.enumerateDevices(); return d.filter((x) => x.kind === "videoinput").length; } catch (e) { return 0; } },
      flip() { this.facing = this.facing === "environment" ? "user" : "environment"; }
    };

    /* Ambil bingkai dari <video>, <img>, atau kanvas menjadi kanvas berukuran maksimal maxW. */
    V.frame = function (src, maxW) {
      maxW = maxW || 320;
      const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
      if (!sw || !sh) return null;
      const k = Math.min(1, maxW / sw); const w = Math.max(16, Math.round(sw * k)), h = Math.max(16, Math.round(sh * k));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true }); ctx.drawImage(src, 0, 0, w, h);
      return { canvas: cv, imageData: ctx.getImageData(0, 0, w, h) };
    };
    V.thumb = function (src, w, q) {
      const f = V.frame(src, w || 240); if (!f) return null;
      try { return f.canvas.toDataURL("image/jpeg", q || 0.62); } catch (e) { return null; }
    };
    V.analyze = function (src, opts) { const f = V.frame(src, 320); if (!f) return Promise.reject(new Error("Gambar belum siap.")); return V.analyzeImageData(f.imageData, opts); };

    /* Gambar kotak hasil di kanvas overlay (koordinat ternormalisasi). */
    V.draw = function (canvas, result, opts) {
      if (!canvas) return; opts = opts || {};
      const r = window.devicePixelRatio || 1, w = canvas.clientWidth || 320, h = canvas.clientHeight || 240;
      canvas.width = Math.round(w * r); canvas.height = Math.round(h * r);
      const ctx = canvas.getContext("2d"); ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, w, h);
      if (opts.guide) {
        ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(w / 2, h / 2, Math.min(w, h) * 0.42, Math.min(w, h) * 0.42, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        return;
      }
      if (!result) return;
      /* gambar mengikuti object-fit: contain, jadi kotak dipetakan ke area gambar yang benar-benar tampak */
      let ox = 0, oy = 0, cw = w, ch = h;
      const m = opts.media, mw = m ? (m.videoWidth || m.naturalWidth || 0) : 0, mh = m ? (m.videoHeight || m.naturalHeight || 0) : 0;
      if (mw && mh) { const sc = Math.min(w / mw, h / mh); cw = mw * sc; ch = mh * sc; ox = (w - cw) / 2; oy = (h - ch) / 2; }
      const small = cw < 480; ctx.font = "600 " + (small ? 10 : 12) + "px Inter, system-ui, sans-serif"; ctx.textBaseline = "middle";
      if (result.plate && result.plate.found && result.plate.box) { const b = result.plate.box; ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5; ctx.strokeRect(ox + b.x * cw, oy + b.y * ch, b.w * cw, b.h * ch); ctx.restore(); }
      (result.items || []).forEach((it) => {
        const b = it.box; if (!b) return; const x = ox + b.x * cw, y = oy + b.y * ch, bwid = b.w * cw, bh = b.h * ch;
        ctx.strokeStyle = "#5EEAD4"; ctx.lineWidth = 2; ctx.strokeRect(x, y, bwid, bh);
        const label = it.name + (it.grams && !small ? " · " + it.grams + " g" : ""); const tw = ctx.measureText(label).width + 14, th = small ? 17 : 20;
        const inside = bh > th * 2.6 && bwid > tw + 8; /* kotak besar: label di dalam agar tidak menutupi kotak tetangga */
        const lx = Math.max(ox, Math.min(inside ? x + 3 : x, ox + cw - tw)), ly = inside ? y + 3 : y - th - 4 >= oy ? y - th - 4 : y + 4;
        ctx.fillStyle = "rgba(11,11,13,.86)"; ctx.fillRect(lx, ly, tw, th); ctx.fillStyle = "#fff"; ctx.fillText(label, lx + 7, ly + th / 2);
      });
    };
  }

  if (root && root.SD) root.SD.vision = V;
  if (typeof module !== "undefined" && module.exports) module.exports = V;
})(typeof window !== "undefined" ? window : null);
