/* SmartDaycare AI — inti aplikasi: penyimpanan, sesi, data harian, real-time, bagan, kerangka halaman. */
(function () {
  "use strict";
  const SD = (window.SD = {});
  const KEY = "sdai.store.v3", SKEY = "sdai.session", RKEY = "sdai.remember";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  SD.$ = $; SD.$$ = $$;
  const pad = (n) => String(n).padStart(2, "0");

  /* ---------- Format ---------- */
  const fmt = (SD.fmt = {
    time(d) { d = new Date(d); return pad(d.getHours()) + ":" + pad(d.getMinutes()); },
    timeS(d) { d = new Date(d); return fmt.time(d) + ":" + pad(d.getSeconds()); },
    date(d) { return new Date(d || Date.now()).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); },
    dateShort(d) { return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" }); },
    dayShort(d) { return new Date(d).toLocaleDateString("id-ID", { weekday: "short" }); },
    when(iso) { const d = new Date(iso); return SD.time.isToday(d) ? fmt.time(d) : fmt.dateShort(d) + " " + fmt.time(d); },
    rel(iso) {
      const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
      if (s < 5) return "baru saja"; if (s < 60) return s + " dtk lalu";
      const m = Math.round(s / 60); if (m < 60) return m + " mnt lalu";
      const h = Math.round(m / 60); if (h < 24) return h + " jam lalu";
      return Math.round(h / 24) + " hari lalu";
    },
    num(n, dec) { return Number(n || 0).toLocaleString("id-ID", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); },
    rp(n) { return "Rp " + Number(n).toLocaleString("id-ID"); },
    esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
    initials(name) { return String(name || "?").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase(); },
    greeting() { const h = new Date().getHours(); return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam"; }
  });

  /* ---------- Waktu ---------- */
  SD.time = {
    todayAt(hhmm) { const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; },
    past(hhmm) { return SD.time.todayAt(hhmm).getTime() <= Date.now(); },
    isToday(d) { d = new Date(d); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); },
    hhmm(iso) { return fmt.time(iso); }
  };

  /* ---------- Peristiwa internal ---------- */
  const handlers = {};
  SD.on = (n, f) => { (handlers[n] = handlers[n] || []).push(f); };
  SD.emit = (n, d) => { (handlers[n] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); };

  /* ---------- Penyimpanan (localStorage, sinkron antar tab) ---------- */
  const store = (SD.store = {
    state: null,
    defaults() {
      return {
        users: SEED.users.map((u) => Object.assign({}, u)),
        log: [], resolved: {}, prefs: {}, tickets: [],
        settings: Object.assign({}, SEED.thresholds),
        foods: SEED.foods.map((f) => Object.assign({}, f)),
        createdAt: new Date().toISOString()
      };
    },
    load() {
      let s = null;
      try { const raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = null; }
      const d = this.defaults();
      if (s) {
        // akun bawaan fasilitas selalu tersedia; akun yang didaftarkan pengguna dipertahankan
        const seedIds = new Set(d.users.map((u) => u.id));
        const extra = (s.users || []).filter((u) => !seedIds.has(u.id));
        const seedOverrides = {};
        (s.users || []).forEach((u) => { if (seedIds.has(u.id)) seedOverrides[u.id] = u; });
        d.users = d.users.map((u) => Object.assign(u, seedOverrides[u.id] || {})).concat(extra);
        d.log = s.log || []; d.resolved = s.resolved || {}; d.prefs = s.prefs || {}; d.tickets = s.tickets || [];
        const cut = Date.now() - 3 * 86400000; d.log.forEach((x) => { if ((x.photo || x.photoPre || x.photoPost) && new Date(x.at).getTime() < cut) { delete x.photo; delete x.photoPre; delete x.photoPost; } });
        d.settings = Object.assign(d.settings, s.settings || {});
        if (s.foods && s.foods.length) d.foods = s.foods;
        d.createdAt = s.createdAt || d.createdAt;
      }
      this.state = d; return d;
    },
    save(silent) {
      const write = () => localStorage.setItem(KEY, JSON.stringify(this.state));
      try { write(); }
      catch (e) {
        /* penyimpanan penuh: lepaskan foto dari catatan terlama, lalu coba lagi */
        const withPhoto = this.state.log.filter((x) => x.photo || x.photoPre || x.photoPost).reverse();
        for (const x of withPhoto) { delete x.photo; delete x.photoPre; delete x.photoPost; try { write(); break; } catch (e2) { /* lanjut melepas */ } }
      }
      if (!silent) SD.emit("change", { remote: false });
    },
    add(entry) {
      entry.id = "E" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      entry.at = entry.at || new Date().toISOString();
      this.state.log.unshift(entry);
      if (this.state.log.length > 600) this.state.log.length = 600;
      this.save(); return entry;
    },
    pref(userId, key, val) {
      const p = (this.state.prefs[userId] = this.state.prefs[userId] || {});
      if (val === undefined) return p[key];
      p[key] = val; this.save(true);
    }
  });
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) { store.load(); SD.emit("change", { remote: true }); }
    if (e.key === SKEY + ".bump") { /* tab lain masuk/keluar */ }
  });

  /* ---------- Sesi & akun ---------- */
  const auth = (SD.auth = {
    roleLabel(r) { return { parent: "Orang tua", caregiver: "Pengasuh", admin: "Admin daycare", system: "Sistem" }[r] || r; },
    home(u) { return { parent: "parent.html", caregiver: "caregiver.html", admin: "admin.html" }[u.role] || "dashboard.html"; },
    user() {
      const id = sessionStorage.getItem(SKEY) || localStorage.getItem(RKEY);
      if (!id) return null;
      const u = store.state.users.find((x) => x.id === id);
      if (!u || u.disabled) return null;
      if (!sessionStorage.getItem(SKEY)) sessionStorage.setItem(SKEY, id);
      return u;
    },
    login(email, pw, remember) {
      const u = store.state.users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!u || u.password !== pw) return { ok: false, msg: "E-mail atau kata sandi tidak cocok. Periksa kembali." };
      if (u.disabled) return { ok: false, msg: "Akun ini dinonaktifkan. Hubungi admin daycare Anda." };
      sessionStorage.setItem(SKEY, u.id);
      if (remember) localStorage.setItem(RKEY, u.id); else localStorage.removeItem(RKEY);
      store.add({ type: "access", by: u.name, role: u.role, text: "Masuk ke akun", purpose: "Autentikasi", sev: "low" });
      return { ok: true, user: u };
    },
    logout() {
      const u = auth.user();
      if (u) store.add({ type: "access", by: u.name, role: u.role, text: "Keluar dari akun", purpose: "Autentikasi", sev: "low" });
      sessionStorage.removeItem(SKEY); localStorage.removeItem(RKEY);
      location.href = "login.html?out=1";
    },
    register(d) {
      const email = String(d.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: "Alamat e-mail belum benar." };
      if (store.state.users.some((u) => u.email.toLowerCase() === email)) return { ok: false, msg: "E-mail ini sudah terdaftar. Silakan masuk." };
      if (String(d.name || "").trim().length < 3) return { ok: false, msg: "Nama lengkap minimal 3 huruf." };
      if (auth.pwScore(d.password) < 2) return { ok: false, msg: "Kata sandi minimal 8 karakter dengan huruf dan angka." };
      if (d.password !== d.confirm) return { ok: false, msg: "Ulangi kata sandi belum sama." };
      const u = { id: "U" + Date.now().toString(36).toUpperCase(), name: d.name.trim(), email, phone: (d.phone || "").trim(), password: d.password, role: d.role, createdAt: new Date().toISOString() };
      if (d.role === "parent") {
        u.children = [];
        if (d.code) {
          const c = SEED.children.find((x) => x.code.toLowerCase() === d.code.trim().toLowerCase());
          if (!c) return { ok: false, msg: "Kode anak tidak dikenali. Periksa kembali atau kosongkan dulu, lalu tautkan nanti dari Beranda." };
          u.children.push(c.id);
        }
      } else {
        const need = SEED.inviteCodes[d.role];
        if (String(d.code || "").trim().toUpperCase() !== need) return { ok: false, msg: "Kode undangan staf tidak cocok. Minta kode terbaru ke admin daycare." };
        u.area = d.role === "admin" ? "Seluruh fasilitas" : "Ditentukan admin";
      }
      store.state.users.push(u); store.save(true);
      store.add({ type: "account", by: u.name, role: u.role, text: "Akun baru dibuat (" + auth.roleLabel(u.role) + ")", purpose: "Pendaftaran", sev: "low" });
      sessionStorage.setItem(SKEY, u.id);
      return { ok: true, user: u };
    },
    linkChild(u, code) {
      const c = SEED.children.find((x) => x.code.toLowerCase() === String(code).trim().toLowerCase());
      if (!c) return { ok: false, msg: "Kode anak tidak dikenali. Format kode: KA-2201." };
      u.children = u.children || [];
      if (u.children.includes(c.id)) return { ok: false, msg: c.short + " sudah tertaut ke akun Anda." };
      u.children.push(c.id); store.save(true);
      store.add({ type: "account", by: u.name, role: u.role, childId: c.id, text: "Menautkan anak " + c.name, purpose: "Kode " + c.code, sev: "low" });
      return { ok: true, child: c };
    },
    pwScore(pw) {
      pw = String(pw || ""); let s = 0;
      if (pw.length >= 8) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
      if (pw.length < 8) s = Math.min(s, 1);
      return s;
    },
    require(roles) {
      const u = auth.user();
      const here = location.pathname.split("/").pop() || "index.html";
      if (!u) { location.replace("login.html?next=" + encodeURIComponent(here + location.hash)); return null; }
      if (roles && roles.length && !roles.includes(u.role) && u.role !== "admin") { location.replace("dashboard.html?denied=" + encodeURIComponent(here)); return null; }
      return u;
    },
    canOpen(u, page) {
      if (u.role === "admin") return true;
      return { parent: ["parent.html"], caregiver: ["caregiver.html"] }[u.role].includes(page);
    },
    childrenOf(u) {
      if (!u) return [];
      if (u.role !== "parent") return SEED.children;
      return SEED.children.filter((c) => (u.children || []).includes(c.id));
    }
  });

  /* ---------- Data harian (gabungan data dasar + catatan tersimpan) ---------- */
  const data = (SD.data = {
    child(id) { return SEED.children.find((c) => c.id === id); },
    logToday(fn) { return store.state.log.filter((e) => SD.time.isToday(e.at) && (!fn || fn(e))); },
    attendance(c) {
      const ev = data.logToday((e) => e.childId === c.id && (e.type === "checkin" || e.type === "checkout"));
      if (ev.length) { const last = ev[0]; return { state: last.type === "checkin" ? "present" : "home", at: fmt.time(last.at), by: last.by }; }
      if (c.checkout && SD.time.past(c.checkout)) return { state: "home", at: c.checkout, by: c.caregiver };
      if (SD.time.past(c.checkin)) return { state: "present", at: c.checkin, by: c.caregiver };
      return { state: "away", at: null, by: null };
    },
    timeline(c) {
      const skipLunch = data.loggedLunch(c);
      const items = c.timeline.filter((t) => SD.time.past(t.t) && !(skipLunch && /^Makan siang/.test(t.title))).map((t) => ({ t: t.t, cls: t.cls, title: t.title, desc: t.desc, ms: SD.time.todayAt(t.t).getTime() }));
      data.logToday((e) => e.childId === c.id && ["checkin", "checkout", "temp", "med", "meal", "plate", "incident", "note"].includes(e.type) && e.done !== "replaced").forEach((e) => {
        items.push({ t: fmt.time(e.at), cls: e.sev === "high" ? "t-danger" : e.sev === "medium" ? "t-warn" : "t-ok", title: e.title || e.text, desc: e.title ? e.text : (e.by ? "Dicatat oleh " + e.by : ""), ms: new Date(e.at).getTime() });
      });
      return items.sort((a, b) => a.ms - b.ms);
    },
    upcoming(c) { return c.timeline.filter((t) => !SD.time.past(t.t)); },
    notifications(u) {
      const kids = auth.childrenOf(u); const out = [];
      kids.forEach((c) => {
        const skipLunch = data.loggedLunch(c);
        c.timeline.filter((t) => SD.time.past(t.t) && !(skipLunch && /^Makan siang/.test(t.title))).forEach((t) => {
          const sev = t.cls === "t-danger" ? "high" : t.cls === "t-warn" ? "medium" : "low";
          out.push({ id: c.id + t.t, sev, at: SD.time.todayAt(t.t).toISOString(), child: c.short, text: t.title + ". " + t.desc });
        });
        data.logToday((e) => e.childId === c.id && ["checkin", "checkout", "temp", "med", "meal", "incident", "note"].includes(e.type)).forEach((e) => {
          out.push({ id: e.id, sev: e.sev || "low", at: e.at, child: c.short, text: (e.title ? e.title + ". " : "") + e.text + (e.by ? " — " + e.by : "") });
        });
      });
      return out.sort((a, b) => new Date(b.at) - new Date(a.at));
    },
    unread(u) {
      const last = store.pref(u.id, "lastRead") || 0;
      return data.notifications(u).filter((n) => new Date(n.at).getTime() > last).length;
    },
    incidents() {
      const seeded = SEED.incidents.filter((i) => SD.time.past(i.t)).map((i) => {
        const r = store.state.resolved[i.id];
        return Object.assign({}, i, { at: SD.time.todayAt(i.t).toISOString(), resolved: i.resolved || !!r, by: r ? r.by : i.by, resolvedAt: r ? fmt.time(r.at) : i.resolvedAt });
      });
      const extra = data.logToday((e) => e.type === "incident").map((e) => {
        const r = store.state.resolved[e.id];
        return { id: e.id, t: fmt.time(e.at), at: e.at, room: e.room, type: e.title, sev: e.sev, sevText: e.sev === "high" ? "Penting" : e.sev === "medium" ? "Perhatian" : "Info", childId: e.childId, child: e.child, resolved: !!r, by: r ? r.by : e.by, resolvedAt: r ? fmt.time(r.at) : null, note: e.text, reportedBy: e.by };
      });
      return extra.concat(seeded).sort((a, b) => new Date(b.at) - new Date(a.at));
    },
    resolve(id, by) { store.state.resolved[id] = { by, at: new Date().toISOString() }; store.save(); },
    meds() {
      const seeded = SEED.medLogs.filter((m) => SD.time.past(m.t)).map((m) => Object.assign({}, m, { at: SD.time.todayAt(m.t).toISOString() }));
      const extra = data.logToday((e) => e.type === "med").map((e) => ({ t: fmt.time(e.at), at: e.at, childId: e.childId, child: e.child, med: e.med, dose: e.dose, by: e.by, note: e.note }));
      return extra.concat(seeded).sort((a, b) => new Date(b.at) - new Date(a.at));
    },
    meals(childId) { return data.logToday((e) => e.type === "meal" && (!childId || e.childId === childId)); },
    /* pindaian piring saat disajikan yang belum dipasangkan dengan pindaian sesudah makan */
    pendingPlates(childId) { return data.logToday((e) => e.type === "plate" && !e.done && (!childId || e.childId === childId)); },
    /* total gizi dari catatan makan yang dikirim lewat aplikasi hari ini */
    loggedIntake(c, mealName) {
      const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      data.meals(c.id).forEach((e) => { if (mealName && e.meal !== mealName) return; const x = e.totals || { kcal: e.kcal || 0, protein: 0, carbs: 0, fat: 0 }; t.kcal += x.kcal || 0; t.protein += x.protein || 0; t.carbs += x.carbs || 0; t.fat += x.fat || 0; });
      t.protein = +t.protein.toFixed(1); t.carbs = +t.carbs.toFixed(1); t.fat = +t.fat.toFixed(1); return t;
    },
    handovers() {
      const seeded = SEED.handovers.filter((h) => SD.time.past(h.t)).map((h) => Object.assign({}, h, { at: SD.time.todayAt(h.t).toISOString() }));
      const extra = data.logToday((e) => e.type === "handover").map((e) => ({ t: fmt.time(e.at), at: e.at, from: e.by, to: e.to, note: e.text }));
      return extra.concat(seeded).sort((a, b) => new Date(b.at) - new Date(a.at));
    },
    access() {
      const seeded = SEED.access.filter((a) => SD.time.past(a.t)).map((a) => Object.assign({}, a, { at: SD.time.todayAt(a.t).toISOString() }));
      const extra = store.state.log.filter((e) => e.type === "access" || e.type === "account").map((e) => ({ t: fmt.when(e.at), at: e.at, user: e.by, role: e.role, action: e.text, purpose: e.purpose || "" }));
      return extra.concat(seeded).sort((a, b) => new Date(b.at) - new Date(a.at));
    },
    /* Makan siang terjadwal dianggap terwakili bila pengasuh sudah memindai makan siang anak itu hari ini */
    loggedLunch(c) { return data.meals(c.id).some((e) => e.meal === "Makan siang"); },
    lunchDone(c) { return SD.time.past(c.nutrition.lunch.scannedPost) && !data.loggedLunch(c); },
    lunchTotals(c) {
      const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, pre: 0, post: 0 };
      c.nutrition.lunch.items.forEach((i) => { t.kcal += i.kcal; t.protein += i.protein; t.carbs += i.carbs; t.fat += i.fat; t.pre += i.pre; t.post += i.post; });
      t.pct = Math.round(((t.pre - t.post) / t.pre) * 100);
      return t;
    },
    consumedSoFar(c) {
      let base;
      if (data.lunchDone(c)) base = Object.assign({}, c.consumed);
      else { const lt = data.lunchTotals(c); const snack = SD.time.past("10:02"); base = { kcal: snack ? Math.max(0, c.consumed.kcal - lt.kcal) : 0, protein: snack ? +(c.consumed.protein - lt.protein).toFixed(1) : 0, carbs: snack ? +(c.consumed.carbs - lt.carbs).toFixed(1) : 0, fat: snack ? +(c.consumed.fat - lt.fat).toFixed(1) : 0 }; }
      const li = data.loggedIntake(c);
      return { kcal: base.kcal + li.kcal, protein: +(base.protein + li.protein).toFixed(1), carbs: +(base.carbs + li.carbs).toFixed(1), fat: +(base.fat + li.fat).toFixed(1) };
    },
    temps(c) {
      const seeded = c.temps.filter((t) => SD.time.past(t.t)).map((t) => ({ t: t.t, v: t.v, by: c.caregiver }));
      const extra = data.logToday((e) => e.childId === c.id && e.type === "temp").map((e) => ({ t: fmt.time(e.at), v: e.value, by: e.by }));
      return seeded.concat(extra).sort((a, b) => a.t.localeCompare(b.t));
    },
    present() { return SEED.children.filter((c) => data.attendance(c).state === "present").length; },
    weekLabels() { const out = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(fmt.dayShort(d)); } return out; }
  });

  /* ---------- Real-time: udara ruangan, kamera ---------- */
  const live = (SD.live = {
    air: SEED.air.map((a) => Object.assign({}, a, { base: Object.assign({}, a), at: Date.now() })),
    history: JSON.parse(JSON.stringify(SEED.co2History)),
    started: false,
    start() {
      if (live.started) return; live.started = true;
      setInterval(() => {
        live.air.forEach((a) => {
          const w = (r, k, lo, hi) => Math.min(a.base[k] + hi, Math.max(a.base[k] + lo, a[k] + (Math.random() * 2 - 1) * r));
          a.temp = +w(0.12, "temp", -0.7, 0.7).toFixed(1);
          a.hum = Math.round(w(1, "hum", -4, 4));
          a.co2 = Math.round(w(14, "co2", -60, 90));
          a.pm25 = Math.round(w(1.2, "pm25", -4, 6));
          a.at = Date.now();
          const h = live.history[a.room]; h.push(a.co2); if (h.length > 12) h.shift();
        });
        SD.emit("air", live.air);
      }, 4000);
      setInterval(() => SD.emit("tick"), 1000);
    },
    status(a) {
      const th = store.state.settings;
      if (a.co2 > th.co2Max || a.pm25 > th.pm25Max || a.temp > th.tempMax + 1.5) return { text: "Perlu ventilasi", cls: "danger" };
      if (a.co2 > th.co2Max * 0.85 || a.pm25 > th.pm25Max * 0.6 || a.temp > th.tempMax || a.hum > th.humMax) return { text: "Pantau", cls: "warn" };
      return { text: "Baik", cls: "ok" };
    },
    overall(all) { const s = live.air.filter((a) => all || a.room !== "Dapur (khusus staf)").map(live.status); return s.some((x) => x.cls === "danger") ? { text: "Perlu ventilasi", cls: "danger" } : s.some((x) => x.cls === "warn") ? { text: "Pantau", cls: "warn" } : { text: "Baik", cls: "ok" }; },
    overlay(canvas, opts) {
      if (!canvas) return; const ctx = canvas.getContext("2d");
      const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const subjects = opts.subjects || [];
      const font = getComputedStyle(document.body).fontFamily;
      const draw = () => {
        if (!canvas.isConnected) { if (canvas._raf) cancelAnimationFrame(canvas._raf); return; }
        const w = canvas.width = canvas.clientWidth * (devicePixelRatio || 1), h = canvas.height = canvas.clientHeight * (devicePixelRatio || 1);
        const r = devicePixelRatio || 1; ctx.clearRect(0, 0, w, h);
        const time = reduced ? 0 : Date.now() / 1000;
        subjects.forEach((s, i) => {
          const bx = (s.x + Math.sin(time * 0.35 + i * 1.7) * 0.02) * w, by = (s.y + Math.cos(time * 0.28 + i) * 0.012) * h;
          const bw = s.w * w, bh = s.h * h;
          ctx.lineWidth = 2 * r; ctx.setLineDash(s.blur ? [6 * r, 5 * r] : []);
          ctx.strokeStyle = s.blur ? "rgba(255,255,255,.45)" : s.color || "#5EEAD4";
          if (s.blur) { ctx.fillStyle = "rgba(160,160,168,.55)"; ctx.fillRect(bx, by, bw, bh); }
          ctx.strokeRect(bx, by, bw, bh);
          const label = s.blur ? "Diburamkan" : s.label;
          ctx.font = "600 " + 11 * r + "px " + font;
          const tw = ctx.measureText(label).width + 14 * r;
          const lx = Math.max(0, Math.min(bx, w - tw)); // label tetap di dalam bingkai
          ctx.fillStyle = s.blur ? "rgba(11,11,13,.85)" : "rgba(11,11,13,.9)";
          ctx.fillRect(lx, by - 20 * r, tw, 18 * r);
          ctx.fillStyle = s.blur ? "#D4D4D8" : "#fff"; ctx.fillText(label, lx + 7 * r, by - 7 * r);
        });
        if (opts.zone) { ctx.setLineDash([8 * r, 6 * r]); ctx.strokeStyle = "rgba(248,113,113,.9)"; ctx.lineWidth = 2 * r; ctx.strokeRect(opts.zone.x * w, opts.zone.y * h, opts.zone.w * w, opts.zone.h * h); ctx.setLineDash([]); ctx.fillStyle = "rgba(185,28,28,.9)"; ctx.fillRect(opts.zone.x * w, opts.zone.y * h - 18 * r, 132 * r, 18 * r); ctx.fillStyle = "#fff"; ctx.font = "600 " + 11 * r + "px " + font; ctx.fillText("Area khusus staf", opts.zone.x * w + 7 * r, opts.zone.y * h - 5 * r); }
      };
      if (canvas._raf) cancelAnimationFrame(canvas._raf);
      if (reduced) { draw(); return; }
      let last = 0; const loop = (ts) => { if (ts - last > 80) { draw(); last = ts; } canvas._raf = requestAnimationFrame(loop); };
      canvas._raf = requestAnimationFrame(loop);
    },
    subjectsFor(camId, viewer, focusChildId) {
      const cam = SEED.cameras.find((c) => c.id === camId);
      const kids = SEED.children.filter((c) => data.attendance(c).state === "present");
      const inRoom = kids.filter((c) => c.room === cam.room);
      const layouts = { play: [[0.12, 0.42, 0.14, 0.4], [0.36, 0.5, 0.13, 0.34], [0.6, 0.38, 0.14, 0.42], [0.8, 0.52, 0.12, 0.32]], sleep: [[0.1, 0.55, 0.26, 0.16], [0.42, 0.5, 0.26, 0.16], [0.7, 0.58, 0.24, 0.15]], dine: [[0.15, 0.44, 0.13, 0.36], [0.4, 0.46, 0.13, 0.34], [0.66, 0.42, 0.13, 0.38]] };
      const L = layouts[cam.mode] || layouts.play;
      const list = cam.id === "K4" ? [] : inRoom.length ? inRoom : (cam.mode === "play" ? kids.filter((c) => c.room !== "Ruang Tidur Anak").slice(0, 3) : []);
      return list.slice(0, L.length).map((c, i) => ({ label: c.short, x: L[i][0], y: L[i][1], w: L[i][2], h: L[i][3], blur: viewer.role === "parent" && c.id !== focusChildId }));
    }
  });

  /* ---------- Bagan (canvas, tanpa pustaka) ---------- */
  SD.chart = {
    prep(cv) { const r = devicePixelRatio || 1; cv.width = cv.clientWidth * r; cv.height = cv.clientHeight * r; const ctx = cv.getContext("2d"); ctx.scale(r, r); return { ctx, W: cv.clientWidth, H: cv.clientHeight }; },
    bars(cv, labels, values, o) {
      if (!cv) return; o = o || {}; const { ctx, W, H } = SD.chart.prep(cv);
      const padL = 40, padR = 10, padT = 18, padB = 28, max = Math.max(o.max || 0, ...values, 1) * 1.15;
      const cw = (W - padL - padR) / values.length, font = getComputedStyle(document.body).fontFamily;
      ctx.font = "11px " + font; ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) { const y = padT + ((H - padT - padB) * i) / 4; ctx.strokeStyle = "#E7E7E3"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillStyle = "#6E6E76"; ctx.textAlign = "right"; ctx.fillText(Math.round(max - (max * i) / 4), padL - 6, y); }
      values.forEach((v, i) => {
        const x = padL + cw * i + cw * 0.2, bw = cw * 0.6, bh = ((H - padT - padB) * v) / max, y = H - padB - bh;
        ctx.fillStyle = i === o.highlight ? "#131316" : v === 0 ? "#E4E4E0" : "#0B5F59";
        if (v === 0) { ctx.fillRect(x, H - padB - 3, bw, 3); } else ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = "#3A3A41"; ctx.textAlign = "center"; ctx.fillText(labels[i], x + bw / 2, H - padB / 2);
        if (v > 0) { ctx.fillStyle = "#131316"; ctx.font = "600 11px " + font; ctx.fillText(String(v), x + bw / 2, y - 9); ctx.font = "11px " + font; }
      });
    },
    line(cv, values, o) {
      if (!cv) return; o = o || {}; const { ctx, W, H } = SD.chart.prep(cv);
      const padL = 44, padR = 12, padT = 16, padB = 26, font = getComputedStyle(document.body).fontFamily;
      const lo = Math.min(...values, o.threshold ? o.threshold - 200 : Infinity) - 40, hi = Math.max(...values, o.threshold || 0) + 60;
      const X = (i) => padL + ((W - padL - padR) * i) / (values.length - 1), Y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
      ctx.font = "11px " + font; ctx.textBaseline = "middle";
      for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4, y = Y(v); ctx.strokeStyle = "#E7E7E3"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.fillStyle = "#6E6E76"; ctx.textAlign = "right"; ctx.fillText(Math.round(v), padL - 6, y); }
      if (o.threshold) { ctx.setLineDash([6, 5]); ctx.strokeStyle = "#B91C1C"; ctx.beginPath(); ctx.moveTo(padL, Y(o.threshold)); ctx.lineTo(W - padR, Y(o.threshold)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = "#B91C1C"; ctx.textAlign = "left"; ctx.fillText("Batas " + o.threshold + (o.unit ? " " + o.unit : ""), padL + 4, Y(o.threshold) - 9); }
      ctx.beginPath(); values.forEach((v, i) => { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
      ctx.lineWidth = 2; ctx.strokeStyle = "#0B5F59"; ctx.stroke();
      ctx.lineTo(X(values.length - 1), H - padB); ctx.lineTo(X(0), H - padB); ctx.closePath(); ctx.fillStyle = "rgba(11,95,89,.08)"; ctx.fill();
      values.forEach((v, i) => { ctx.fillStyle = i === values.length - 1 ? "#131316" : "#0B5F59"; ctx.beginPath(); ctx.arc(X(i), Y(v), i === values.length - 1 ? 4 : 2.5, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = "#3A3A41"; ctx.textAlign = "left"; ctx.fillText((o.labels && o.labels[0]) || "", padL, H - padB / 2); ctx.textAlign = "right"; ctx.fillText((o.labels && o.labels[1]) || "sekarang", W - padR, H - padB / 2);
    }
  };

  /* ---------- Pesan singkat ---------- */
  SD.toast = (msg, kind) => {
    let box = $(".toasts"); if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "toast" + (kind === "err" ? " err" : ""); t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 320); }, 3800);
  };

  /* ---------- Kerangka halaman ---------- */
  const LOGO = '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="8" fill="#0B5F59"/><path d="M9 19.5c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="17" cy="22.5" r="2.6" fill="#5EEAD4"/></svg>';
  const ICONS = {
    home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>',
    today: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    camera: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    plate: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    scale: '<path d="M12 3v18M5 7l7-4 7 4"/><path d="M2 14l3-7 3 7a3 3 0 0 1-6 0zM16 14l3-7 3 7a3 3 0 0 1-6 0z"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.5"/>',
    pill: '<rect x="2" y="9" width="20" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M8.5 15.5l7-7"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    swap: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    key: '<path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L19 3m-4 4 2 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    dot: '<circle cx="12" cy="12" r="3"/>'
  };
  const icon = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || ICONS.dot) + "</svg>";
  SD.chrome = {
    icon,
    /* Kerangka aplikasi: sidebar (bagian halaman + menu) dan bilah atas. Bagian dibaca dari .tabpane[data-nav]. */
    appShell(u, here) {
      const side = $("[data-sidebar]"), top = $("[data-topbar]"), shell = $(".shell"); if (!side || !top || !shell) return;
      const title = document.body.dataset.title || document.title;
      const panes = $$(".tabpane[data-nav]");
      const pages = [["dashboard.html", "Beranda", "home"]];
      if (u.role === "parent" || u.role === "admin") pages.push(["parent.html", "Dasbor orang tua", "heart"]);
      if (u.role === "caregiver" || u.role === "admin") pages.push(["caregiver.html", "Dasbor pengasuh", "users"]);
      if (u.role === "admin") pages.push(["admin.html", "Administrasi", "settings"]);
      pages.push(["account.html", "Akun & pengaturan", "user"], ["help.html", "Bantuan", "help"]);
      side.innerHTML =
        '<a class="sb-brand" href="dashboard.html">' + LOGO + '<span><span class="brand-name">SmartDaycare AI</span><span class="brand-sub">' + fmt.esc(SEED.facility.name.toUpperCase()) + "</span></span></a>" +
        '<nav class="sb-nav" aria-label="Navigasi">' +
        (panes.length ? '<div class="sb-label">' + fmt.esc(title) + '</div><div role="tablist" aria-label="Bagian halaman">' + panes.map((p) => '<button type="button" role="tab" data-tab="' + p.id + '" aria-selected="false">' + icon(p.dataset.icon) + "<span>" + fmt.esc(p.dataset.nav) + "</span>" + (p.dataset.count === "unread" ? '<span class="cnt" data-unread></span>' : "") + "</button>").join("") + "</div>" : "") +
        '<div class="sb-label">Menu</div>' + pages.map((l) => '<a href="' + l[0] + '"' + (l[0] === here ? ' class="active" aria-current="page"' : "") + ">" + icon(l[2]) + "<span>" + l[1] + "</span></a>").join("") +
        "</nav>" +
        '<div class="sb-user"><a href="account.html" title="Akun & pengaturan" style="display:flex;gap:10px;align-items:center"><span class="avatar">' + fmt.initials(u.name) + '</span><span style="min-width:0"><span class="un" style="display:block">' + fmt.esc(u.name) + '</span><span class="ur">' + auth.roleLabel(u.role) + '</span></span></a><button class="btn" type="button" data-logout title="Keluar">' + icon("logout") + "</button></div>";
      top.innerHTML =
        '<button class="drawer-btn" type="button" data-drawer aria-label="Buka menu" aria-expanded="false">' + icon("menu") + "</button>" +
        '<div><div class="tb-title" data-section-title>' + fmt.esc(title) + '</div></div><span class="tb-sub">' + fmt.date() + "</span>" +
        '<div class="tb-right"><span class="tb-clock" data-clock></span>' +
        (u.role === "parent" && here !== "parent.html" ? '<a class="btn btn-sm" href="parent.html#tab-notif" aria-label="Pemberitahuan" style="position:relative;padding:0 10px">' + icon("bell") + '<span class="cnt sb-cnt" data-unread style="position:absolute;top:-6px;right:-6px;background:#F87171;color:#fff;font-size:10.5px;font-weight:700;min-width:18px;height:18px;border-radius:999px;display:grid;place-items:center;padding:0 5px"></span></a>' : "") +
        '<a class="user-chip" href="account.html" title="Akun & pengaturan"><span class="avatar">' + fmt.initials(u.name) + '</span><span><span class="un">' + fmt.esc(u.name) + '</span><span class="ur">' + auth.roleLabel(u.role) + "</span></span></a></div>";
      const bd = document.createElement("div"); bd.className = "shell-backdrop"; shell.appendChild(bd);
      const setOpen = (o) => { shell.classList.toggle("nav-open", o); $("[data-drawer]").setAttribute("aria-expanded", String(o)); };
      $("[data-drawer]").addEventListener("click", () => setOpen(!shell.classList.contains("nav-open")));
      bd.addEventListener("click", () => setOpen(false));
      SD.on("tab", (id) => { setOpen(false); const p = $("#" + id); const t = $("[data-section-title]"); if (p && t && p.dataset.nav) t.textContent = p.dataset.nav; if (window.scrollY > 80) window.scrollTo({ top: 0 }); });
      SD.chrome.refreshBell(u);
    },
    /* Header publik (beranda, bantuan): tombol Masuk/Daftar diganti bila sudah masuk. */
    publicNav(u) {
      const box = $("[data-authlinks]"); if (!box) return;
      if (u) box.innerHTML = '<a class="btn btn-sm btn-primary" href="dashboard.html">Buka dasbor</a>';
    },
    refreshBell(u) { if (!u) return; const n = data.unread(u); $$("[data-unread]").forEach((b) => { b.textContent = n ? String(n) : ""; b.style.display = n ? "" : "none"; }); },
    init() {
      const tg = $(".nav-toggle"), nav = $("#mainnav");
      if (tg && nav) tg.addEventListener("click", () => { const o = nav.classList.toggle("open"); tg.setAttribute("aria-expanded", String(o)); });
      $$("[data-logout]").forEach((b) => b.addEventListener("click", auth.logout));
      $$("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));
      let bt = $(".back-top"); if (!bt) { bt = document.createElement("button"); bt.className = "back-top no-print"; bt.type = "button"; bt.setAttribute("aria-label", "Kembali ke atas"); bt.textContent = "↑"; document.body.appendChild(bt); }
      bt.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
      addEventListener("scroll", () => bt.classList.toggle("show", scrollY > 600), { passive: true });
      const tick = () => { $$("[data-clock]").forEach((el) => (el.textContent = fmt.timeS(new Date()) + " WIB")); $$("[data-rel]").forEach((el) => (el.textContent = fmt.rel(el.getAttribute("data-rel")))); };
      tick(); SD.on("tick", tick);
      $$("[data-date]").forEach((el) => (el.textContent = fmt.date()));
      $$("[data-greeting]").forEach((el) => (el.textContent = fmt.greeting()));
      $$("[data-year]").forEach((el) => (el.textContent = String(new Date().getFullYear())));
      SD.chrome.tabs(); SD.chrome.modals();
    },
    tabs() {
      $$('[role="tablist"]').forEach((list) => {
        const btns = $$("button[data-tab]", list);
        const show = (id, push) => {
          btns.forEach((b) => { const on = b.dataset.tab === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; const p = $("#" + b.dataset.tab); if (p) p.classList.toggle("active", on); });
          if (push) history.replaceState(null, "", "#" + id);
          SD.emit("tab", id);
        };
        btns.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab, true)));
        list.addEventListener("keydown", (e) => { const i = btns.findIndex((b) => b === document.activeElement); if (i < 0) return; const nx = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0; if (!nx) return; e.preventDefault(); const j = (i + nx + btns.length) % btns.length; btns[j].focus(); btns[j].click(); });
        const want = location.hash.slice(1);
        if (want && btns.some((b) => b.dataset.tab === want)) show(want, false);
        else if (btns.length && !btns.some((b) => b.getAttribute("aria-selected") === "true")) show(btns[0].dataset.tab, false);
        addEventListener("hashchange", () => { const id = location.hash.slice(1); if (btns.some((b) => b.dataset.tab === id)) show(id, false); });
      });
    },
    modals() {
      $$("[data-open-modal]").forEach((b) => b.addEventListener("click", () => SD.chrome.openModal(b.dataset.openModal)));
      $$("[data-close-modal]").forEach((b) => b.addEventListener("click", () => b.closest(".modal-back").classList.remove("open")));
      $$(".modal-back").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("open"); }));
      addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".modal-back.open").forEach((m) => m.classList.remove("open")); });
    },
    openModal(id) { const m = $("#" + id); if (!m) return; m.classList.add("open"); const f = $("input,select,textarea,button", m); if (f) setTimeout(() => f.focus(), 30); }
  };

  /* ---------- Bootstrap ---------- */
  store.load();
  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page || "";
    const guard = document.body.dataset.auth; // contoh: "parent" | "caregiver" | "admin" | "any"
    let user = null; const here = location.pathname.split("/").pop() || "index.html";
    if (guard) { user = auth.require(guard === "any" ? null : guard.split(",")); if (!user) return; SD.user = user; SD.chrome.appShell(user, here); }
    else { const u0 = auth.user(); if (u0) { user = u0; SD.user = u0; } SD.chrome.publicNav(u0); }
    SD.chrome.init(); live.start();
    SD.on("change", () => { if (user) SD.chrome.refreshBell(user); });
    if (SD.pages && SD.pages[page]) SD.pages[page](user);
  });
})();
