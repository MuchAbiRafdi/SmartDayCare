/* Turunan data dari cuplikan status (State). Semua fungsi murni; dipakai di komponen
   server maupun klien agar angka di setiap dasbor berasal dari satu perhitungan. */
import { clockToIso, fmtTime, isToday, mealLabel, nowClock } from "./format";
import type { AirReading, Child, LogEntry, SeedLunch, Sev, State, Thresholds } from "./types";

export type Attendance = { state: "in" | "out" | "pending"; since: string | null; label: string };

/** Catatan hari ini; catatan yang sudah tergantikan (pindaian/waktu makan yang dicatat ulang) tidak ikut. */
export function todayLog(s: State): LogEntry[] {
  return s.log.filter((e) => isToday(e.at) && e.done !== "replaced");
}

export function childLog(s: State, childId: string): LogEntry[] {
  return todayLog(s).filter((e) => e.childId === childId);
}

export function attendance(s: State, c: Child, now = new Date()): Attendance {
  const mine = childLog(s, c.id)
    .filter((e) => e.type === "checkin" || e.type === "checkout")
    .sort((a, b) => a.at.localeCompare(b.at));
  const last = mine[mine.length - 1];
  if (last) {
    const t = fmtTime(last.at);
    return last.type === "checkout" ? { state: "out", since: t, label: "Sudah dijemput " + t } : { state: "in", since: t, label: "Hadir sejak " + t };
  }
  const nowT = nowClock(now);
  if (c.checkout && nowT >= c.checkout) return { state: "out", since: c.checkout, label: "Sudah dijemput " + c.checkout.replace(":", ".") };
  if (c.checkin && nowT >= c.checkin) return { state: "in", since: c.checkin, label: "Hadir sejak " + c.checkin.replace(":", ".") };
  return { state: "pending", since: c.checkin, label: "Belum tiba" };
}

export function present(s: State, now = new Date()): Child[] {
  return s.children.filter((c) => attendance(s, c, now).state === "in");
}

export interface TimelineItem {
  id: string;
  at: string; // ISO
  time: string; // HH.MM
  title: string;
  desc: string;
  sev: Sev;
  future: boolean;
  source: "seed" | "log";
}

const TL_TYPES = new Set(["checkin", "checkout", "temp", "med", "meal", "plate", "incident", "note"]);

/** Linimasa hari ini: jadwal dasar (yang sudah lewat) digabung dengan catatan nyata. */
/** Kategori butir jadwal dasar, untuk menyembunyikannya begitu ada catatan nyata yang setara hari ini. */
function seedKind(t: { title: string; kind?: string }): string | null {
  if (t.kind) return t.kind;
  const x = t.title.toLowerCase();
  if (x.startsWith("tiba")) return "checkin";
  if (x.startsWith("dijemput")) return "checkout";
  if (x.startsWith("camilan pagi")) return "snack_am";
  if (x.startsWith("camilan sore")) return "snack_pm";
  if (x.startsWith("makan siang")) return "lunch";
  if (x.startsWith("tidur")) return "sleep";
  if (x.startsWith("bermain")) return "activity";
  if (x.includes("suhu")) return "temp";
  if (x.includes("obat") || x.includes("vitamin")) return "med";
  return null;
}

/** Kategori yang sudah punya catatan nyata hari ini (jadwal dasar untuk kategori itu tidak ditampilkan lagi). */
export function coveredKinds(s: State, childId: string): Set<string> {
  const out = new Set<string>();
  for (const e of childLog(s, childId)) {
    if (e.done === "replaced") continue;
    if (e.type === "food" && e.slot) out.add(e.slot);
    else if (e.type === "meal" || e.type === "plate") out.add("lunch");
    else if (["checkin", "checkout", "temp", "sleep", "activity", "med"].includes(e.type)) out.add(e.type);
  }
  return out;
}

export function timeline(s: State, c: Child, now = new Date()): { past: TimelineItem[]; next: TimelineItem | null } {
  const nowT = nowClock(now);
  const logged = childLog(s, c.id).filter((e) => TL_TYPES.has(e.type) && e.done !== "replaced");
  const covered = coveredKinds(s, c.id);
  const seedItems: TimelineItem[] = c.timeline
    .filter((t) => {
      const k = seedKind(t);
      return !k || !covered.has(k);
    })
    .map((t, i) => ({
      id: "seed-" + i,
      at: clockToIso(t.t, now),
      time: t.t.replace(":", "."),
      title: t.title,
      desc: t.desc,
      sev: t.cls === "t-warn" ? "medium" : t.cls === "t-danger" ? "high" : "low",
      future: t.t > nowT,
      source: "seed",
    }));
  const past = seedItems.filter((t) => !t.future);
  const next = seedItems.find((t) => t.future) ?? null;
  const logItems: TimelineItem[] = logged.map((e) => ({
    id: e.id,
    at: e.at,
    time: fmtTime(e.at),
    title: e.title,
    desc: e.text,
    sev: e.sev,
    future: false,
    source: "log",
  }));
  const all = [...past, ...logItems].sort((a, b) => a.at.localeCompare(b.at));
  return { past: all, next };
}

