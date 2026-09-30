export type Role = "parent" | "caregiver" | "admin";
export type Sev = "low" | "medium" | "high";
export type MealKey = "lunch" | "snack_am" | "snack_pm" | "breakfast";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  roleLabel: string;
  area: string;
  shift: string;
  seed: boolean;
  disabled: boolean;
  createdAt: string;
  children: string[];
  mustChangePassword: boolean;
  emailVerified: boolean;
}

export interface Facility {
  name: string;
  city: string;
  address: string;
  phone: string;
  hours: string;
  email: string;
}

export interface Room {
  id: string;
  name: string;
  short: string;
  camera: string;
}

export type CameraSource = "builtin" | "device";
export type CameraView = "image" | "snapshot" | "hls" | "mjpeg" | "whep" | "locked";

export type AccessStatus = "none" | "pending" | "approved" | "denied" | "expired" | "revoked";

export interface CameraAccess {
  status: AccessStatus;
  requestId: string | null;
  expiresAt: string | null;
  decidedAt: string | null;
  note: string;
  createdAt: string | null;
}

export interface Camera {
  id: string;
  label: string;
  room: string;
  /** Gambar contoh (builtin) atau alamat foto terbaru dari kamera; null bila belum ada foto. */
  img: string | null;
  mode?: "play" | "sleep" | "dine";
  parents: boolean;
  source: CameraSource;
  /** Cara menampilkan: image = gambar contoh, snapshot = foto berkala, hls/mjpeg = siaran. */
  view: CameraView;
  stream: string | null;
  streamKind: string | null;
  online: boolean;
  at: string | null;
  /** Hanya untuk orang tua: status permintaan akses kamera ini. */
  access?: CameraAccess;
}

export interface Sensor {
  id: string;
  room: string;
  battery: number;
}

export interface Thresholds {
  tempMax: number;
  humMax: number;
  co2Max: number;
  pm25Max: number;
  bodyTempWatch: number;
  bodyTempHigh: number;
  retentionDays: number;
  plateDiameterCm: number;
}

export interface Food {
  id: number;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  seed: boolean;
}

export interface Faq {
  q: string;
  a: string;
}

export interface TimelineSeed {
  t: string;
  cls: string;
  title: string;
  desc: string;
  /** Kategori (checkin, snack_am, lunch, sleep, …) agar butir ini hilang saat catatan nyata yang setara ada. */
  kind?: string;
}

export interface NutritionItem {
  name: string;
  pre: number;
  post: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  known?: boolean;
}

export interface SeedLunch {
  served: string;
  scannedPost: string;
  items: NutritionItem[];
}

