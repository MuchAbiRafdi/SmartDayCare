/* SmartDaycare AI — logika per halaman. Dipanggil oleh core.js berdasarkan body[data-page]. */
(function () {
  "use strict";
  const P = (window.SD.pages = {});
  const { $, $$, fmt, store, auth, data, live, toast } = window.SD;
  const esc = fmt.esc;
  const q = (k) => new URLSearchParams(location.search).get(k);
  const sevCls = (s) => (s === "high" ? "sev-high" : s === "medium" ? "sev-medium" : "sev-low");
  const sevText = (s) => (s === "high" ? "Penting" : s === "medium" ? "Perhatian" : "Info");
  const badge = (st) => '<span class="badge ' + st.cls + '"><span class="dot"></span>' + st.text + "</span>";
  const setErr = (el, msg) => { if (!el) return; el.textContent = msg || ""; el.classList.toggle("show", !!msg); };
  const progress = (el, ms, done) => { if (!el) { done(); return; } const bar = $(".track i", el), pct = $(".pct", el); el.style.display = "block"; let p = 0; const t0 = performance.now(); const step = (t) => { p = Math.min(100, ((t - t0) / ms) * 100); if (bar) bar.style.width = p + "%"; if (pct) pct.textContent = Math.round(p) + "%"; if (p < 100) requestAnimationFrame(step); else setTimeout(done, 120); }; requestAnimationFrame(step); };
  const airRow = (a) => { const s = live.status(a); return "<li><div><b>" + esc(a.room) + '</b><div class="muted">' + fmt.num(a.temp, 1) + " °C · kelembapan " + a.hum + " %</div></div>" + badge(s) + "</li>"; };
  const authLive = () => { const paint = () => { const p = $("#auth-present"); if (p) p.textContent = data.present() + " / " + SEED.children.length; const a = $("#auth-air"); if (a) a.textContent = live.overall().text; }; paint(); SD.on("air", paint); };
  const pwToggle = () => $$(".pw-wrap button").forEach((b) => b.addEventListener("click", () => { const i = $("input", b.parentElement); i.type = i.type === "password" ? "text" : "password"; b.textContent = i.type === "password" ? "Lihat" : "Sembunyikan"; }));

  /* ========== Beranda publik ========== */
  P.landing = function () {
    const paint = () => {
      const o = live.overall(); const el = $("#hw-air"); if (el) el.innerHTML = '<span class="status-pill ' + (o.cls === "ok" ? "on" : o.cls === "warn" ? "warn" : "off") + '">' + o.text + "</span>";
      const p = $("#hw-present"); if (p) p.textContent = data.present() + " dari " + SEED.children.length + " anak";
      const inc = data.incidents(); const li = $("#hw-last"); if (li) li.textContent = inc.length ? inc[0].type + " · " + inc[0].t + " · " + (inc[0].resolved ? "sudah ditangani" : "sedang ditangani") : "Belum ada hari ini";
    };
    paint(); SD.on("air", paint); SD.on("change", paint);
    const seg = $("#billing"); if (seg) $$("button", seg).forEach((b) => b.addEventListener("click", () => { $$("button", seg).forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); const y = b.dataset.billing === "year"; $$("[data-price-month]").forEach((el) => { el.textContent = fmt.rp(y ? el.dataset.priceYear : el.dataset.priceMonth); }); $$("[data-per]").forEach((el) => (el.textContent = y ? "per anak / bulan, ditagih tahunan" : "per anak / bulan")); }));
    const f = $("#contact-form"); if (f) f.addEventListener("submit", (e) => { e.preventDefault(); const t = { id: "T" + Date.now().toString(36).toUpperCase().slice(-5), at: new Date().toISOString(), name: f.elements.name.value.trim(), email: f.elements.email.value.trim(), org: f.elements.org.value.trim(), msg: f.elements.msg.value.trim(), status: "Diterima" }; if (!t.name || !t.email || !t.msg) { toast("Lengkapi nama, e-mail, dan pesan.", "err"); return; } store.state.tickets.unshift(t); store.save(true); f.reset(); toast("Terima kasih. Permintaan " + t.id + " kami terima dan dibalas dalam 1 hari kerja."); });
  };

  /* ========== Masuk ========== */
  P.login = function () {
    const u = auth.user(); const next = q("next");
    if (u && !q("switch")) { location.replace(next || "dashboard.html"); return; }
    if (q("out")) toast("Anda telah keluar. Sampai jumpa.");
    if (q("switch") && u) { const n = $("#switch-note"); if (n) { n.classList.remove("hidden"); n.innerHTML = "Saat ini masuk sebagai <b>" + esc(u.name) + "</b>. Masuk dengan akun lain akan mengganti sesi di tab ini."; } }
    pwToggle(); authLive();
    const f = $("#login-form"), err = $("#login-err");
    f.addEventListener("submit", (e) => {
      e.preventDefault(); setErr(err, "");
      const btn = $("button[type=submit]", f); btn.disabled = true; btn.textContent = "Memeriksa…";
      setTimeout(() => {
        const r = auth.login(f.elements.email.value, f.elements.password.value, f.elements.remember.checked);
        if (!r.ok) { setErr(err, r.msg); btn.disabled = false; btn.textContent = "Masuk"; f.elements.password.focus(); return; }
        location.href = next || "dashboard.html";
      }, 450);
    });
    const fp = $("#forgot-link"), fpBox = $("#forgot-box");
    if (fp) fp.addEventListener("click", (e) => { e.preventDefault(); fpBox.classList.toggle("hidden"); if (!fpBox.classList.contains("hidden")) $("input", fpBox).focus(); });
    const ff = $("#forgot-form"); if (ff) ff.addEventListener("submit", (e) => { e.preventDefault(); const em = ff.elements.email.value.trim(); if (!em) return; $("#forgot-done").classList.remove("hidden"); $("#forgot-done").innerHTML = "Jika <b>" + esc(em) + "</b> terdaftar, tautan pengaturan ulang kata sandi dikirim dalam 5 menit. Periksa juga folder spam."; ff.classList.add("hidden"); });
  };

  /* ========== Daftar ========== */
  P.register = function () {
    if (auth.user() && !q("switch")) { location.replace("dashboard.html"); return; }
    pwToggle(); authLive();
    const f = $("#register-form"), err = $("#reg-err"), meter = $("#pw-meter"), hint = $("#code-hint"), label = $("#code-label"), code = $("#code");
    const roleUI = () => {
      const r = f.elements.role.value;
      if (r === "parent") { label.textContent = "Kode anak dari daycare (opsional)"; code.placeholder = "cth. KA-2201"; code.required = false; hint.textContent = "Dapat dikosongkan dan ditautkan kemudian dari Beranda."; }
      else { label.textContent = "Kode undangan staf"; code.placeholder = "Diberikan oleh admin daycare"; code.required = true; hint.textContent = r === "admin" ? "Akun admin memerlukan kode undangan admin." : "Akun pengasuh memerlukan kode undangan staf yang berlaku."; }
    };
    const pre = q("role"); if (pre && ["parent", "caregiver", "admin"].includes(pre)) f.elements.role.value = pre;
    $$("input[name=role]", f).forEach((r) => r.addEventListener("change", roleUI)); roleUI();
    f.elements.password.addEventListener("input", () => { meter.dataset.score = String(auth.pwScore(f.elements.password.value)); });
    f.addEventListener("submit", (e) => {
      e.preventDefault(); setErr(err, "");
      if (!f.elements.consent.checked) { setErr(err, "Centang persetujuan Syarat Layanan dan Kebijakan Privasi."); return; }
      const btn = $("button[type=submit]", f); btn.disabled = true; btn.textContent = "Membuat akun…";
      setTimeout(() => {
        const r = auth.register({ name: f.elements.name.value, email: f.elements.email.value, phone: f.elements.phone.value, password: f.elements.password.value, confirm: f.elements.confirm.value, role: f.elements.role.value, code: f.elements.code.value });
        if (!r.ok) { setErr(err, r.msg); btn.disabled = false; btn.textContent = "Buat akun"; return; }
        location.href = "dashboard.html?welcome=1";
      }, 500);
    });
  };

  /* ========== Beranda pengguna (pilih dasbor) ========== */
  P.hub = function (u) {
    if (q("denied")) toast("Halaman itu tidak tersedia untuk peran Anda. Berikut dasbor yang bisa Anda buka.", "err");
    if (q("welcome")) toast("Akun Anda siap. Selamat datang, " + u.name.split(" ")[0] + ".");
    $("#hub-name").textContent = u.name.split(" ")[0];
    $("#hub-role").textContent = auth.roleLabel(u.role) + (u.role === "parent" ? " · " + (auth.childrenOf(u).map((c) => c.short).join(", ") || "belum ada anak tertaut") : u.area ? " · " + u.area : "");
    const paint = () => {
      $("#hl-present").textContent = data.present() + "/" + SEED.children.length;
      $("#hl-air").textContent = live.overall().text;
      $("#hl-open").textContent = String(data.incidents().filter((i) => !i.resolved).length);
    };
    paint(); SD.on("air", paint); SD.on("change", paint);
    const kids = auth.childrenOf(u);
    const cards = [
      { page: "parent.html", icon: "heart", t: "Dasbor Orang Tua", d: "Kamera ruangan, catatan makan, suhu tubuh, dan pemberitahuan.", items: u.role === "parent" ? (kids.length ? kids.map((c) => c.name + " · " + c.age) : ["Belum ada anak tertaut"]) : ["Tampilan yang dilihat orang tua"] },
      { page: "caregiver.html", icon: "users", t: "Dasbor Pengasuh", d: "Absensi, pindai piring, obat, kejadian, dan serah terima.", items: [SEED.children.length + " anak terdaftar"] },
      { page: "admin.html", icon: "settings", t: "Administrasi", d: "Ringkasan operasional, perangkat, riwayat akses, akun, dan pengaturan.", items: ["Riwayat akses dan ekspor data"] }
    ];
    $("#hub-cards").innerHTML = cards.map((c) => {
      const ok = auth.canOpen(u, c.page);
      return '<div class="hub-card' + (ok ? "" : " locked") + '"><div class="icon-tile">' + SD.chrome.icon(c.icon) + "</div><h3>" + c.t + "</h3><p>" + c.d + "</p><ul>" + c.items.map((i) => "<li>" + esc(i) + "</li>").join("") + "</ul>" + (ok ? '<a class="btn btn-primary" href="' + c.page + '">Buka</a>' : '<span class="lock">Tidak tersedia untuk peran ' + auth.roleLabel(u.role).toLowerCase() + "</span>") + "</div>";
    }).join("");
    const linkBox = $("#link-box"); if (u.role === "parent" && linkBox) { linkBox.classList.remove("hidden"); const lf = $("#link-form"); lf.addEventListener("submit", (e) => { e.preventDefault(); const r = auth.linkChild(u, lf.elements.code.value); if (!r.ok) { toast(r.msg, "err"); return; } toast(r.child.name + " berhasil ditautkan."); setTimeout(() => location.reload(), 700); }); }
    const act = () => {
      let rows;
      if (u.role === "parent") rows = data.notifications(u).slice(0, 6).map((n) => ({ t: fmt.when(n.at), who: n.child, text: n.text }));
      else rows = store.state.log.filter((e) => e.type !== "access").slice(0, 6).map((e) => ({ t: fmt.when(e.at), who: (e.child ? e.child + " · " : "") + e.by, text: (e.title ? e.title + " — " : "") + e.text }));
      $("#hub-activity").innerHTML = rows.length ? rows.map((r) => "<li><time>" + r.t + "</time><div>" + esc(r.text) + '<div class="who">' + esc(r.who || "") + "</div></div></li>").join("") : '<li><div class="muted">Belum ada catatan. Aktivitas hari ini akan muncul di sini.</div></li>';
    };
    act(); SD.on("change", act);
  };

  /* ========== Dasbor Orang Tua ========== */
  P.parent = function (u) {
    const kids = auth.childrenOf(u);
    const sel = $("#child-select");
    if (!kids.length) { $("#no-child").classList.remove("hidden"); $("#dash").classList.add("hidden"); const lf = $("#link-form"); lf.addEventListener("submit", (e) => { e.preventDefault(); const r = auth.linkChild(u, lf.elements.code.value); if (!r.ok) { toast(r.msg, "err"); return; } toast(r.child.name + " berhasil ditautkan."); setTimeout(() => location.reload(), 700); }); return; }
    sel.innerHTML = kids.map((c) => '<option value="' + c.id + '">' + esc(c.name) + " · " + c.age + "</option>").join(""); sel.classList.toggle("hidden", kids.length < 2);
    const pref = store.pref(u.id, "child"); if (pref && kids.some((c) => c.id === pref)) sel.value = pref;
    let camId = "K1"; let child = data.child(sel.value);
    const th = () => store.state.settings;

    const renderSummary = () => {
      const at = data.attendance(child), cons = data.consumedSoFar(child), temps = data.temps(child), lastT = temps[temps.length - 1];
      const room = live.air.find((a) => a.room === child.room) || live.air[0];
      const st = at.state === "present" ? { text: "Hadir sejak " + at.at, cls: "ok" } : at.state === "home" ? { text: "Sudah dijemput " + at.at, cls: "accent" } : { text: "Belum tiba", cls: "warn" };
      $("#child-card").innerHTML = '<div class="avatar lg">' + fmt.initials(child.name) + '</div><div><div class="nm">' + esc(child.name) + '</div><div class="meta">' + child.age + " · Pengasuh " + esc(child.caregiver) + " · " + esc(child.room) + '</div><div class="flags">' + badge(st) + (child.allergies !== "Tidak ada" ? '<span class="flag allergy">Alergi: ' + esc(child.allergies) + "</span>" : "") + (child.meds ? '<span class="flag med">Obat: ' + esc(child.meds) + "</span>" : "") + "</div></div>";
      const tSt = lastT ? (lastT.v >= th().bodyTempHigh ? "Tinggi — dipantau" : lastT.v >= th().bodyTempWatch ? "Sedikit di atas normal" : "Normal") : "Belum diukur";
      $("#sum-metrics").innerHTML =
        '<div class="metric"><div class="k">Suhu tubuh terakhir</div><div class="v">' + (lastT ? fmt.num(lastT.v, 1) + "<small>°C</small>" : "—") + '</div><div class="s">' + (lastT ? "Pukul " + lastT.t + " · " + tSt : "Diukur saat tiba") + "</div></div>" +
        '<div class="metric"><div class="k">Energi hari ini</div><div class="v">' + fmt.num(cons.kcal) + "<small> kkal</small></div><div class=\"s\">" + Math.round((cons.kcal / child.target.kcal) * 100) + "% dari kebutuhan harian " + fmt.num(child.target.kcal) + ' kkal</div><div class="metric-bar"><i style="width:' + Math.min(100, Math.round((cons.kcal / child.target.kcal) * 100)) + '%"></i></div></div>' +
        '<div class="metric"><div class="k">Udara ' + esc((SEED.rooms.find((r) => r.name === child.room) || {}).short || "ruangan") + '</div><div class="v" id="m-air">' + fmt.num(room.temp, 1) + "<small>°C</small></div><div class=\"s\" id=\"m-air-s\">Kelembapan " + room.hum + "% · " + live.status(room).text + "</div></div>" +
        '<div class="metric"><div class="k">Kamera</div><div class="v">' + SEED.cameras.filter((c) => c.parents).length + '<small> ruangan</small></div><div class="s">Aktif · diperbarui <span data-rel="' + new Date(room.at).toISOString() + '">baru saja</span></div></div>';
      const tl = data.timeline(child), up = data.upcoming(child);
      $("#child-timeline").innerHTML = (tl.length ? tl.map((t) => '<li class="' + t.cls + '"><time>' + t.t + '</time><div class="tt">' + esc(t.title) + '</div><div class="td">' + esc(t.desc) + "</div></li>").join("") : '<li><div class="td">Belum ada aktivitas. Anak biasanya tiba pukul ' + child.checkin + ".</div></li>") +
        (up.length ? '<li class="t-up"><time>Berikutnya</time><div class="td">' + esc(up[0].title) + " sekitar pukul " + up[0].t + "</div></li>" : "");
    };
    const renderNotif = () => {
      const list = data.notifications(u);
      const last = store.pref(u.id, "lastRead") || 0;
      $("#notif-list").innerHTML = list.length ? list.map((n) => '<div class="notif n-' + n.sev + '"><div class="nh"><span><span class="sev ' + sevCls(n.sev) + '">' + sevText(n.sev) + "</span> &nbsp;<b>" + esc(n.child) + "</b>" + (new Date(n.at).getTime() > last ? ' <span class="status-pill on">Baru</span>' : "") + "</span><time>" + fmt.when(n.at) + "</time></div><p>" + esc(n.text) + "</p></div>").join("") : '<div class="empty-state">Belum ada pemberitahuan hari ini.</div>';
      $("#notif-count").textContent = list.length + " pemberitahuan · " + list.filter((n) => n.sev === "high").length + " penting";
    };
    const renderCam = () => {
      const cam = SEED.cameras.find((c) => c.id === camId);
      $("#stream-img").src = cam.img; $("#stream-img").alt = "Tampilan " + cam.label + " — " + cam.room;
      $("#stream-title").textContent = cam.room;
      $("#stream-chip").innerHTML = '<span class="rec"></span>' + cam.label + " · Langsung";
      $$("[data-cam]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cam === camId)));
      const subs = live.subjectsFor(camId, u, child.id);
      const here = subs.some((s) => !s.blur), at = data.attendance(child);
      $("#stream-note").textContent = at.state === "away" ? child.short + " belum tiba. Namanya tampil setelah pengasuh menandai kedatangan." : at.state === "home" ? child.short + " sudah dijemput pukul " + at.at + "." : here ? child.short + " terlihat di " + cam.room + "." : child.short + " sedang tidak di " + cam.room + ". Lokasi terakhir: " + child.room + ".";
      live.overlay($("#stream-canvas"), { subjects: subs });
      store.add({ type: "access", by: u.name, role: u.role, text: "Membuka " + cam.label + " (" + cam.room + ")", purpose: "Akses rutin", sev: "low", silent: true });
    };
    /* Makan & gizi: catatan makan dari pengasuh (dipindai) dan makan siang terjadwal */
    let foodSel = null;
    const mealsToday = () => {
      const list = data.meals(child.id).map((e) => ({ id: e.id, at: e.at, label: e.meal || (e.title || "Makan").replace(/\s\d+% porsi$/, ""), entry: e }));
      if (data.lunchDone(child)) list.push({ id: "seed", at: SD.time.todayAt(child.nutrition.lunch.scannedPost).toISOString(), label: "Makan siang", entry: null });
      return list.sort((a, b) => new Date(b.at) - new Date(a.at));
    };
    const drawBoxes = (cv, img, boxes) => { if (!cv) return; if (!boxes || !boxes.length || !SD.vision) { cv.width = 0; cv.height = 0; return; } const paint = () => SD.vision.draw(cv, { items: boxes.map((b) => ({ name: b.name, box: b.box })) }, { media: img }); if (img.complete && img.naturalWidth) paint(); else img.onload = paint; };
    const renderFood = () => {
      const list = mealsToday(), pend = data.pendingPlates(child.id), L = child.nutrition.lunch;
      const wait = $("#food-wait");
      if (pend.length) { const p = pend[0]; wait.classList.remove("hidden"); wait.innerHTML = "<b>" + esc(p.meal) + " " + child.short + " disajikan pukul " + fmt.time(p.at) + ":</b> " + esc(p.items.map((i) => i.name.toLowerCase() + " " + i.grams + " g").join(", ")) + ". Hasilnya muncul otomatis setelah pengasuh memindai piring sesudah makan."; }
      else if (!list.length) { wait.classList.remove("hidden"); wait.innerHTML = "<b>Belum ada catatan makan hari ini.</b> Makan siang biasanya disajikan pukul " + L.served + "; pengasuh memindai piring saat disajikan dan sesudah makan, lalu hasilnya muncul di sini."; }
      else wait.classList.add("hidden");
      $("#food-body").classList.toggle("hidden", !list.length);
      const sw = $("#food-switch"); sw.hidden = list.length < 2;
      if (!list.length) { renderIntake(); return; }
      if (!foodSel || !list.some((m) => m.id === foodSel)) foodSel = list[0].id;
      sw.innerHTML = list.map((m) => '<button type="button" data-meal="' + m.id + '" aria-pressed="' + String(m.id === foodSel) + '">' + esc(m.label) + " · " + fmt.time(m.at) + "</button>").join("");
      $$("button", sw).forEach((b) => b.addEventListener("click", () => { foodSel = b.dataset.meal; renderFood(); }));
      const m = list.find((x) => x.id === foodSel);
      const imgPre = $("#food-img-pre"), imgPost = $("#food-img-post"), photos = $("#food-photos"), tbody = $("#food-table tbody");
      const row = (i) => "<tr><td>" + esc(i.name) + '</td><td class="num">' + i.pre + '</td><td class="num">' + i.post + '</td><td class="num">' + (i.pre - i.post) + '</td><td class="num">' + i.kcal + '</td><td class="num">' + fmt.num(i.protein, 1) + "</td></tr>";
      const tot = (T) => '<tr><th>Total</th><th class="num">' + T.pre + '</th><th class="num">' + T.post + '</th><th class="num">' + (T.pre - T.post) + '</th><th class="num">' + T.kcal + '</th><th class="num">' + fmt.num(T.protein, 1) + "</th></tr>";
      $("#food-title").textContent = m.label + " hari ini";
      if (!m.entry) {
        const T = data.lunchTotals(child);
        $("#food-head").innerHTML = "<b>" + T.pct + "% porsi habis</b> · sekitar " + fmt.num(T.kcal) + " kkal · protein " + fmt.num(T.protein, 1) + " g · pukul " + L.served + "–" + L.scannedPost;
        photos.hidden = false; photos.classList.remove("is-scan"); imgPre.src = "assets/img/plate-before.jpg"; imgPost.src = "assets/img/plate-after.jpg"; drawBoxes($("#food-cv-pre"), imgPre, []); drawBoxes($("#food-cv-post"), imgPost, []);
        $("#food-cap-pre").textContent = "Saat disajikan · " + L.served; $("#food-cap-post").textContent = "Sesudah makan · " + L.scannedPost;
        tbody.innerHTML = L.items.map(row).join("") + tot(T); $("#food-left").textContent = L.leftover;
        $("#food-src").textContent = "Dicatat oleh " + child.caregiver + ". Berat per menu dari piring saat disajikan dan sesudah makan; nilai gizi per 100 g dari tabel komposisi pangan.";
      } else {
        const e = m.entry, T = e.totals;
        $("#food-head").innerHTML = "<b>" + e.pct + "% porsi habis</b> · sekitar " + fmt.num(e.kcal) + " kkal" + (T ? " · protein " + fmt.num(T.protein, 1) + " g" : "") + " · pukul " + (e.preAt ? fmt.time(e.preAt) + "–" : "") + fmt.time(e.at);
        const hasPhoto = e.photoPre || e.photoPost; photos.hidden = !hasPhoto; photos.classList.add("is-scan");
        if (hasPhoto) { imgPre.src = e.photoPre || ""; imgPost.src = e.photoPost || ""; imgPre.parentElement.parentElement.hidden = !e.photoPre; imgPost.parentElement.parentElement.hidden = !e.photoPost; drawBoxes($("#food-cv-pre"), imgPre, e.boxesPre); drawBoxes($("#food-cv-post"), imgPost, e.boxesPost); $("#food-cap-pre").textContent = "Saat disajikan · " + (e.preAt ? fmt.time(e.preAt) : ""); $("#food-cap-post").textContent = "Sesudah makan · " + fmt.time(e.at); }
        if (e.items && e.items.length) { tbody.innerHTML = e.items.map(row).join("") + tot(T); $("#food-table").parentElement.hidden = false; }
        else { $("#food-table").parentElement.hidden = true; }
        const left = (e.items || []).slice().sort((a, b) => b.post - a.post)[0];
        $("#food-left").textContent = left && left.post > 0 ? "Sisa terbanyak: " + left.name.toLowerCase() + " (" + left.post + " g)." : e.items ? "Piring habis." : e.text;
        $("#food-src").textContent = "Dipindai dengan kamera oleh " + e.by + ". Menu dan berat dikenali otomatis dari foto, lalu diperiksa pengasuh sebelum dikirim. Nilai gizi per 100 g dari tabel komposisi pangan.";
      }
      renderIntake();
    };
    const renderIntake = () => {
      const c = data.consumedSoFar(child), t = child.target;
      $("#macros").innerHTML = [["Energi", c.kcal, t.kcal, "kkal"], ["Protein", c.protein, t.protein, "g"], ["Karbohidrat", c.carbs, t.carbs, "g"], ["Lemak", c.fat, t.fat, "g"]].map((m) => { const p = Math.min(100, Math.round((m[1] / m[2]) * 100)); return '<div class="progress"><div class="plabel"><span>' + m[0] + "</span><span class=\"pct\">" + fmt.num(m[1], m[3] === "g" ? 1 : 0) + " / " + m[2] + " " + m[3] + " · " + p + '%</span></div><div class="track"><i style="width:' + p + '%"></i></div></div>'; }).join("");
      const vals = child.weekly.slice(); vals[6] = (data.lunchDone(child) ? child.weekly[6] : 0) + data.loggedIntake(child, "Makan siang").kcal;
      SD.chart.bars($("#weekly-chart"), data.weekLabels(), vals, { highlight: 6, max: Math.max(400, Math.ceil(Math.max.apply(null, vals) / 100) * 100) });
      $("#weekly-cap").textContent = vals[6] ? "Hari ini " + vals[6] + " kkal · rata-rata 7 hari " + Math.round(vals.filter(Boolean).reduce((a, b) => a + b, 0) / vals.filter(Boolean).length) + " kkal. Batang gelap adalah hari ini." : "Hari ini belum ada data makan siang.";
    };
    const renderHealth = () => {
      const temps = data.temps(child);
      $("#temp-table tbody").innerHTML = temps.length ? temps.map((t) => "<tr><td class=\"mono\">" + t.t + '</td><td class="num">' + fmt.num(t.v, 1) + " °C</td><td>" + (t.v >= th().bodyTempHigh ? '<span class="sev sev-high">Tinggi</span>' : t.v >= th().bodyTempWatch ? '<span class="sev sev-medium">Pantau</span>' : '<span class="sev sev-low">Normal</span>') + "</td><td>" + esc(t.by) + "</td></tr>").join("") : '<tr><td colspan="4" class="muted">Belum ada pengukuran hari ini.</td></tr>';
      const meds = data.meds().filter((m) => m.childId === child.id);
      $("#med-list").innerHTML = meds.length ? meds.map((m) => '<div class="notif n-low"><div class="nh"><b>' + esc(m.med) + " · " + esc(m.dose) + "</b><time>" + m.t + "</time></div><p>Diberikan oleh " + esc(m.by) + (m.note ? ". " + esc(m.note) : "") + "</p></div>").join("") : '<div class="empty-state">' + (child.meds ? "Jadwal: " + esc(child.meds) + ". Pemberian akan tercatat di sini." : "Tidak ada obat terjadwal hari ini.") + "</div>";
      $("#health-kv").innerHTML = "<dt>Alergi</dt><dd>" + esc(child.allergies) + "</dd><dt>Obat terjadwal</dt><dd>" + esc(child.meds || "Tidak ada") + "</dd><dt>Tanggal lahir</dt><dd>" + new Date(child.dob).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) + "</dd><dt>Pengasuh utama</dt><dd>" + esc(child.caregiver) + "</dd><dt>Kontak darurat</dt><dd>" + child.emergency.map((e) => esc(e.n) + " — " + esc(e.p)).join("<br>") + "</dd>";
    };
    const renderReport = () => {
      const T = data.lunchTotals(child), c = data.consumedSoFar(child), temps = data.temps(child), tl = data.timeline(child), inc = data.incidents().filter((i) => i.childId === child.id);
      $("#report").innerHTML = "<h3>Laporan harian — " + esc(child.name) + "</h3><p class=\"muted\">" + fmt.date() + " · " + esc(SEED.facility.name) + " · dicetak " + fmt.time(new Date()) + '</p><dl class="kv"><dt>Kehadiran</dt><dd>' + (data.attendance(child).state === "away" ? "Belum tiba" : "Tiba pukul " + data.attendance(child).at) + "</dd><dt>Suhu tubuh</dt><dd>" + (temps.map((t) => t.t + " " + fmt.num(t.v, 1) + "°C").join(", ") || "Belum diukur") + "</dd><dt>Makan</dt><dd>" + ((data.lunchDone(child) ? ["Makan siang " + T.pct + "% porsi, sekitar " + T.kcal + " kkal. " + esc(child.nutrition.lunch.leftover)] : []).concat(data.meals(child.id).slice().reverse().map((e) => esc(e.title) + ", sekitar " + e.kcal + " kkal (" + fmt.time(e.at) + "). " + esc(e.text.replace(/^Sekitar [^.]*\.\s*/, "")))).join("<br>") || "Belum ada catatan makan") + "</dd><dt>Energi total hari ini</dt><dd>" + fmt.num(c.kcal) + " kkal dari kebutuhan " + fmt.num(child.target.kcal) + " kkal</dd><dt>Kejadian</dt><dd>" + (inc.length ? inc.map((i) => i.t + " " + esc(i.type) + " — " + (i.resolved ? "ditangani " + esc(i.by) : "sedang ditangani")).join("<br>") : "Tidak ada") + "</dd></dl><h4 style=\"margin-top:18px\">Aktivitas</h4><ul class=\"timeline\">" + tl.map((t) => '<li class="' + t.cls + '"><time>' + t.t + '</time><div class="tt">' + esc(t.title) + '</div><div class="td">' + esc(t.desc) + "</div></li>").join("") + "</ul>";
    };
    const renderAll = () => { renderSummary(); renderNotif(); renderFood(); renderHealth(); renderReport(); };
    renderAll(); renderCam();
    sel.addEventListener("change", () => { child = data.child(sel.value); store.pref(u.id, "child", child.id); renderAll(); renderCam(); });
    $$("[data-cam]").forEach((b) => b.addEventListener("click", () => { camId = b.dataset.cam; renderCam(); }));
    let seenTop = store.state.log[0] ? store.state.log[0].id : null;
    SD.on("change", (e) => {
      renderSummary(); renderNotif(); renderFood(); renderHealth(); renderReport();
      if (e && e.remote) { const fresh = []; for (const x of store.state.log) { if (x.id === seenTop) break; fresh.push(x); } const mine = fresh.filter((x) => !x.silent && x.type !== "access" && kids.some((k) => k.id === x.childId)); if (mine.length) toast(mine[0].child.split(" ")[0] + ": " + (mine[0].title || mine[0].text)); }
      seenTop = store.state.log[0] ? store.state.log[0].id : null;
    });
    SD.on("air", () => { const room = live.air.find((a) => a.room === child.room) || live.air[0]; const m = $("#m-air"); if (m) { m.innerHTML = fmt.num(room.temp, 1) + "<small>°C</small>"; $("#m-air-s").textContent = "Kelembapan " + room.hum + "% · " + live.status(room).text; } });
    SD.on("tab", (id) => { if (id === "tab-notif") { store.pref(u.id, "lastRead", Date.now()); SD.chrome.refreshBell(u); setTimeout(renderNotif, 400); } if (id === "tab-gizi") renderFood(); });
    addEventListener("resize", renderIntake);
  };

  /* ========== Dasbor Pengasuh ========== */
  P.caregiver = function (u) {
    const kids = SEED.children; const th = () => store.state.settings;
    const kidOpts = () => kids.map((c) => '<option value="' + c.id + '">' + esc(c.name) + "</option>").join("");
    $$("select[data-kids]").forEach((s) => (s.innerHTML = kidOpts()));
    const renderSummary = () => {
      const present = kids.filter((c) => data.attendance(c).state === "present").length;
      const watch = kids.filter((c) => { const t = data.temps(c); return t.length && t[t.length - 1].v >= th().bodyTempWatch; }).length;
      const open = data.incidents().filter((i) => !i.resolved).length;
      $("#cg-metrics").innerHTML = '<div class="metric"><div class="k">Hadir sekarang</div><div class="v">' + present + "<small> / " + kids.length + '</small></div><div class="s">Anak terdaftar hari ini</div></div><div class="metric"><div class="k">Suhu perlu pantau</div><div class="v">' + watch + '</div><div class="s">Di atas ' + fmt.num(th().bodyTempWatch, 1) + " °C pada pengukuran terakhir</div></div><div class=\"metric\"><div class=\"k\">Obat diberikan</div><div class=\"v\">" + data.meds().length + '</div><div class="s">Tercatat hari ini</div></div><div class="metric"><div class="k">Kejadian terbuka</div><div class="v">' + open + '</div><div class="s">' + (open ? "Perlu ditandai selesai" : "Semua sudah ditangani") + "</div></div>";
    };
    const renderTiles = () => {
      $("#tiles").innerHTML = kids.map((c) => {
        const at = data.attendance(c), temps = data.temps(c), lt = temps[temps.length - 1];
        const cls = at.state === "present" ? (lt && lt.v >= th().bodyTempWatch ? "attention" : "present") : at.state;
        const stat = at.state === "present" ? "Hadir sejak " + at.at : at.state === "home" ? "Dijemput " + at.at : "Belum tiba";
        const pill = at.state === "present" ? (cls === "attention" ? '<span class="badge warn"><span class="dot"></span>Pantau</span>' : '<span class="badge ok"><span class="dot"></span>Hadir</span>') : at.state === "home" ? '<span class="badge"><span class="dot"></span>Pulang</span>' : '<span class="badge"><span class="dot"></span>Belum tiba</span>';
        return '<div class="tile ' + cls + '"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div class="nm">' + esc(c.name) + "</div>" + pill + '</div><div class="meta">' + c.age + " · " + esc(c.room) + "<br>" + stat + (lt ? " · " + fmt.num(lt.v, 1) + " °C pukul " + lt.t : "") + (c.allergies !== "Tidak ada" ? '<br><span class="flag allergy">Alergi ' + esc(c.allergies) + "</span>" : "") + '</div><div class="acts">' +
          (at.state !== "present" ? '<button class="btn btn-sm btn-primary" data-act="checkin" data-id="' + c.id + '">Tandai tiba</button>' : '<button class="btn btn-sm" data-act="temp" data-id="' + c.id + '">Suhu</button><button class="btn btn-sm" data-scan="' + c.id + '">Pindai piring</button><button class="btn btn-sm" data-act="note" data-id="' + c.id + '">Catatan</button><button class="btn btn-sm btn-dark" data-act="checkout" data-id="' + c.id + '">Pulang</button>') + "</div></div>";
      }).join("");
      $$("[data-act]").forEach((b) => b.addEventListener("click", () => openAct(b.dataset.act, b.dataset.id)));
      $$("[data-scan]").forEach((b) => b.addEventListener("click", () => { const f = $("#scan-form"); f.elements.child.value = b.dataset.scan; f.elements.child.dispatchEvent(new Event("change")); const tabBtn = $('button[data-tab="tab-timbang"]'); if (tabBtn) tabBtn.click(); scrollTo({ top: 0, behavior: "smooth" }); }));
    };
    const m = $("#act-modal"), mf = $("#act-form"), mt = $("#act-title"), mb = $("#act-fields");
    let act = null, actChild = null;
    const openAct = (a, id) => {
      act = a; actChild = data.child(id); mt.textContent = { checkin: "Tandai tiba — ", temp: "Catat suhu — ", note: "Catatan untuk orang tua — ", checkout: "Pulang — " }[a] + actChild.short;
      mb.innerHTML = a === "checkin" ? '<div class="field"><label for="f-temp">Suhu tubuh (°C)</label><input id="f-temp" name="temp" type="number" step="0.1" min="34" max="42" required placeholder="36,6"></div><div class="field"><label for="f-by">Diantar oleh</label><input id="f-by" name="who" required placeholder="cth. Ibu"></div><div class="field"><label for="f-cond">Kondisi saat tiba</label><select id="f-cond" name="cond"><option>Baik, aktif</option><option>Mengantuk</option><option>Rewel</option><option>Batuk/pilek ringan</option></select></div>'
        : a === "temp" ? '<div class="field"><label for="f-temp">Suhu tubuh (°C)</label><input id="f-temp" name="temp" type="number" step="0.1" min="34" max="42" required placeholder="36,6"></div>'
        : a === "note" ? '<div class="field"><label for="f-note">Catatan</label><textarea id="f-note" name="note" required placeholder="cth. Kirana senang bermain balok hari ini"></textarea></div>'
        : '<div class="field"><label for="f-by">Dijemput oleh</label><input id="f-by" name="who" required placeholder="cth. Ayah"></div><div class="field"><label for="f-note">Pesan singkat (opsional)</label><input id="f-note" name="note" placeholder="cth. Bekal tidak habis, dibawa pulang"></div>';
      SD.chrome.openModal("act-modal");
    };
    mf.addEventListener("submit", (e) => {
      e.preventDefault(); const c = actChild, fd = new FormData(mf);
      if (act === "checkin") { const t = parseFloat(fd.get("temp")); const sev = t >= th().bodyTempHigh ? "high" : t >= th().bodyTempWatch ? "medium" : "low"; store.add({ type: "checkin", childId: c.id, child: c.name, by: u.name, role: u.role, sev, title: "Tiba, suhu " + fmt.num(t, 1) + "°C", text: "Diantar oleh " + fd.get("who") + ". Kondisi: " + fd.get("cond") + "." + (sev !== "low" ? " Suhu di atas batas pantau, dicek ulang tiap 30 menit." : "") }); toast(c.short + " ditandai tiba. Orang tua diberi tahu."); }
      if (act === "temp") { const t = parseFloat(fd.get("temp")); const sev = t >= th().bodyTempHigh ? "high" : t >= th().bodyTempWatch ? "medium" : "low"; store.add({ type: "temp", childId: c.id, child: c.name, by: u.name, role: u.role, sev, value: t, title: "Suhu tubuh " + fmt.num(t, 1) + "°C", text: sev === "high" ? "Di atas " + th().bodyTempHigh + "°C. Orang tua dihubungi untuk penjemputan lebih awal." : sev === "medium" ? "Sedikit di atas normal. Dicek ulang 30 menit lagi." : "Normal." }); toast("Suhu " + c.short + " tercatat."); }
      if (act === "note") { store.add({ type: "note", childId: c.id, child: c.name, by: u.name, role: u.role, sev: "low", title: "Catatan pengasuh", text: String(fd.get("note")) }); toast("Catatan terkirim ke orang tua " + c.short + "."); }
      if (act === "checkout") { store.add({ type: "checkout", childId: c.id, child: c.name, by: u.name, role: u.role, sev: "low", title: "Dijemput oleh " + fd.get("who"), text: String(fd.get("note") || "Pulang dalam kondisi baik.") }); toast(c.short + " ditandai pulang."); }
      m.classList.remove("open"); mf.reset();
    });

    /* Pindai piring */
    const VZ = SD.vision; const foods = () => store.state.foods;
    const sf = $("#scan-form"), video = $("#scan-video"), photo = $("#scan-photo"), canvas = $("#scan-canvas"), vfEmpty = $("#vf-empty"), chip = $("#scan-chip"), resBox = $("#scan-result"), stagesEl = $("#scan-stages"), stageHint = $("#scan-stage-hint"), scanBtn = $("#scan-btn"), camBtn = $("#cam-start"), flipBtn = $("#cam-flip");
    let stage = "pre", source = null, camOn = false, frozen = false, result = null, rows = [], thumbSmall = null;
    const curChild = () => data.child(sf.elements.child.value), curMeal = () => sf.elements.meal.value;
    const pendingFor = (childId, meal) => data.pendingPlates(childId).find((p) => p.meal === meal);
    const mealsOf = (n) => n.map((i) => i.name + " " + i.grams + " g").join(", ");
    const hintStage = () => {
      const c = curChild(), meal = curMeal(), p = pendingFor(c.id, meal);
      if (stage === "pre") stageHint.textContent = p ? "Piring " + c.short + " untuk " + meal.toLowerCase() + " sudah dipindai pukul " + fmt.time(p.at) + ". Memindai lagi akan menggantikannya." : "Pindai piring saat disajikan, sebelum anak mulai makan.";
      else stageHint.textContent = p ? "Dibandingkan dengan piring saat disajikan pukul " + fmt.time(p.at) + ": " + mealsOf(p.items) + "." : "Belum ada pindaian saat disajikan untuk " + c.short + " (" + meal.toLowerCase() + "). Pindai piring sebelum makan terlebih dahulu.";
    };
    const setStage = (st) => { stage = st; $$("#scan-stage button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stage === st))); hintStage(); if (result && !resBox.hidden) renderResult(); };
    const autoStage = () => setStage(pendingFor(sf.elements.child.value, curMeal()) ? "post" : "pre");
    $$("#scan-stage button").forEach((b) => b.addEventListener("click", () => setStage(b.dataset.stage)));
    sf.elements.child.addEventListener("change", autoStage); sf.elements.meal.addEventListener("change", autoStage);
    autoStage();

    const showSource = (kind) => {
      source = kind; frozen = false;
      video.hidden = kind !== "camera"; photo.hidden = kind !== "photo"; vfEmpty.hidden = !!kind; chip.hidden = kind !== "camera";
      scanBtn.disabled = !kind; VZ.draw(canvas, null, { guide: kind === "camera" });
    };
    const startCam = async () => {
      if (!VZ.camera.supported()) { toast("Kamera tidak tersedia di peramban ini. Gunakan Pilih foto.", "err"); return; }
      camBtn.disabled = true; camBtn.textContent = "Menyalakan…";
      try { await VZ.camera.start(video); camOn = true; showSource("camera"); camBtn.textContent = "Matikan kamera"; flipBtn.hidden = (await VZ.camera.count()) < 2; }
      catch (e) { camBtn.textContent = "Nyalakan kamera"; toast(e && e.name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan kamera di peramban, atau gunakan Pilih foto." : "Kamera tidak bisa dibuka. Anda tetap bisa memilih foto piring.", "err"); }
      camBtn.disabled = false;
    };
    const stopCam = () => { VZ.camera.stop(video); camOn = false; camBtn.textContent = "Nyalakan kamera"; flipBtn.hidden = true; if (source === "camera") { if (frozen) source = "photo"; else showSource(null); } };
    camBtn.addEventListener("click", () => (camOn ? stopCam() : startCam()));
    flipBtn.addEventListener("click", async () => { VZ.camera.flip(); await startCam(); });
    const loadPhoto = (url, done) => { photo.onload = () => { photo.onload = photo.onerror = null; done(true); }; photo.onerror = () => { photo.onload = photo.onerror = null; done(false); }; photo.src = url; };
    $("#scan-file").addEventListener("change", () => {
      const f = $("#scan-file").files[0]; if (!f) return; const url = URL.createObjectURL(f); $("#scan-file").value = "";
      loadPhoto(url, (ok) => { URL.revokeObjectURL(url); if (!ok) { toast("Berkas itu bukan gambar yang bisa dibaca.", "err"); return; } if (camOn) { VZ.camera.stop(video); camOn = false; camBtn.textContent = "Nyalakan kamera"; flipBtn.hidden = true; } showSource("photo"); resBox.hidden = true; stagesEl.hidden = true; });
    });
    SD.on("tab", (id) => { if (id !== "tab-timbang" && camOn) stopCam(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden && camOn) stopCam(); });
    addEventListener("pagehide", () => VZ.camera.stop(video));

    /* Pindai: ambil bingkai, kenali makanan, tampilkan hasil yang bisa dikoreksi */
    const STAGES = ["Membaca warna dan tekstur", "Mencari piring", "Mengenali makanan", "Menghitung porsi"];
    scanBtn.addEventListener("click", async () => {
      const src = source === "camera" ? video : photo;
      if (!src || (source === "camera" && video.readyState < 2)) { toast("Gambar belum siap. Tunggu sebentar.", "err"); return; }
      if (stage === "post" && !pendingFor(sf.elements.child.value, curMeal())) { toast("Pindai piring saat disajikan terlebih dahulu.", "err"); setStage("pre"); return; }
      scanBtn.disabled = true; resBox.hidden = true; stagesEl.hidden = false; stagesEl.innerHTML = STAGES.map((x) => "<li>" + x + "</li>").join("");
      const li = $$("li", stagesEl);
      try {
        /* satu bingkai yang sama dipakai untuk analisis, foto beku, dan gambar kecil yang disimpan */
        const grab = source === "camera" ? VZ.frame(video, 720) : null; const base = grab ? grab.canvas : src;
        const still = grab ? grab.canvas.toDataURL("image/jpeg", 0.85) : null;
        thumbSmall = VZ.thumb(base, 240, 0.62);
        result = await VZ.analyze(base, { plateCm: th().plateDiameterCm || 22, stage, onStage: (name, i) => new Promise((ok) => { li.forEach((el, k) => { el.className = k < i ? "done" : k === i ? "now" : ""; }); setTimeout(ok, i ? 140 : 40); }) });
        li.forEach((el) => { el.className = "done"; });
        rows = result.items.map((i) => ({ name: i.name, grams: i.grams, family: i.family, conf: i.conf, cat: i.cat }));
        const show = () => { VZ.draw(canvas, result, { media: photo.hidden ? video : photo }); renderResult(); };
        if (still) loadPhoto(still, () => { photo.hidden = false; video.hidden = true; chip.hidden = true; frozen = true; show(); }); else show();
        if (!result.items.length) toast("Tidak ada makanan yang dikenali. Coba dekatkan kamera atau tambah menu secara manual.", "err");
      } catch (e) { console.error(e); toast("Pindaian gagal dibaca. Coba lagi.", "err"); stagesEl.hidden = true; }
      scanBtn.disabled = false;
    });
    const resume = () => { resBox.hidden = true; stagesEl.hidden = true; result = null; rows = []; if (camOn) showSource("camera"); else if (source === "photo" && !frozen) showSource("photo"); else showSource(null); };

    const renderResult = () => {
      const c = curChild(), meal = curMeal(); const nut = VZ.nutrition(rows, foods());
      const pend = stage === "post" ? pendingFor(c.id, meal) : null, isPost = !!pend;
      const opts = (sel) => foods().map((f) => "<option" + (f.name === sel ? " selected" : "") + ">" + esc(f.name) + "</option>").join("") + (foods().some((f) => f.name === sel) ? "" : "<option selected>" + esc(sel) + "</option>");
      const lvl = result.level, lvlCls = lvl === "tinggi" ? "ok" : lvl === "sedang" ? "warn" : "danger";
      let h = '<div class="scan-head"><div><b>' + (!isPost ? "Piring " + esc(c.short) + " saat disajikan" : "Sisa piring " + esc(c.short)) + " · " + esc(meal) + '</b><div class="muted">' + (result.items.length ? result.items.length + " menu dikenali dari foto" : "Tidak ada makanan yang dikenali") + (result.plate.found ? "" : " · piring tidak ditemukan di foto, perkiraan berat kurang tepat") + "</div></div>" + (result.items.length ? '<span class="badge ' + lvlCls + '"><span class="dot"></span>Keyakinan ' + lvl + "</span>" : "") + "</div>";
      h += '<div class="scan-rows"><div class="scan-row head"><div>Menu</div><div>Berat (g)</div><div class="out">Energi</div><div></div></div>' + nut.items.map((it, i) => '<div class="scan-row"><div class="menu"><select data-i="' + i + '" data-k="name" aria-label="Menu">' + opts(it.name) + "</select>" + (rows[i].conf ? '<span class="conf">Dikenali otomatis · keyakinan ' + VZ.level(rows[i].conf) + "</span>" : '<span class="conf">Ditambahkan manual</span>') + '</div><label class="gram"><input data-i="' + i + '" data-k="grams" type="number" min="0" step="5" value="' + it.grams + '" aria-label="Berat gram"><span>g</span></label><div class="out">' + it.kcal + ' kkal</div><button type="button" class="btn btn-sm btn-ghost" data-del="' + i + '" aria-label="Hapus baris">✕</button></div>').join("") + (nut.items.length ? "" : '<div class="scan-row" style="grid-template-columns:1fr"><span class="muted">Belum ada menu. Tambahkan secara manual.</span></div>') + "</div>";
      h += '<div class="scan-tot"><div><b>' + nut.total.grams + ' g</b><span>Total berat</span></div><div><b>' + nut.total.kcal + ' kkal</b><span>Energi</span></div><div><b>' + fmt.num(nut.total.protein, 1) + ' g</b><span>Protein</span></div><div><b>' + fmt.num(nut.total.carbs, 1) + ' g</b><span>Karbohidrat</span></div><div><b>' + fmt.num(nut.total.fat, 1) + " g</b><span>Lemak</span></div></div>";
      let cons = null;
      if (stage === "post" && !isPost) h += '<p class="inline-note" style="margin-top:12px">Belum ada pindaian saat disajikan untuk ' + esc(c.short) + " (" + esc(meal.toLowerCase()) + "), jadi hasil ini akan disimpan sebagai piring yang disajikan.</p>";
      if (isPost) {
        const p = pend; const m = VZ.matchLeftovers(p.items, nut.items); cons = VZ.consumption(m.rows, foods());
        h += '<div class="scan-compare"><div class="big">' + cons.total.pct + "% porsi habis · " + fmt.num(cons.total.kcal) + ' kkal</div><div class="sub">Disajikan pukul ' + fmt.time(p.at) + " · " + cons.total.pre + " g, dimakan " + (cons.total.pre - cons.total.post) + " g · protein " + fmt.num(cons.total.protein, 1) + " g, karbohidrat " + fmt.num(cons.total.carbs, 1) + " g, lemak " + fmt.num(cons.total.fat, 1) + ' g</div><table><thead><tr><th>Menu</th><th class="num"><span class="lg">Disajikan</span><span class="sm">Awal</span></th><th class="num">Sisa</th><th class="num"><span class="lg">Dimakan</span><span class="sm">Makan</span></th><th class="num">kkal</th></tr></thead><tbody>' + cons.items.map((i) => "<tr><td>" + esc(i.name) + '</td><td class="num">' + i.pre + ' g</td><td class="num">' + i.post + ' g</td><td class="num">' + i.eaten + ' g</td><td class="num">' + i.kcal + "</td></tr>").join("") + "</tbody></table>" + (m.unmatched.length ? '<p class="sub" style="margin-top:10px">Tidak ada saat disajikan, diabaikan: ' + esc(m.unmatched.join(", ")) + ".</p>" : "") + "</div>";
      }
      h += '<div class="scan-foot"><button class="btn btn-primary" type="button" id="scan-save">' + (!isPost ? "Simpan piring disajikan" : "Kirim ke orang tua") + '</button><button class="btn" type="button" id="scan-add">Tambah menu</button><button class="btn btn-ghost" type="button" id="scan-again">Pindai ulang</button></div>';
      h += '<p class="scan-note">Berat diperkirakan dari luas makanan di piring' + (result.plate.found ? " (piring " + (th().plateDiameterCm || 22) + " cm)" : "") + ". Ubah menu atau berat bila perlu; yang tersimpan adalah angka setelah Anda periksa.</p>";
      resBox.innerHTML = h; resBox.hidden = false;
      $$("select[data-k], input[data-k]", resBox).forEach((el) => el.addEventListener("change", () => { const r = rows[+el.dataset.i]; if (el.dataset.k === "name") { r.name = el.value; r.conf = 0; } else r.grams = Math.max(0, Math.round(+el.value || 0)); renderResult(); }));
      $$("[data-del]", resBox).forEach((b) => b.addEventListener("click", () => { rows.splice(+b.dataset.del, 1); renderResult(); }));
      $("#scan-add").addEventListener("click", () => { const used = rows.map((r) => r.name); const f = foods().find((x) => !used.includes(x.name)) || foods()[0]; rows.push({ name: f.name, grams: 50, conf: 0 }); renderResult(); const sels = $$("select[data-k]", resBox); if (sels.length) sels[sels.length - 1].focus(); });
      $("#scan-again").addEventListener("click", resume);
      $("#scan-save").addEventListener("click", () => {
        if (!nut.items.length) { toast("Tambahkan minimal satu menu.", "err"); return; }
        const items = nut.items.map((i) => ({ name: i.name, grams: i.grams, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, family: (rows.find((r) => r.name === i.name) || {}).family || null }));
        const boxes = result.items.map((i) => ({ name: i.name, box: i.box })).filter((b) => items.some((i) => i.name === b.name));
        if (!isPost) {
          const old = pendingFor(c.id, meal); if (old) old.done = "replaced";
          store.add({ type: "plate", stage: "pre", childId: c.id, child: c.name, by: u.name, role: u.role, meal, items, total: nut.total, photo: thumbSmall, boxes, conf: result.conf, sev: "low", silent: true, title: meal + " disajikan", text: mealsOf(items) + ". Sekitar " + nut.total.kcal + " kkal bila habis." });
          toast("Piring " + c.short + " tersimpan. Pindai lagi sesudah anak selesai makan."); resume(); setStage("post");
        } else {
          const p = pend; const left = cons.items.slice().sort((a, b) => b.post - a.post)[0]; p.done = "pending";
          const entry = store.add({ type: "meal", childId: c.id, child: c.name, by: u.name, role: u.role, meal, sev: cons.total.pct < 60 ? "medium" : "low", title: meal + " " + cons.total.pct + "% porsi", text: "Sekitar " + cons.total.kcal + " kkal, protein " + fmt.num(cons.total.protein, 1) + " g." + (left && left.post > 0 ? " Sisa terbanyak: " + left.name.toLowerCase() + " (" + left.post + " g)." : " Piring habis."), kcal: cons.total.kcal, pct: cons.total.pct, items: cons.items, totals: cons.total, photoPre: p.photo || null, photoPost: thumbSmall, boxesPre: p.boxes || [], boxesPost: boxes, preAt: p.at, conf: Math.min(p.conf || 1, result.conf || 1), source: "scan" });
          p.done = entry.id; store.save(true);
          toast("Catatan " + meal.toLowerCase() + " " + c.short + " terkirim ke orang tua: " + cons.total.pct + "% porsi, " + cons.total.kcal + " kkal."); resume(); setStage("pre");
        }
      });
    };
    const renderMeals = () => {
      const ms = data.meals();
      $("#meal-log").innerHTML = ms.length ? ms.map((e) => "<li>" + (e.photoPost ? '<img class="thumb-sm" src="' + e.photoPost + '" alt="">' : "<time>" + fmt.time(e.at) + "</time>") + "<div><b>" + esc(e.child) + "</b> · " + esc(e.title) + '<div class="who">' + (e.photoPost ? fmt.time(e.at) + " · " : "") + esc(e.text) + " · " + esc(e.by) + "</div></div></li>").join("") : '<li><div class="muted">Belum ada catatan makan yang dikirim hari ini.</div></li>';
      const pend = data.pendingPlates();
      $("#plate-pending").innerHTML = pend.length ? pend.map((p) => "<li>" + (p.photo ? '<img class="thumb-sm" src="' + p.photo + '" alt="">' : "<time>" + fmt.time(p.at) + "</time>") + '<div style="flex:1;min-width:0"><b>' + esc(p.child) + "</b> · " + esc(p.meal) + '<div class="who">' + fmt.time(p.at) + " · " + esc(mealsOf(p.items)) + '</div><button class="btn btn-sm" type="button" data-scanpost="' + p.id + '" style="margin-top:8px">Pindai sesudah makan</button></div></li>').join("") : '<li><div class="muted">Tidak ada. Pindai piring saat disajikan agar muncul di sini.</div></li>';
      $$("[data-scanpost]").forEach((b) => b.addEventListener("click", () => { const p = store.state.log.find((x) => x.id === b.dataset.scanpost); if (!p) return; sf.elements.child.value = p.childId; sf.elements.meal.value = p.meal; setStage("post"); sf.scrollIntoView({ behavior: "smooth", block: "start" }); }));
      hintStage();
    };

    /* Obat */
    const medF = $("#med-form"); medF.addEventListener("submit", (e) => { e.preventDefault(); const c = data.child(medF.elements.child.value); store.add({ type: "med", childId: c.id, child: c.name, by: u.name, role: u.role, sev: "low", med: medF.elements.med.value.trim(), dose: medF.elements.dose.value.trim(), note: medF.elements.note.value.trim(), title: "Obat diberikan: " + medF.elements.med.value.trim() + " " + medF.elements.dose.value.trim(), text: medF.elements.note.value.trim() || "Sesuai catatan orang tua." }); toast("Pemberian obat " + c.short + " tercatat."); medF.reset(); });
    const renderMeds = () => { $("#med-table tbody").innerHTML = data.meds().map((m) => "<tr><td class=\"mono\">" + m.t + "</td><td>" + esc(m.child) + "</td><td>" + esc(m.med) + "</td><td>" + esc(m.dose) + "</td><td>" + esc(m.by) + "</td><td>" + esc(m.note || "") + "</td></tr>").join("") || '<tr><td colspan="6" class="muted">Belum ada pemberian obat hari ini.</td></tr>'; };

    /* Kejadian */
    const incF = $("#inc-form"); incF.addEventListener("submit", (e) => { e.preventDefault(); const c = data.child(incF.elements.child.value); store.add({ type: "incident", childId: c.id, child: c.name, by: u.name, role: u.role, room: incF.elements.room.value, sev: incF.elements.sev.value, title: incF.elements.kind.value, text: incF.elements.note.value.trim() || "Sedang ditangani oleh " + u.name + "." }); toast("Kejadian dicatat. Orang tua " + c.short + " menerima pemberitahuan."); incF.reset(); });
    const renderInc = () => {
      $("#inc-list").innerHTML = data.incidents().map((i) => '<div class="notif n-' + i.sev + '"><div class="nh"><span><span class="sev ' + sevCls(i.sev) + '">' + i.sevText + "</span> &nbsp;<b>" + esc(i.type) + "</b> · " + esc(i.child) + " · " + esc(i.room) + "</span><time>" + i.t + "</time></div><p>" + esc(i.note) + "</p><p style=\"margin-top:6px\">" + (i.resolved ? '<span class="status-pill on">Ditangani ' + esc(i.by) + (i.resolvedAt ? " · " + i.resolvedAt : "") + "</span>" : '<button class="btn btn-sm btn-primary" data-resolve="' + i.id + '">Tandai sudah ditangani</button>') + "</p></div>").join("") || '<div class="empty-state">Belum ada kejadian hari ini.</div>';
      $$("[data-resolve]").forEach((b) => b.addEventListener("click", () => { data.resolve(b.dataset.resolve, u.name); toast("Kejadian ditandai selesai."); }));
    };

    /* Serah terima */
    const hoF = $("#handover-form"); hoF.addEventListener("submit", (e) => { e.preventDefault(); store.add({ type: "handover", by: u.name, role: u.role, to: hoF.elements.to.value, sev: "low", text: hoF.elements.note.value.trim() }); toast("Catatan serah terima diteruskan."); hoF.reset(); });
    const renderHo = () => { $("#handover-list").innerHTML = data.handovers().map((h) => '<div class="notif n-low"><div class="nh"><b>' + esc(h.from) + " → " + esc(h.to) + "</b><time>" + h.t + "</time></div><p>" + esc(h.note) + "</p></div>").join("") || '<div class="empty-state">Belum ada catatan serah terima.</div>'; };
    const staff = store.state.users.filter((x) => x.role === "caregiver" && x.id !== u.id); hoF.elements.to.innerHTML = staff.map((s) => "<option>" + esc(s.name) + (s.shift ? " (" + esc(s.shift.split(" ")[0].toLowerCase()) + ")" : "") + "</option>").join("") + "<option>Admin daycare</option>";

    /* Kamera staf */
    let cam = "K1"; const paintCam = () => { const c = SEED.cameras.find((x) => x.id === cam); $("#cg-img").src = c.img; $("#cg-title").textContent = c.room; $("#cg-chip").innerHTML = '<span class="rec"></span>' + c.label + " · Langsung"; $$("[data-cam]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cam === cam))); live.overlay($("#cg-canvas"), { subjects: live.subjectsFor(cam, u), zone: cam === "K4" ? { x: 0.05, y: 0.3, w: 0.9, h: 0.62 } : null }); };
    $$("[data-cam]").forEach((b) => b.addEventListener("click", () => { cam = b.dataset.cam; paintCam(); }));
    const renderAir = () => { $("#cg-air").innerHTML = live.air.map(airRow).join(""); };

    const all = () => { renderSummary(); renderTiles(); renderMeals(); renderMeds(); renderInc(); renderHo(); };
    all(); paintCam(); renderAir();
    SD.on("change", (e) => { all(); if (e && e.remote) toast("Catatan diperbarui dari perangkat lain."); });
    SD.on("air", renderAir);
  };

  /* ========== Dasbor Admin ========== */
  P.admin = function (u) {
    const th = () => store.state.settings;
    const renderOverview = () => {
      const inc = data.incidents(), acc = data.access().filter((a) => SD.time.isToday(a.at));
      $("#ad-metrics").innerHTML = [
        ["Anak hadir", data.present() + "<small> / " + SEED.children.length + "</small>", "Dari absensi pengasuh"],
        ["Kejadian hari ini", inc.length + "<small> · " + inc.filter((i) => i.resolved).length + " ditangani</small>", inc.some((i) => !i.resolved) ? "Ada yang belum ditandai selesai" : "Semua sudah ditangani"],
        ["Kamera & sensor", "8<small> aktif</small>", "4 kamera, 4 sensor udara"],
        ["Kualitas udara", live.overall(true).text, "Terburuk: " + live.air.slice().sort((a, b) => b.co2 - a.co2)[0].room],
        ["Akses hari ini", String(acc.length), "Masuk, kamera, dan perubahan akun"],
        ["Piring dipindai", String(data.meals().length + SEED.children.filter((c) => data.lunchDone(c)).length), "Catatan makan yang sudah dikirim ke orang tua"]
      ].map((m) => '<div class="metric"><div class="k">' + m[0] + '</div><div class="v">' + m[1] + '</div><div class="s">' + m[2] + "</div></div>").join("");
    };
    const roomSel = $("#iot-room"); roomSel.innerHTML = SEED.rooms.map((r) => '<option value="' + esc(r.name) + '">' + esc(r.name) + "</option>").join("");
    const renderChart = () => { const room = roomSel.value; const h = live.history[room]; SD.chart.line($("#iot-chart"), h, { threshold: th().co2Max, unit: "ppm", labels: ["48 detik lalu", "sekarang"] }); const a = live.air.find((x) => x.room === room); $("#iot-last").textContent = "Sekarang " + a.co2 + " ppm · batas " + th().co2Max + " ppm · " + fmt.num(a.temp, 1) + " °C · " + a.hum + " % · diperbarui " + fmt.rel(new Date(a.at).toISOString()) + "."; };
    roomSel.addEventListener("change", renderChart);
    const renderDevices = () => {
      $("#cam-table tbody").innerHTML = SEED.cameras.map((c) => "<tr><td><b>" + c.label + "</b></td><td>" + esc(c.room) + '</td><td><span class="status-pill on"><span class="live-dot"></span>Aktif</span></td><td>' + (c.parents ? "Ya" : "Hanya staf") + '</td><td class="muted">' + fmt.rel(new Date(Date.now() - 1200).toISOString()) + "</td></tr>").join("");
      $("#sensor-table tbody").innerHTML = live.air.map((a, i) => { const s = SEED.sensors[i]; return "<tr><td>" + esc(a.room) + '</td><td class="num">' + fmt.num(a.temp, 1) + '</td><td class="num">' + a.hum + '</td><td class="num">' + a.co2 + '</td><td class="num">' + a.pm25 + '</td><td class="num">' + s.battery + "%</td><td>" + badge(live.status(a)) + "</td></tr>"; }).join("");
    };
    $("#check-devices").addEventListener("click", () => { const b = $("#check-devices"); b.disabled = true; progress($("#dev-progress"), 1600, () => { $("#dev-progress").style.display = "none"; b.disabled = false; toast("Semua 8 perangkat merespons. Tidak ada gangguan."); store.add({ type: "access", by: u.name, role: u.role, text: "Memeriksa koneksi perangkat", purpose: "Pemeliharaan", sev: "low" }); }); });
    const typeLabel = { incident: "Kejadian", meal: "Makan", med: "Obat", checkin: "Tiba", checkout: "Pulang", temp: "Suhu", note: "Catatan", handover: "Serah terima" };
    const renderLogs = () => {
      const t = $("#log-type").value, s = $("#log-search").value.trim().toLowerCase();
      const rows = [];
      data.incidents().forEach((i) => rows.push({ at: i.at, type: "incident", child: i.child, text: i.type + " — " + i.note + (i.resolved ? " (ditangani " + i.by + ")" : " (belum ditangani)"), by: i.reportedBy || "Sistem kamera" }));
      data.meds().forEach((m) => rows.push({ at: m.at, type: "med", child: m.child, text: m.med + " " + m.dose + (m.note ? " — " + m.note : ""), by: m.by }));
      data.handovers().forEach((h) => rows.push({ at: h.at, type: "handover", child: "—", text: h.note + " → " + h.to, by: h.from }));
      SEED.children.forEach((c) => { if (data.lunchDone(c)) { const T = data.lunchTotals(c); rows.push({ at: SD.time.todayAt(c.nutrition.lunch.scannedPost).toISOString(), type: "meal", child: c.name, text: "Makan siang " + T.pct + "% porsi, " + T.kcal + " kkal", by: c.caregiver }); } if (SD.time.past(c.checkin)) rows.push({ at: SD.time.todayAt(c.checkin).toISOString(), type: "checkin", child: c.name, text: "Tiba, suhu " + fmt.num(c.temps[0].v, 1) + "°C", by: c.caregiver }); });
      data.logToday((e) => ["meal", "checkin", "checkout", "temp", "note"].includes(e.type)).forEach((e) => rows.push({ at: e.at, type: e.type, child: e.child, text: (e.title ? e.title + " — " : "") + e.text, by: e.by }));
      const out = rows.filter((r) => (t === "all" || r.type === t) && (!s || (r.child + " " + r.text + " " + r.by).toLowerCase().includes(s))).sort((a, b) => new Date(b.at) - new Date(a.at));
      $("#log-table tbody").innerHTML = out.map((r) => "<tr><td class=\"mono\">" + fmt.time(r.at) + "</td><td>" + typeLabel[r.type] + "</td><td>" + esc(r.child) + "</td><td>" + esc(r.text) + "</td><td>" + esc(r.by) + "</td></tr>").join("") || '<tr><td colspan="5" class="muted">Tidak ada catatan yang cocok.</td></tr>';
      $("#log-count").textContent = out.length + " catatan";
    };
    $("#log-type").addEventListener("change", renderLogs); $("#log-search").addEventListener("input", renderLogs);
    const renderAccess = () => {
      const r = $("#acc-role").value;
      const rows = data.access().filter((a) => r === "all" || a.role === r);
      $("#acc-table tbody").innerHTML = rows.map((a) => "<tr><td class=\"mono\">" + esc(a.t) + "</td><td>" + esc(a.user) + '</td><td>' + auth.roleLabel(a.role) + "</td><td>" + esc(a.action) + "</td><td>" + esc(a.purpose) + "</td></tr>").join("") || '<tr><td colspan="5" class="muted">Belum ada catatan akses.</td></tr>';
      $("#acc-export").onclick = () => { const csv = ["Waktu,Pengguna,Peran,Tindakan,Tujuan"].concat(rows.map((a) => [a.t, a.user, auth.roleLabel(a.role), a.action, a.purpose].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","))).join("\n"); const b = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "riwayat-akses-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); toast("Riwayat akses diunduh (" + rows.length + " baris)."); };
    };
    $("#acc-role").addEventListener("change", renderAccess);
    const renderUsers = () => {
      const r = $("#user-role").value;
      const rows = store.state.users.filter((x) => r === "all" || x.role === r);
      $("#user-table tbody").innerHTML = rows.map((x) => "<tr><td><b>" + esc(x.name) + "</b><br><span class=\"muted\">" + esc(x.email) + "</span></td><td>" + auth.roleLabel(x.role) + "</td><td>" + (x.role === "parent" ? (x.children || []).map((id) => (data.child(id) || {}).short).filter(Boolean).join(", ") || '<span class="muted">Belum tertaut</span>' : esc(x.area || "—")) + "</td><td>" + (x.disabled ? '<span class="status-pill off">Nonaktif</span>' : '<span class="status-pill on">Aktif</span>') + '</td><td><div style="display:flex;gap:6px;flex-wrap:wrap">' + (x.id !== u.id ? '<button class="btn btn-sm" data-toggle="' + x.id + '">' + (x.disabled ? "Aktifkan" : "Nonaktifkan") + "</button>" : '<span class="muted">Akun Anda</span>') + '<button class="btn btn-sm" data-resetpw="' + x.id + '">Atur ulang sandi</button></div></td></tr>').join("");
      $$("[data-toggle]").forEach((b) => b.addEventListener("click", () => { const x = store.state.users.find((y) => y.id === b.dataset.toggle); x.disabled = !x.disabled; store.add({ type: "account", by: u.name, role: u.role, text: (x.disabled ? "Menonaktifkan" : "Mengaktifkan") + " akun " + x.name, purpose: "Kelola akun", sev: "low" }); toast("Akun " + x.name + (x.disabled ? " dinonaktifkan." : " diaktifkan.")); }));
      $$("[data-resetpw]").forEach((b) => b.addEventListener("click", () => { const x = store.state.users.find((y) => y.id === b.dataset.resetpw); const np = "Ceria" + Math.floor(1000 + Math.random() * 9000); x.password = np; store.add({ type: "account", by: u.name, role: u.role, text: "Mengatur ulang kata sandi " + x.name, purpose: "Kelola akun", sev: "low" }); $("#pw-out").innerHTML = "Kata sandi sementara untuk <b>" + esc(x.name) + "</b>: <span class=\"code-box\">" + np + "</span><br><span class=\"muted\">Sampaikan langsung kepada yang bersangkutan dan minta segera diganti di halaman Akun.</span>"; SD.chrome.openModal("pw-modal"); }));
      $("#code-table tbody").innerHTML = SEED.children.map((c) => { const linked = store.state.users.filter((x) => x.role === "parent" && (x.children || []).includes(c.id)); return "<tr><td>" + esc(c.name) + '</td><td><span class="code-box">' + c.code + "</span></td><td>" + (linked.length ? linked.map((l) => esc(l.name)).join(", ") : '<span class="muted">Belum ada</span>') + "</td></tr>"; }).join("");
    };
    $("#user-role").addEventListener("change", renderUsers);
    const uf = $("#user-form"); uf.addEventListener("submit", (e) => { e.preventDefault(); const r = auth.register({ name: uf.elements.name.value, email: uf.elements.email.value, phone: uf.elements.phone.value, password: uf.elements.password.value, confirm: uf.elements.password.value, role: uf.elements.role.value, code: uf.elements.role.value === "parent" ? uf.elements.code.value : SEED.inviteCodes[uf.elements.role.value] }); sessionStorage.setItem("sdai.session", u.id); if (!r.ok) { toast(r.msg, "err"); return; } toast("Akun " + r.user.name + " dibuat."); $("#user-modal").classList.remove("open"); uf.reset(); });
    /* Pengaturan */
    const SKEYS = ["tempMax", "humMax", "co2Max", "pm25Max", "bodyTempWatch", "bodyTempHigh", "retentionDays", "plateDiameterCm"];
    const sf = $("#settings-form"); const fillSettings = () => { const s = th(); SKEYS.forEach((k) => { if (sf.elements[k]) sf.elements[k].value = s[k]; }); };
    fillSettings();
    sf.addEventListener("submit", (e) => { e.preventDefault(); const s = th(); SKEYS.forEach((k) => { if (sf.elements[k]) s[k] = parseFloat(sf.elements[k].value); }); if (s.bodyTempHigh <= s.bodyTempWatch) { toast("Batas suhu tinggi harus di atas batas pantau.", "err"); return; } if (!(s.plateDiameterCm >= 12 && s.plateDiameterCm <= 40)) { toast("Diameter piring antara 12 dan 40 cm.", "err"); return; } store.save(); store.add({ type: "account", by: u.name, role: u.role, text: "Mengubah pengaturan ambang", purpose: "Pengaturan", sev: "low" }); toast("Pengaturan tersimpan dan langsung dipakai semua dasbor."); });
    const ff = $("#food-form"); ff.addEventListener("submit", (e) => { e.preventDefault(); const n = ff.elements.name.value.trim(); if (!n) return; if (store.state.foods.some((f) => f.name.toLowerCase() === n.toLowerCase())) { toast("Menu sudah ada.", "err"); return; } store.state.foods.push({ name: n, kcal: +ff.elements.kcal.value, protein: +ff.elements.protein.value, carbs: +ff.elements.carbs.value, fat: +ff.elements.fat.value }); store.save(); ff.reset(); toast("Menu " + n + " ditambahkan ke daftar menu."); });
    const renderFoods = () => { $("#food-ref tbody").innerHTML = store.state.foods.map((f, i) => "<tr><td>" + esc(f.name) + '</td><td class="num">' + f.kcal + '</td><td class="num">' + fmt.num(f.protein, 1) + '</td><td class="num">' + fmt.num(f.carbs, 1) + '</td><td class="num">' + fmt.num(f.fat, 1) + '</td><td>' + (i >= SEED.foods.length ? '<button class="btn btn-sm" data-delfood="' + i + '">Hapus</button>' : "") + "</td></tr>").join(""); $$("[data-delfood]").forEach((b) => b.addEventListener("click", () => { store.state.foods.splice(+b.dataset.delfood, 1); store.save(); })); };
    $("#reset-log").addEventListener("click", () => { if (!confirm("Hapus seluruh catatan yang dibuat dari aplikasi (absensi, obat, makan, kejadian, serah terima, akses)? Akun tetap tersimpan.")) return; store.state.log = []; store.state.resolved = {}; store.save(); toast("Catatan aplikasi dikosongkan."); });
    const all = () => { renderOverview(); renderDevices(); renderLogs(); renderAccess(); renderUsers(); renderFoods(); };
    all(); renderChart();
    SD.on("change", (e) => { all(); if (e && e.remote) toast("Data diperbarui dari perangkat lain."); });
    SD.on("air", () => { renderOverview(); renderDevices(); if ($("#tab-ringkasan").classList.contains("active")) renderChart(); });
    SD.on("tab", (id) => { if (id === "tab-ringkasan") renderChart(); });
    addEventListener("resize", renderChart);
  };

  /* ========== Akun & pengaturan ========== */
  P.account = function (u) {
    pwToggle();
    $("#acc-avatar").textContent = fmt.initials(u.name); $("#acc-name").textContent = u.name; $("#acc-role").textContent = auth.roleLabel(u.role) + " · " + u.email;
    const pf = $("#profile-form"); pf.elements.name.value = u.name; pf.elements.email.value = u.email; pf.elements.phone.value = u.phone || "";
    pf.addEventListener("submit", (e) => { e.preventDefault(); if (pf.elements.name.value.trim().length < 3) { toast("Nama minimal 3 huruf.", "err"); return; } u.name = pf.elements.name.value.trim(); u.phone = pf.elements.phone.value.trim(); store.save(); toast("Profil tersimpan."); $$(".user-chip .un, .sb-user .un").forEach((el) => (el.textContent = u.name)); $$(".user-chip .avatar, .sb-user .avatar").forEach((el) => (el.textContent = fmt.initials(u.name))); $("#acc-name").textContent = u.name; $("#acc-avatar").textContent = fmt.initials(u.name); });
    const cf = $("#pw-form"); cf.elements.newpw.addEventListener("input", () => ($("#pw-meter").dataset.score = String(auth.pwScore(cf.elements.newpw.value))));
    cf.addEventListener("submit", (e) => { e.preventDefault(); if (cf.elements.current.value !== u.password) { toast("Kata sandi saat ini tidak cocok.", "err"); return; } if (auth.pwScore(cf.elements.newpw.value) < 2) { toast("Kata sandi baru minimal 8 karakter dengan huruf dan angka.", "err"); return; } if (cf.elements.newpw.value !== cf.elements.confirm.value) { toast("Ulangi kata sandi belum sama.", "err"); return; } u.password = cf.elements.newpw.value; store.save(); store.add({ type: "account", by: u.name, role: u.role, text: "Mengganti kata sandi", purpose: "Keamanan akun", sev: "low" }); cf.reset(); $("#pw-meter").dataset.score = "0"; toast("Kata sandi diperbarui."); });
    const prefs = store.pref(u.id, "notify") || { wa: true, email: true, push: true, high: true, medium: true, low: false, daily: true };
    $$("#notify-form input").forEach((i) => { i.checked = !!prefs[i.name]; i.addEventListener("change", () => { prefs[i.name] = i.checked; store.pref(u.id, "notify", prefs); toast("Preferensi pemberitahuan disimpan."); }); });
    const since = store.state.log.find((e) => e.type === "access" && e.by === u.name && e.text === "Masuk ke akun");
    $("#session-info").innerHTML = "<b>Perangkat ini</b> · masuk " + (since ? fmt.when(since.at) : "sesi ini") + (localStorage.getItem("sdai.remember") ? " · tetap masuk" : "");
    const kidsBox = $("#kids-box"); if (u.role === "parent") { kidsBox.classList.remove("hidden"); const kids = auth.childrenOf(u); $("#kids-list").innerHTML = kids.length ? kids.map((c) => '<li><span class="avatar">' + fmt.initials(c.name) + "</span><div><b>" + esc(c.name) + '</b><div class="who">' + c.age + ' · <span class="code-box">' + c.code + "</span></div></div></li>").join("") : '<li><div class="muted">Belum ada anak tertaut.</div></li>'; const lf = $("#link-form"); lf.addEventListener("submit", (e) => { e.preventDefault(); const r = auth.linkChild(u, lf.elements.code.value); if (!r.ok) { toast(r.msg, "err"); return; } toast(r.child.name + " berhasil ditautkan."); setTimeout(() => location.reload(), 600); }); }
    const del = $("#delete-account");
    if (u.seed) { del.disabled = true; $("#delete-note").textContent = "Akun ini dikelola oleh daycare. Hubungi admin untuk perubahan atau penghapusan."; }
    else del.addEventListener("click", () => { if (!confirm("Hapus akun " + u.email + "? Tindakan ini tidak dapat dibatalkan.")) return; store.state.users = store.state.users.filter((x) => x.id !== u.id); store.save(true); sessionStorage.clear(); localStorage.removeItem("sdai.remember"); location.href = "index.html"; });
  };

  /* ========== Pusat bantuan ========== */
  P.help = function () {
    const u = auth.user();
    const box = $("#faq-list"), s = $("#faq-search");
    const render = () => { const k = (s.value || "").trim().toLowerCase(); const list = SEED.faq.filter((f) => !k || (f.q + " " + f.a).toLowerCase().includes(k)); box.innerHTML = list.map((f) => '<details class="faq"><summary>' + esc(f.q) + '</summary><div class="a">' + esc(f.a) + "</div></details>").join("") || '<div class="empty-state">Tidak ada jawaban yang cocok. Kirim pertanyaan lewat formulir di bawah.</div>'; };
    s.addEventListener("input", render); render();
    const f = $("#ticket-form"); if (u) { f.elements.name.value = u.name; f.elements.email.value = u.email; }
    f.addEventListener("submit", (e) => { e.preventDefault(); const t = { id: "T" + Date.now().toString(36).toUpperCase().slice(-5), at: new Date().toISOString(), name: f.elements.name.value.trim(), email: f.elements.email.value.trim(), topic: f.elements.topic.value, msg: f.elements.msg.value.trim(), status: "Diterima", userId: u ? u.id : null }; if (!t.name || !t.email || !t.msg) { toast("Lengkapi nama, e-mail, dan pesan.", "err"); return; } store.state.tickets.unshift(t); store.save(true); f.elements.msg.value = ""; toast("Tiket " + t.id + " dibuat. Kami balas ke " + t.email + " dalam 1 hari kerja."); renderTickets(); });
    const renderTickets = () => { const tb = $("#my-tickets"); if (!u || !tb) return; const mine = store.state.tickets.filter((t) => t.userId === u.id); tb.classList.toggle("hidden", !mine.length); $("#ticket-list").innerHTML = mine.map((t) => '<div class="ticket"><div class="th"><span>' + t.id + " · " + esc(t.topic) + "</span><span>" + fmt.when(t.at) + ' · <span class="status-pill">' + t.status + "</span></span></div>" + esc(t.msg) + "</div>").join(""); };
    renderTickets();
  };
})();