export interface Notice {
  id: string;
  at: string;
  time: string;
  childId: string | null;
  child: string | null;
  title: string;
  text: string;
  sev: Sev;
  unread: boolean;
}

/** Pemberitahuan orang tua: catatan penting anak-anak yang tertaut, terbaru di atas. */
export function notifications(s: State, childIds?: string[]): Notice[] {
  const ids = new Set(childIds ?? s.children.map((c) => c.id));
  const lastRead = s.prefs.lastRead ?? "";
  const items: Notice[] = [];
  for (const e of todayLog(s)) {
    if (!e.childId || !ids.has(e.childId) || e.silent || e.type === "plate" || e.done === "replaced") continue;
    items.push({
      id: e.id,
      at: e.at,
      time: fmtTime(e.at),
      childId: e.childId,
      child: e.child,
      title: e.title,
      text: e.text,
      sev: e.sev,
      unread: e.at > lastRead,
    });
  }
  for (const i of s.seeded.incidents) {
    if (!ids.has(i.childId)) continue;
    items.push({
      id: i.id,
      at: clockToIso(i.t),
      time: i.t.replace(":", "."),
      childId: i.childId,
      child: i.child,
      title: i.type + " · " + i.room,
      text: i.note + (i.resolved ? " Ditangani oleh " + i.by + " pukul " + i.resolvedAt.replace(":", ".") + "." : ""),
      sev: i.sev,
      unread: false,
    });
  }
  for (const m of s.seeded.medLogs) {
    if (!ids.has(m.childId)) continue;
    items.push({
      id: "med-" + m.t + m.childId,
      at: clockToIso(m.t),
      time: m.t.replace(":", "."),
      childId: m.childId,
      child: m.child,
      title: "Obat diberikan: " + m.med + " " + m.dose,
      text: m.note + " Oleh " + m.by + ".",
      sev: "medium",
      unread: false,
    });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export function unreadCount(s: State): number {
  return notifications(s).filter((n) => n.unread).length;
}

export interface Incident {
  id: string;
  at: string;
  time: string;
  room: string;
  kind: string;
  sev: Sev;
  childId: string;
  child: string;
  note: string;
  resolved: { by: string; at: string } | null;
  source: "seed" | "log";
}

export function incidents(s: State): Incident[] {
  const out: Incident[] = s.seeded.incidents.map((i) => ({
    id: i.id,
    at: clockToIso(i.t),
    time: i.t.replace(":", "."),
    room: i.room,
    kind: i.type,
    sev: i.sev,
    childId: i.childId,
    child: i.child,
    note: i.note,
    resolved: { by: i.by, at: i.resolvedAt.replace(":", ".") },
    source: "seed",
  }));
  for (const e of todayLog(s)) {
    if (e.type !== "incident") continue;
    const r = s.resolved[e.id];
    out.push({
      id: e.id,
      at: e.at,
      time: fmtTime(e.at),
      room: e.room ?? "",
      kind: e.kind ?? e.title,
      sev: e.sev,
      childId: e.childId ?? "",
      child: e.child ?? "",
      note: e.note ?? e.text,
      resolved: r ? { by: r.by, at: fmtTime(r.at) } : null,
      source: "log",
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function openIncidents(s: State): Incident[] {
  return incidents(s).filter((i) => !i.resolved);
}

export interface MedRow {
  id: string;
  at: string;
  time: string;
  childId: string;
  child: string;
  med: string;
  dose: string;
  by: string;
  note: string;
}

export function meds(s: State, childId?: string): MedRow[] {
  const rows: MedRow[] = s.seeded.medLogs.map((m, i) => ({
    id: "smed-" + i,
    at: clockToIso(m.t),
    time: m.t.replace(":", "."),
    childId: m.childId,
    child: m.child,
    med: m.med,
    dose: m.dose,
    by: m.by,
    note: m.note,
  }));
  for (const e of todayLog(s)) {
    if (e.type !== "med") continue;
    rows.push({
      id: e.id,
      at: e.at,
      time: fmtTime(e.at),
      childId: e.childId ?? "",
      child: e.child ?? "",
      med: e.med ?? "",
      dose: e.dose ?? "",
      by: e.by,
      note: e.note || e.text,
    });
  }
  return rows.filter((r) => !childId || r.childId === childId).sort((a, b) => b.at.localeCompare(a.at));
}

export function meals(s: State): LogEntry[] {
  return todayLog(s)
    .filter((e) => e.type === "meal" && e.done !== "replaced")
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function pendingPlates(s: State, childId?: string): LogEntry[] {
  return todayLog(s)
    .filter((e) => e.type === "plate" && !e.done && (!childId || e.childId === childId))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export interface HandoverRow {
  id: string;
  at: string;
  time: string;
  from: string;
  to: string;
  note: string;
}

export function handovers(s: State): HandoverRow[] {
  const rows: HandoverRow[] = s.seeded.handovers.map((h, i) => ({
    id: "sho-" + i,
    at: clockToIso(h.t),
    time: h.t.replace(":", "."),
    from: h.from,
    to: h.to,
    note: h.note,
  }));
  for (const e of todayLog(s)) {
    if (e.type !== "handover") continue;
    rows.push({ id: e.id, at: e.at, time: fmtTime(e.at), from: e.from ?? e.by, to: e.to ?? "", note: e.text });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export interface AccessRow {
  id: string;
  at: string;
  time: string;
  user: string;
  role: string;
  action: string;
  purpose: string;
  source: "seed" | "log";
}

export function accessRows(s: State): AccessRow[] {
  const rows: AccessRow[] = s.log
    .filter((e) => e.type === "access" || e.type === "account")
    .map((e) => ({ id: e.id, at: e.at, time: fmtTime(e.at), user: e.by, role: e.role, action: e.title, purpose: e.purpose ?? e.text, source: "log" as const }));
  for (const [i, a] of s.seeded.access.entries()) {
    rows.push({
      id: "sacc-" + i,
      at: clockToIso(a.t),
      time: a.t.replace(":", "."),
      user: a.user,
      role: a.role,
      action: a.action,
      purpose: a.purpose,
      source: "seed",
    });
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/* ---- Gizi ---------------------------------------------------------------------------- */

export interface LunchTotals {
  pct: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  pre: number;
  post: number;
}

export function totalsOf(items: { pre: number; post: number; kcal: number; protein: number; carbs: number; fat: number }[]): LunchTotals {
  const t = { pct: 0, kcal: 0, protein: 0, carbs: 0, fat: 0, pre: 0, post: 0 };
  for (const i of items) {
    const eaten = Math.max(0, i.pre - i.post);
    t.pre += i.pre;
    t.post += i.post;
    t.kcal += (i.kcal * eaten) / 100;
    t.protein += (i.protein * eaten) / 100;
    t.carbs += (i.carbs * eaten) / 100;
    t.fat += (i.fat * eaten) / 100;
  }
  t.pct = t.pre ? Math.round(((t.pre - t.post) / t.pre) * 100) : 0;
  t.kcal = Math.round(t.kcal);
  t.protein = +t.protein.toFixed(1);
  t.carbs = +t.carbs.toFixed(1);
  t.fat = +t.fat.toFixed(1);
  return t;
}

/** Catatan makan hari ini yang dipindai (terbaru dulu) untuk seorang anak. */
export function loggedMeals(s: State, childId: string): LogEntry[] {
  return meals(s).filter((e) => e.childId === childId);
}

/** Makan siang dasar (data awal) bila anak memilikinya. */
export function seedLunch(c: Child): SeedLunch | null {
  return c.nutrition?.lunch ?? null;
}

export function lunchTotals(c: Child): LunchTotals {
  return totalsOf(seedLunch(c)?.items ?? []);
}

/** Asupan yang sudah tercatat sampai sekarang (kkal & makro) untuk kartu "Energi hari ini". */
export function consumedSoFar(s: State, c: Child, now = new Date()): { kcal: number; protein: number; carbs: number; fat: number } {
  const nowT = nowClock(now);
  const logged = loggedMeals(s, c.id);
  const lunch = lunchTotals(c);
  const keys = ["kcal", "protein", "carbs", "fat"] as const;
  const base: Record<(typeof keys)[number], number> = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const sl = seedLunch(c);
  const afterLunch = !!sl && nowT >= sl.scannedPost;
  if (nowT >= "10:02") {
    for (const k of keys) base[k] = c.consumed[k] - (afterLunch ? 0 : lunch[k]);
  }
  // makan siang yang dipindai hari ini menggantikan angka dasar makan siang
  if (afterLunch && logged.some((e) => e.meal === "lunch")) {
    for (const k of keys) base[k] -= lunch[k];
  }
  for (const e of logged) for (const k of keys) base[k] += e[k] ?? 0;
  return {
    kcal: Math.max(0, Math.round(base.kcal)),
    protein: Math.max(0, +base.protein.toFixed(1)),
    carbs: Math.max(0, +base.carbs.toFixed(1)),
    fat: Math.max(0, +base.fat.toFixed(1)),
  };
}

export interface TempRow {
  at: string;
  time: string;
  v: number;
  sev: Sev;
  by: string;
  source: "seed" | "log";
}

export function tempSev(v: number, th: Thresholds): Sev {
  if (v >= th.bodyTempHigh) return "high";
  if (v >= th.bodyTempWatch) return "medium";
  return "low";
}

export function temps(s: State, c: Child, now = new Date()): TempRow[] {
  const nowT = nowClock(now);
  const rows: TempRow[] = c.temps
    .filter((t) => t.t <= nowT)
    .map((t) => ({ at: clockToIso(t.t, now), time: t.t.replace(":", "."), v: t.v, sev: tempSev(t.v, s.thresholds), by: c.caregiver, source: "seed" as const }));
  for (const e of childLog(s, c.id)) {
    if ((e.type === "temp" || e.type === "checkin") && typeof e.temp === "number") {
      rows.push({ at: e.at, time: fmtTime(e.at), v: e.temp, sev: e.sev, by: e.by, source: "log" });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export function lastTemp(s: State, c: Child, now = new Date()): TempRow | null {
  return temps(s, c, now)[0] ?? null;
}

export function weekLabels(now = new Date()): string[] {
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Jakarta" }).format(now);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) out.push(days[(idx - i + 7) % 7]);
  return out;
}

/** Energi makan siang 7 hari terakhir: Minggu (daycare libur) selalu 0, hari lain memakai data anak berurutan. */
export function weekSeries(c: Child, now = new Date()): { labels: string[]; values: number[] } {
  const labels = weekLabels(now);
  const vals = c.weekly.filter((v) => v > 0);
  const values = labels.map((l) => (l === "Min" ? 0 : (vals.shift() ?? 0)));
  return { labels, values };
}

/* ---- Udara ------------------------------------------------------------------------------ */

export type AirStatus = "ok" | "warn" | "danger" | "none";

/** Pembacaan dianggap ada bila berasal dari sensor/nilai contoh dan angkanya lengkap. */
export function airHasData(r: AirReading): r is AirReading & { temp: number; hum: number; co2: number; pm25: number } {
  return (r.source === "sensor" || r.source === "builtin") && r.temp !== null && r.hum !== null && r.co2 !== null && r.pm25 !== null;
}

export function airStatus(r: AirReading, th: Thresholds): AirStatus {
  if (!airHasData(r)) return "none";
  if (r.co2 > th.co2Max || r.pm25 > th.pm25Max || r.temp > th.tempMax + 1.5) return "danger";
  if (r.co2 > th.co2Max * 0.85 || r.pm25 > th.pm25Max * 0.6 || r.temp > th.tempMax || r.hum > th.humMax) return "warn";
  return "ok";
}

export const AIR_LABEL: Record<AirStatus, string> = { ok: "Baik", warn: "Perlu perhatian", danger: "Buruk", none: "Belum ada data" };

/** Label sumber angka udara — selalu ditampilkan agar jelas mana nilai sensor dan mana nilai contoh. */
export const AIR_SOURCE_LABEL: Record<AirReading["source"], string> = {
  sensor: "Sensor",
  builtin: "Nilai contoh",
  stale: "Sensor tidak mengirim",
  none: "Belum ada sensor",
};

export function airTone(st: AirStatus): "ok" | "warn" | "danger" | "neutral" {
  return st === "none" ? "neutral" : st;
}

/** "27,4°C · 61% · CO₂ 812 ppm" atau keterangan bila belum ada data. */
export function airLine(r: AirReading | null | undefined, withPm = false): string {
  if (!r || !airHasData(r)) return r ? AIR_SOURCE_LABEL[r.source] : "—";
  const base = `${r.temp.toFixed(1).replace(".", ",")}°C · ${r.hum}% · CO₂ ${r.co2} ppm`;
  return withPm ? base + ` · PM2,5 ${r.pm25}` : base;
}

export function airOverall(readings: AirReading[], th: Thresholds, includeKitchen = false): { status: AirStatus; worst: AirReading | null } {
  const rs = (includeKitchen ? readings : readings.filter((r) => !r.room.startsWith("Dapur"))).filter(airHasData);
  if (!rs.length) return { status: "none", worst: null };
  let status: AirStatus = "ok";
  let worst: AirReading | null = null;
  const rank = { ok: 0, warn: 1, danger: 2, none: -1 };
  for (const r of rs) {
    const st = airStatus(r, th);
    if (rank[st] >= rank[status] && (!worst || (r.co2 ?? 0) > (worst.co2 ?? 0) || rank[st] > rank[status])) {
      status = st;
      worst = r;
    }
  }
  return { status, worst };
}

export function airForRoom(s: State, room: string): AirReading | null {
  return s.air.readings.find((r) => r.room === room) ?? null;
}

export function roomStatusLabel(s: State, room: string): { text: string; status: AirStatus } | null {
  const r = airForRoom(s, room);
  if (!r) return null;
  const st = airStatus(r, s.thresholds);
  return { text: AIR_LABEL[st], status: st };
}

/* ---- Tampilan bantu -------------------------------------------------------------------- */

export function childById(s: State, id: string | undefined | null): Child | undefined {
  return s.children.find((c) => c.id === id);
}

export function preferredChild(s: State): Child | undefined {
  return childById(s, s.prefs.child) ?? s.children[0];
}

export function mealTitle(e: LogEntry): string {
  return mealLabel(e.meal);
}

export function tempStatusText(sev: Sev): string {
  return sev === "high" ? "Tinggi — dipantau" : sev === "medium" ? "Sedikit di atas normal" : "Normal";
}

/** Entri log admin "Catatan harian": semua jenis kecuali akses/akun. */
export function dailyRows(
  s: State,
): { id: string; at: string; time: string; type: string; child: string; title: string; text: string; by: string; sev: Sev }[] {
  const rows: { id: string; at: string; time: string; type: string; child: string; title: string; text: string; by: string; sev: Sev }[] = [];
  for (const e of todayLog(s)) {
    if (e.type === "access" || e.type === "account" || e.done === "replaced") continue;
    rows.push({ id: e.id, at: e.at, time: fmtTime(e.at), type: e.type, child: e.child ?? "—", title: e.title, text: e.text, by: e.by, sev: e.sev });
  }
  for (const i of s.seeded.incidents)
    rows.push({
      id: i.id,
      at: clockToIso(i.t),
      time: i.t.replace(":", "."),
      type: "incident",
      child: i.child,
      title: i.type + " · " + i.room,
      text: i.note,
      by: i.by,
      sev: i.sev,
    });
  for (const [k, m] of s.seeded.medLogs.entries())
    rows.push({
      id: "sm" + k,
      at: clockToIso(m.t),
      time: m.t.replace(":", "."),
      type: "med",
      child: m.child,
      title: "Obat diberikan: " + m.med + " " + m.dose,
      text: m.note,
      by: m.by,
      sev: "medium",
    });
  for (const [k, h] of s.seeded.handovers.entries())
    rows.push({
      id: "sh" + k,
      at: clockToIso(h.t),
      time: h.t.replace(":", "."),
      type: "handover",
      child: "—",
      title: "Serah terima ke " + h.to,
      text: h.note,
      by: h.from,
      sev: "low",
    });
  const nowT = nowClock();
  for (const c of s.children) {
    if (c.checkin <= nowT) {
      const first = c.timeline[0];
      rows.push({
        id: "sc" + c.id,
        at: clockToIso(c.checkin),
        time: c.checkin.replace(":", "."),
        type: "checkin",
        child: c.name,
        title: first?.title ?? "Tiba",
        text: first?.desc ?? "",
        by: c.caregiver,
        sev: "low",
      });
    }
    const sl = seedLunch(c);
    if (sl && sl.scannedPost <= nowT && !loggedMeals(s, c.id).some((e) => e.meal === "lunch")) {
      const t = lunchTotals(c);
      rows.push({
        id: "sl" + c.id,
        at: clockToIso(sl.scannedPost),
        time: sl.scannedPost.replace(":", "."),
        type: "meal",
        child: c.name,
        title: "Makan siang " + t.pct + "% porsi",
        text: "Sekitar " + t.kcal + " kkal.",
        by: c.caregiver,
        sev: "low",
      });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export const TYPE_LABEL: Record<string, string> = {
  checkin: "Kedatangan",
  checkout: "Kepulangan",
  temp: "Suhu tubuh",
  activity: "Aktivitas",
  food: "Makan (porsi)",
  sleep: "Tidur",
  mood: "Mood",
  doc: "Dokumentasi",
  med: "Obat",
  meal: "Makan (pindaian)",
  plate: "Piring disajikan",
  incident: "Kejadian",
  note: "Catatan",
  handover: "Serah terima",
  access: "Akses",
  account: "Akun",
};