export interface Child {
  id: string;
  code: string;
  name: string;
  short: string;
  dob: string;
  age: string;
  parentName: string;
  caregiver: string;
  room: string;
  status: string;
  statusText: string;
  allergies: string | null;
  meds: string | null;
  checkin: string;
  checkout: string;
  timeline: TimelineSeed[];
  /** Makan siang dasar dari data awal; anak yang didaftarkan lewat aplikasi belum memilikinya. */
  nutrition: {
    lunch?: SeedLunch;
  };
  temps: { t: string; v: number }[];
  consumed: { kcal: number; protein: number; carbs: number; fat: number };
  target: { kcal: number; protein: number; carbs: number; fat: number };
  weekly: number[];
  emergency: { n: string; p: string }[];
  /** Terisi bila anak sudah keluar dari daycare (hanya tampil untuk admin). */
  archivedAt?: string;
  archivedNote?: string;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface LogEntry {
  id: string;
  type:
    | "meal"
    | "plate"
    | "checkin"
    | "checkout"
    | "temp"
    | "med"
    | "incident"
    | "note"
    | "handover"
    | "access"
    | "account"
    | "activity"
    | "food"
    | "sleep"
    | "mood"
    | "doc";
  childId: string | null;
  child: string | null;
  userId: string | null;
  by: string;
  role: Role | "system";
  at: string;
  sev: Sev;
  title: string;
  text: string;
  silent: boolean;
  meal: MealKey | null;
  done: "done" | "replaced" | null;
  // muatan per jenis
  temp?: number;
  who?: string;
  cond?: string;
  med?: string;
  dose?: string;
  kind?: string;
  room?: string;
  note?: string;
  to?: string;
  from?: string;
  items?: (NutritionItem | { name: string; pre: number; kcal: number; protein: number; carbs: number; fat: number })[];
  pct?: number;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  servedKcal?: number;
  servedGrams?: number;
  eatenGrams?: number;
  served?: string;
  scannedPost?: string;
  boxes?: Box[];
  boxesPre?: Box[];
  boxesPost?: Box[];
  conf?: number;
  confPre?: number;
  confPost?: number;
  plateCm?: number;
  plateId?: string;
  purpose?: string;
  camId?: string;
  photoUrl?: string;
  photoPreUrl?: string;
  photoPostUrl?: string;
  // catatan rutin
  kindLabel?: string;
  minutes?: number | null;
  slot?: FoodSlot;
  slotLabel?: string;
  menu?: string[];
  portion?: Portion;
  portionLabel?: string;
  score?: number;
  start?: string;
  end?: string;
  quality?: SleepQuality;
  qualityLabel?: string;
  qualityScore?: number;
  mood?: MoodKind;
  moodLabel?: string;
  emoji?: string;
  caption?: string;
  /** Foto contoh (berkas publik) untuk dokumentasi dari data awal. */
  img?: string;
}

export type ActivityKind = "bermain" | "belajar" | "seni" | "motorik_kasar" | "motorik_halus" | "sosial" | "membaca" | "lainnya";
export type FoodSlot = "breakfast" | "snack_am" | "lunch" | "snack_pm";
export type Portion = "habis" | "setengah" | "sedikit" | "tidak";
export type SleepQuality = "sangat_baik" | "baik" | "cukup" | "kurang";
export type MoodKind = "sangat_senang" | "senang" | "netral" | "sedih" | "marah" | "lelah";

export interface ChatThread {
  id: string;
  kind: "child" | "announce" | "admin" | "group";
  title: string;
  subtitle: string;
  childId: string | null;
  lastAt: string | null;
  lastText: string;
  lastBy: string;
  unread: number;
  canPost: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string | null;
  by: string;
  role: Role | "system";
  at: string;
  text: string;
  mine: boolean;
}

export interface CameraRequest {
  id: string;
  userId: string;
  user: string;
  childId: string | null;
  child: string | null;
  camId: string;
  camera: string;
  room: string;
  reason: string;
  status: AccessStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string;
  expiresAt: string | null;
  note: string;
}

export type Sentiment = "positif" | "netral" | "negatif";

export interface FeedbackItem {
  id: string;
  userId: string | null;
  by: string;
  childId: string | null;
  child: string | null;
  at: string;
  rating: number;
  text: string;
  sentiment: Sentiment;
  response: string;
  respondedAt: string | null;
  respondedBy: string;
}

export interface TrustMetric {
  value: number;
  prev?: number | null;
  delta?: number | null;
  medianHours?: number | null;
  basis: string;
}

export interface TrustMetrics {
  satisfaction: TrustMetric;
  response: TrustMetric;
  engagement: TrustMetric;
  trust: TrustMetric;
  weeks: { label: string; start: string; avg: number | null; n: number; pct: number | null }[];
  sentiments: Record<Sentiment, number>;
  count30: number;
  dailySummary: DailySummary;
}

export interface DailySummary {
  enabled: boolean;
  time: string;
}

/** Baris per hari dari /api/analytics */
export interface DayRow {
  date: string;
  label: string;
  day: number;
  weekday: number;
  school: boolean;
  present: boolean;
  checkin: string | null;
  activities: number;
  activityMinutes: number;
  byKind: Record<string, number>;
  mood: number | null;
  moodLabel: string | null;
  moodEmoji: string | null;
  moodMorning: number | null;
  moodAfternoon: number | null;
  sleepMinutes: number;
  sleepQuality: number | null;
  meals: Record<string, number>;
  mealAvg: number | null;
  menu: string[];
  tempMax: number | null;
  incidents: number;
  /** menit sejak tengah malam saat catatan masuk (07.45 → 465) */
  checkinMin?: number | null;
  /** kelompok gizi yang muncul di menu hari itu: karbo / sayur / protein / buah / susu */
  menuGroups?: string[];
  notes: { at: string; by: string; text: string }[];
}

export interface PeriodSummary {
  days: number;
  schoolDays: number;
  presentDays: number;
  attendancePct: number;
  activities: number;
  activitiesPerDay: number;
  activityMinutes: number;
  byKind: Record<string, number>;
  moodAvg: number | null;
  moodLabel: string;
  moodEmoji: string;
  moodStd: number;
  sleepTotal: number;
  sleepAvg: number;
  sleepDays: number;
  mealAvg: number | null;
  mealCount: number;
  slotAvg: Record<string, number>;
  incidents: number;
  feverDays: number;
  incidentDays?: number;
  incidentSevDays?: number;
  incidentAfternoon?: number;
  medNotes?: number;
  /** jumlah hari per kelompok gizi yang muncul di menu */
  menuGroups?: Record<string, number>;
  menuDistinct?: number;
  arriveAvg?: number | null;
  arriveLateDays?: number;
  /** hari sekolah yang sudah lewat tanpa catatan hadir (hari ini tidak dihitung) */
  absentDays?: number;
}

/** Skor pantauan: sinyal yang menyala hari ini, tiap komponen menyebut aturannya. */
export interface WatchComponent {
  key: string;
  label: string;
  points: number;
  detail: string;
}

export interface WatchScore {
  score: number;
  level: "tenang" | "wajar" | "perlu dipantau";
  components: WatchComponent[];
  note: string;
}

export type InsightKind = "trend" | "pattern" | "anomaly" | "positive";

export interface Insight {
  id: string;
  kind: InsightKind;
  area: "aktivitas" | "mood" | "tidur" | "makan" | "kehadiran" | "kesehatan";
  title: string;
  text: string;
  evidence: string;
  delta: number | null;
  sev: "low" | "medium" | "high";
  /** tinggi · sedang · rendah — mengikuti jumlah data dan besar efek */
  confidence?: "tinggi" | "sedang" | "rendah";
}

/** Kebiasaan anak dari hari-hari hadir sebelum periode (maks. 8 minggu). */
export interface BaselineStat {
  n: number;
  mean: number;
  sd: number;
  /** median kebiasaan — pusat yang dipakai membandingkan (tahan satu hari ekstrem) */
  center?: number;
  /** sebaran tahanencil (1,4826 × MAD) */
  scale?: number;
}

export interface Baseline {
  days: number;
  from: string | null;
  to: string | null;
  mood: BaselineStat | null;
  sleep: BaselineStat | null;
  meal: BaselineStat | null;
  activities: BaselineStat | null;
  arrive?: BaselineStat | null;
}

export interface Recommendation {
  id: string;
  title: string;
  text: string;
  why: string;
  area?: Insight["area"];
  /** dampak 1–3 dan usaha 0–3 — aturan produk, bukan hasil belajar mesin */
  impact?: number;
  impactLabel?: string;
  effort?: number;
  effortLabel?: string;
  score?: number;
  /** pengali dari penilaian admin sebelumnya (1 = belum ada penilaian) */
  weight?: number;
  rank?: number;
}

export interface ProfileArea {
  area: "sosial" | "motorik" | "kognitif" | "emosi";
  label: string;
  score: number;
  level: string;
  trend: "up" | "flat" | "down";
  prev: number;
  basis: string;
}

export interface Analytics {
  childId: string;
  child: string;
  range: { start: string; end: string; days: number; label: string };
  days: DayRow[];
  prevDays: DayRow[];
  current: PeriodSummary;
  previous: PeriodSummary;
  kinds: { kind: string; label: string; count: number }[];
  insights: Insight[];
  recommendations: Recommendation[];
  watch?: WatchScore;
  profile: ProfileArea[];
  teacherNotes: { at: string; by: string; text: string }[];
  method: string;
  baseline?: Baseline;
  peers?: { n: number };
  generatedAt: string;
}

export interface SeededIncident {
  id: string;
  t: string;
  room: string;
  type: string;
  sev: Sev;
  sevText: string;
  childId: string;
  child: string;
  resolved: boolean;
  by: string;
  resolvedAt: string;
  note: string;
}

export interface SeededMed {
  t: string;
  childId: string;
  child: string;
  med: string;
  dose: string;
  by: string;
  note: string;
}

export interface SeededAccess {
  t: string;
  user: string;
  role: Role | "system";
  action: string;
  purpose: string;
}

export interface SeededHandover {
  t: string;
  from: string;
  to: string;
  note: string;
}

/** sensor = perangkat sungguhan; builtin = nilai contoh; stale = sensor berhenti mengirim; none = belum ada sensor */
export type AirSource = "sensor" | "builtin" | "stale" | "none";

export interface AirReading {
  room: string;
  temp: number | null;
  hum: number | null;
  co2: number | null;
  pm25: number | null;
  source: AirSource;
  at: string | null;
  deviceId?: string;
  battery?: number;
}

export interface AirSnapshot {
  readings: AirReading[];
  history: Record<string, number[]>;
  updatedAt: string;
  sample: boolean;
}

export type Channels = {
  email: string | null;
  wa: string | null;
  publicUrl: string | null;
  waTemplate: boolean | null;
};

export type MessageStatus = "queued" | "sending" | "sent" | "failed" | "off";

export interface OutboxMessage {
  id: string;
  at: string;
  channel: "email" | "wa";
  to: string;
  subject: string;
  body: string;
  status: MessageStatus;
  error: string | null;
  provider: string | null;
  ref: string;
  userId: string | null;
  attempts: number;
  sentAt: string | null;
}

export interface Ticket {
  id: string;
  at: string;
  name: string;
  email: string;
  org: string;
  topic: string;
  msg: string;
  status: "open" | "answered" | "closed";
}

export interface InviteCode {
  code: string;
  role: Role;
  label: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  /** null = tanpa batas waktu (hanya kode awal fasilitas) */
  expiresAt: string | null;
  /** null = tanpa batas pemakaian */
  maxUses: number | null;
  uses: number;
  usedBy: { name: string; at: string }[];
}

export type LinkVia = "register" | "link" | "admin" | "seed";

export interface NotifyPrefs {
  wa: boolean;
  email: boolean;
  push: boolean;
  high: boolean;
  medium: boolean;
  low: boolean;
  daily: boolean;
}

export interface Prefs {
  child?: string;
  lastRead?: string;
  notify?: Partial<NotifyPrefs>;
  billing?: "month" | "year";
}

export interface State {
  serverTime: string;
  me: User;
  facility: Facility;
  rooms: Room[];
  cameras: Camera[];
  sensors: Sensor[];
  thresholds: Thresholds;
  foods: Food[];
  faq: Faq[];
  children: Child[];
  seeded: {
    incidents: SeededIncident[];
    medLogs: SeededMed[];
    access: SeededAccess[];
    handovers: SeededHandover[];
  };
  log: LogEntry[];
  resolved: Record<string, { by: string; at: string }>;
  prefs: Prefs;
  air: AirSnapshot;
  /** true = basis data berisi data contoh (anak/akun/nilai udara contoh) */
  sample: boolean;
  channels: Channels;
  tickets: Ticket[];
  users?: User[];
  archivedChildren?: Child[];
  devices?: Device[];
  messages?: OutboxMessage[];
  inviteCodes?: InviteCode[];
  links?: { userId: string; childId: string; linkedAt: string; via: LinkVia }[];
  staff?: { id: string; name: string; shift: string }[];
  chatUnread: number;
  cameraRequests: CameraRequest[];
  feedback: FeedbackItem[];
  dailySummary: DailySummary;
  /** Hanya staf/admin */
  trust?: TrustMetrics;
}

export interface PublicSummary {
  serverTime: string;
  facility: Facility;
  faq: Faq[];
  air: AirSnapshot;
  thresholds: Thresholds;
  childCount: number;
  present: number;
  lastIncident: { type: string; t: string; resolved: boolean } | null;
  sample: boolean;
}

export interface Device {
  id: string;
  kind: "camera" | "sensor";
  label: string;
  room: string;
  ok: boolean;
  detail: string;
  at: string | null;
  /** device = didaftarkan admin; builtin = perangkat contoh dari data awal */
  source: "device" | "builtin";
  enabled?: boolean;
  parents?: boolean;
  stream?: string | null;
  streamKind?: string | null;
  createdAt?: string;
}

/** Isi web/public/models/<model>.model.json — hasil uji pada foto yang tidak dilihat saat latih.
   Dibaca langsung oleh panel "Kualitas pemindai piring", bukan dikirim API analitik. */
export interface ScannerQuality {
  version: string;
  trainedAt?: string | null;
  photosTrain?: number;
  photosVal?: number;
  patches?: number;
  params?: number;
  photoAccuracy?: number;
  photoPrecision?: number;
  patchAccuracy?: number;
  balancedAccuracy?: number;
  temperature?: number;
  recall?: Record<string, number>;
  confidentPrecision?: Record<string, number>;
  thresholds?: { relabelMin?: number; vetoP?: number };
  weakClasses?: string[];
}
