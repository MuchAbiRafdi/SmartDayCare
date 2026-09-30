"use client";
/* eslint-disable @next/next/no-img-element -- pratinjau foto lokal (blob/data URL) */
import * as React from "react";
import { Camera as CameraIcon, ImagePlus, RefreshCw, SwitchCamera } from "lucide-react";
import { api } from "@/lib/api";
import { meals, pendingPlates } from "@/lib/derive";
import { fmtNum, fmtTime, mealLabel } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import * as VZ from "@/lib/vision";
import { loadFoodNet } from "@/lib/foodnet";
import type { LogEntry, MealKey } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Empty, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { TableWrap } from "@/components/ui/table-wrap";
import { AuthImg } from "@/components/shared/auth-img";

type Source = "camera" | "photo" | null;
const MEALS: MealKey[] = ["lunch", "snack_am", "snack_pm", "breakfast"];

export function Scanner({ preset, onDone }: { preset: { childId: string; meal: MealKey; stage: VZ.Stage } | null; onDone?: () => void }) {
  const { state: s, refresh } = useLive();
  const toast = useToast();
  const { busy: saving, run } = useAction();
  const children = s.children;
  const foods = s.foods;

  const [childId, setChildId] = React.useState(preset?.childId ?? children[0]?.id ?? "");
  const [meal, setMeal] = React.useState<MealKey>(preset?.meal ?? "lunch");
  const [stage, setStage] = React.useState<VZ.Stage>(preset?.stage ?? "pre");
  const [source, setSource] = React.useState<Source>(null);
  const [camOn, setCamOn] = React.useState(false);
  const [camBusy, setCamBusy] = React.useState(false);
  const [canFlip, setCanFlip] = React.useState(false);
  const [frozen, setFrozen] = React.useState(false);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [stageIdx, setStageIdx] = React.useState(-1);
  const [result, setResult] = React.useState<VZ.VisionResult | null>(null);
  const [rows, setRows] = React.useState<VZ.ScanRow[]>([]);
  const thumbRef = React.useRef<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const photoRef = React.useRef<HTMLImageElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const child = children.find((c) => c.id === childId) ?? children[0];
  const pending = React.useMemo(() => pendingPlates(s, child?.id).find((p) => p.meal === meal) ?? null, [s, child?.id, meal]);
  const mealsOf = (items: { name: string; pre?: number; grams?: number }[]) => items.map((i) => i.name + " " + (i.pre ?? i.grams ?? 0) + " g").join(", ");

  // bobot model pemeriksa (≈ 60 KB) dimuat begitu halaman terbuka agar pindaian pertama tidak menunggu unduhan
  React.useEffect(() => {
    void loadFoodNet().catch(() => null);
  }, []);

  // pilihan anak/waktu makan berubah → tahap otomatis (sesudah bila sudah ada piring yang menunggu)
  React.useEffect(() => {
    if (preset && preset.childId === childId && preset.meal === meal) {
      setStage(preset.stage);
      return;
    }
    setStage(pending ? "post" : "pre");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, meal]);

  React.useEffect(() => {
    if (preset) {
      setChildId(preset.childId);
      setMeal(preset.meal);
      setStage(preset.stage);
    }
  }, [preset]);

  const drawOverlay = React.useCallback(() => {
    const media = source === "camera" && !frozen ? videoRef.current : photoRef.current;
    VZ.draw(canvasRef.current, result, {
      guide: source === "camera" && !result,
      media,
    });
  }, [source, frozen, result]);

  React.useEffect(() => {
    drawOverlay();
    window.addEventListener("resize", drawOverlay);
    return () => window.removeEventListener("resize", drawOverlay);
  }, [drawOverlay]);

  const stopCam = React.useCallback(() => {
    VZ.camera.stop(videoRef.current);
    setCamOn(false);
    setCanFlip(false);
    setSource((src) => (src === "camera" ? (frozen ? "photo" : null) : src));
  }, [frozen]);

  const startCam = async () => {
    if (!VZ.camera.supported()) {
      toast("Kamera tidak tersedia di peramban ini. Gunakan Pilih foto.", "err");
      return;
    }
    setCamBusy(true);
    try {
      if (videoRef.current) await VZ.camera.start(videoRef.current);
      setCamOn(true);
      setFrozen(false);
      setResult(null);
      setRows([]);
      setSource("camera");
      setCanFlip((await VZ.camera.count()) >= 2);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      toast(
        name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan kamera di peramban, atau gunakan Pilih foto."
          : "Kamera tidak bisa dibuka. Anda tetap bisa memilih foto piring.",
        "err",
      );
    }
    setCamBusy(false);
  };

  React.useEffect(() => {
    const onVis = () => {
      if (document.hidden) stopCam();
    };
    document.addEventListener("visibilitychange", onVis);
    const video = videoRef.current;
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      VZ.camera.stop(video);
    };
  }, [stopCam]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("Berkas itu bukan gambar yang bisa dibaca.", "err");
      return;
    }
    if (camOn) VZ.camera.stop(videoRef.current);
    setCamOn(false);
    setCanFlip(false);
    const url = URL.createObjectURL(f);
    if (photoUrl?.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(url);
    setFrozen(false);
    setResult(null);
    setRows([]);
    setSource("photo");
  };

  const scan = async () => {
    const useCam = source === "camera" && !frozen;
    const src = useCam ? videoRef.current : photoRef.current;
    if (!src || (useCam && (src as HTMLVideoElement).readyState < 2) || (!useCam && !(src as HTMLImageElement).naturalWidth)) {
      toast("Gambar belum siap. Tunggu sebentar.", "err");
      return;
    }
    if (stage === "post" && !pending) {
      toast("Pindai piring saat disajikan terlebih dahulu.", "err");
      setStage("pre");
      return;
    }
    setScanning(true);
    setResult(null);
    setStageIdx(0);
    try {
      const grab = useCam ? VZ.frame(src, 720) : null;
      const base: VZ.MediaSource = grab ? grab.canvas : src;
      thumbRef.current = VZ.thumb(base, 240, 0.62);
      const still = grab ? grab.canvas.toDataURL("image/jpeg", 0.85) : null;
      const res = await VZ.analyze(base, {
        plateCm: s.thresholds.plateDiameterCm || 22,
        stage,
        onStage: (_n, i) =>
          new Promise<void>((ok) => {
            setStageIdx(i);
            setTimeout(ok, i ? 140 : 40);
          }),
      });
      setStageIdx(VZ.STAGE_NAMES.length);
      if (still) {
        if (photoUrl?.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
        setPhotoUrl(still);
        setFrozen(true);
      }
      setRows(
        res.items.map((i) => ({
          name: i.name,
          grams: i.grams,
          family: i.family,
          conf: i.conf,
          cat: i.cat,
        })),
      );
      setResult(res);
      if (!res.items.length) toast(VZ.VERDICT_TEXT[res.verdict] || "Tidak ada makanan yang dikenali.", "err");
    } catch {
      toast("Pindaian gagal dibaca. Coba lagi.", "err");
      setStageIdx(-1);
    }
    setScanning(false);
  };

  const resume = () => {
    setResult(null);
    setRows([]);
    setStageIdx(-1);
    if (camOn) {
      setFrozen(false);
      setSource("camera");
    } else if (source === "photo" && !frozen) setSource("photo");
    else {
      setFrozen(false);
      setSource(null);
      setPhotoUrl(null);
    }
  };

  const nut = VZ.nutrition(rows, foods);
  const isPost = stage === "post" && !!pending;
  const preItems = (pending?.items as { name: string; pre: number }[] | undefined)?.map((i) => ({ name: i.name, grams: i.pre })) ?? [];
  const match = isPost ? VZ.matchLeftovers(preItems, nut.items) : null;
  const cons = match ? VZ.consumption(match.rows, foods) : null;

  const save = async () => {
    if (!child || !result) return;
    if (!nut.items.length) {
      toast("Tambahkan minimal satu menu.", "err");
      return;
    }
    const photo = thumbRef.current;
    if (!photo) {
      toast("Foto piring belum tersimpan. Pindai ulang.", "err");
      return;
    }
    const boxes = result.items.filter((i) => nut.items.some((n) => n.name === i.name)).map((i) => ({ ...i.box, label: i.name }));
    if (!isPost) {
      const r = await run(
        () =>
          api.post<{ entry: LogEntry }>("/api/log/plate", {
            childId: child.id,
            meal,
            items: nut.items.map((i) => ({ name: i.name, grams: i.grams })),
            photo,
            boxes,
            conf: result.conf,
            plateCm: s.thresholds.plateDiameterCm || 22,
          }),
        {
          ok: `Piring ${child.short} tersimpan. Pindai lagi sesudah anak selesai makan.`,
        },
      );
      if (r) {
        await refresh();
        resume();
        setStage("post");
        onDone?.();
      }
    } else if (pending && cons) {
      const r = await run(
        () =>
          api.post<{ entry: LogEntry }>("/api/log/meal", {
            plateId: pending.id,
            items: cons.items.map((i) => ({
              name: i.name,
              pre: i.pre,
              post: i.post,
            })),
            photo,
            boxes,
            conf: result.conf,
          }),
        {
          ok: `Catatan ${mealLabel(meal).toLowerCase()} ${child.short} terkirim ke orang tua: ${cons.total.pct}% porsi, ${cons.total.kcal} kkal.`,
        },
      );
      if (r) {
        await refresh();
        resume();
        setStage("pre");
        onDone?.();
      }
    }
  };

  if (!child) return <Empty>Belum ada data anak.</Empty>;
  const hint =
    stage === "pre"
      ? pending
        ? `Piring ${child.short} untuk ${mealLabel(meal).toLowerCase()} sudah dipindai pukul ${fmtTime(pending.at)}. Memindai lagi akan menggantikannya.`
        : "Pindai piring saat disajikan, sebelum anak mulai makan."
      : pending
        ? `Dibandingkan dengan piring saat disajikan pukul ${fmtTime(pending.at)}: ${mealsOf(pending.items ?? [])}.`
        : `Belum ada pindaian saat disajikan untuk ${child.short} (${mealLabel(meal).toLowerCase()}). Pindai piring sebelum makan terlebih dahulu.`;

  return (
    <Panel>
      <PanelHead title="Pindai piring" desc="Menu dikenali di perangkat ini; foto dikirim setelah Anda memeriksa hasilnya." />
      <PanelBody className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Anak" htmlFor="sc-child">
            <Select id="sc-child" value={child.id} onChange={(e) => setChildId(e.target.value)}>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Waktu makan" htmlFor="sc-meal">
            <Select id="sc-meal" value={meal} onChange={(e) => setMeal(e.target.value as MealKey)}>
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {mealLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tahap">
            <div className="border-line-strong inline-flex h-[42px] rounded-md border p-0.5" role="group" aria-label="Tahap pindaian">
              {(["pre", "post"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStage(st)}
                  aria-pressed={stage === st}
                  className={"rounded px-3 text-[13.5px] font-medium " + (stage === st ? "bg-ink text-white" : "text-ink-2 hover:bg-wash")}
                >
                  {st === "pre" ? "Sebelum makan" : "Sesudah makan"}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Note tone={stage === "post" && !pending ? "warn" : "info"}>{hint}</Note>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-3">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#111a2e]">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={"absolute inset-0 h-full w-full object-contain " + (source === "camera" && !frozen ? "" : "hidden")}
              />
              <img
                ref={photoRef}
                src={photoUrl ?? undefined}
                alt=""
                onLoad={drawOverlay}
                className={"absolute inset-0 h-full w-full object-contain " + (photoUrl && (source === "photo" || frozen) ? "" : "hidden")}
              />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
              {!source ? (
                <div className="text-side-ink/80 absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                  <CameraIcon size={28} className="text-teal-400" />
                  <p className="text-[14px] font-semibold text-white">Nyalakan kamera atau pilih foto piring saji.</p>
                  <p className="text-slate-300 text-[12.5px] max-w-sm">
                    Posisikan piring pas di dalam lingkaran bidik. Pastikan tiap jenis makanan (nasi, lauk, sayur, buah) tidak saling menumpuk rapat untuk hasil deteksi bahan yang tajam dan akurat.
                  </p>
                </div>
              ) : null}
              {source === "camera" && !frozen ? (
                <span className="bg-ink/75 absolute top-3 left-3 rounded px-2 py-0.5 text-[12px] font-semibold text-white">Kamera aktif</span>
              ) : null}
              {scanning && stageIdx >= 0 ? (
                <ol className="bg-ink/80 absolute inset-x-3 bottom-3 grid gap-1 rounded-lg p-3 text-[13px] text-white" aria-live="polite">
                  {VZ.STAGE_NAMES.map((n, i) => (
                    <li key={n} className={"flex items-center gap-2 " + (i < stageIdx ? "text-teal-300" : i === stageIdx ? "font-semibold" : "text-white/50")}>
                      <span
                        className={"h-1.5 w-1.5 rounded-full " + (i < stageIdx ? "bg-teal-300" : i === stageIdx ? "bg-white" : "bg-white/30")}
                        aria-hidden
                      />
                      {n}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={camOn ? stopCam : startCam} disabled={camBusy}>
                <CameraIcon size={16} /> {camBusy ? "Menyalakan…" : camOn ? "Matikan kamera" : "Nyalakan kamera"}
              </Button>
              {camOn && canFlip ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    VZ.camera.flip();
                    await startCam();
                  }}
                >
                  <SwitchCamera size={16} /> Balik kamera
                </Button>
              ) : null}
              <Button onClick={() => fileRef.current?.click()}>
                <ImagePlus size={16} /> Pilih foto
              </Button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} aria-label="Pilih foto piring" />
              <Button variant="primary" onClick={scan} disabled={!source || scanning} className="ml-auto">
                {scanning ? "Memindai…" : result ? "Pindai lagi" : "Pindai"}
              </Button>
            </div>
          </div>

          <div className="min-w-0">
            {result ? (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <b className="text-[15px]">
                      {!isPost ? `Piring ${child.short} saat disajikan` : `Sisa piring ${child.short}`} · {mealLabel(meal)}
                    </b>
                    <div className="text-muted text-[13px]">
                      {result.items.length
                        ? `${result.items.length} menu dikenali dari foto`
                        : VZ.VERDICT_TEXT[result.verdict] || "Tidak ada makanan yang dikenali"}
                      {result.items.length && !result.plate.found ? " · piring tidak ditemukan di foto, perkiraan berat kurang tepat" : ""}
                      {result.model.used ? "" : " · model pemeriksa tidak termuat, hasil hanya dari warna dan bentuk"}
                      {result.model.dropped ? ` · ${result.model.dropped} bagian dinilai bukan makanan dan dibuang` : ""}
                      {result.model.relabeled ? ` · ${result.model.relabeled} menu dikoreksi oleh model` : ""}
                    </div>
                  </div>
                  {result.items.length ? (
                    <Badge tone={result.level === "tinggi" ? "ok" : result.level === "sedang" ? "warn" : "danger"} dot>
                      Keyakinan {result.level}
                    </Badge>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <div className="text-muted grid grid-cols-[minmax(0,1fr)_92px_72px_32px] gap-2 px-1 text-[11.5px] font-semibold tracking-[0.04em] uppercase">
                    <span>Menu</span>
                    <span>Berat</span>
                    <span className="text-right">Energi</span>
                    <span />
                  </div>
                  {nut.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_92px_72px_32px] items-center gap-2">
                      <div className="min-w-0">
                        <Select
                          aria-label="Menu"
                          value={it.name}
                          className="h-9 py-1 text-[13.5px]"
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows((rs) =>
                              rs.map((r, k) =>
                                k === i
                                  ? {
                                      ...r,
                                      name: v,
                                      conf: 0,
                                      family: VZ.familyOf(v),
                                    }
                                  : r,
                              ),
                            );
                          }}
                        >
                          {foods.map((f) => (
                            <option key={f.id} value={f.name}>
                              {f.name}
                            </option>
                          ))}
                          {foods.some((f) => f.name === it.name) ? null : <option value={it.name}>{it.name}</option>}
                        </Select>
                        <div
                          className="text-muted mt-0.5 truncate text-[11.5px]"
                          title={
                            rows[i]?.conf
                              ? "Perkiraan seberapa sering nama seperti ini dibiarkan apa adanya pada uji foto. Keyakinan rendah: periksa dulu namanya."
                              : "Nama ini ditulis sendiri, bukan hasil pembacaan foto."
                          }
                        >
                          {rows[i]?.conf ? "Dikenali otomatis · keyakinan " + VZ.level(rows[i].conf ?? 0) : "Ditambahkan manual"}
                        </div>
                      </div>
                      <label className="text-muted flex items-center gap-1 text-[13px]">
                        <Input
                          type="number"
                          min={0}
                          step={5}
                          inputMode="numeric"
                          aria-label="Berat gram"
                          value={it.grams}
                          className="h-9 px-2 py-1 text-[13.5px]"
                          onChange={(e) =>
                            setRows((rs) =>
                              rs.map((r, k) =>
                                k === i
                                  ? {
                                      ...r,
                                      grams: Math.max(0, Math.round(Number(e.target.value) || 0)),
                                    }
                                  : r,
                              ),
                            )
                          }
                        />
                        g
                      </label>
                      <div className="text-right text-[13.5px] tabular-nums">{it.kcal} kkal</div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label="Hapus baris"
                        onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                  {!nut.items.length ? <Empty>Belum ada menu. Tambahkan secara manual.</Empty> : null}
                </div>
                <div className="bg-wash grid grid-cols-2 gap-2 rounded-lg p-3 text-[13px] sm:grid-cols-5">
                  {[
                    [nut.total.grams + " g", "Total berat"],
                    [nut.total.kcal + " kkal", "Energi"],
                    [fmtNum(nut.total.protein, 1) + " g", "Protein"],
                    [fmtNum(nut.total.carbs, 1) + " g", "Karbohidrat"],
                    [fmtNum(nut.total.fat, 1) + " g", "Lemak"],
                  ].map(([v, k]) => (
                    <div key={k}>
                      <b className="block text-[15px] tabular-nums">{v}</b>
                      <span className="text-muted">{k}</span>
                    </div>
                  ))}
                </div>
                {stage === "post" && !isPost ? (
                  <Note tone="warn">
                    Belum ada pindaian saat disajikan untuk {child.short} ({mealLabel(meal).toLowerCase()}), jadi hasil ini akan disimpan sebagai piring yang
                    disajikan.
                  </Note>
                ) : null}
                {isPost && cons && match && pending ? (
                  <div className="rounded-lg border border-teal-200 bg-teal-100/50 p-4">
                    <div className="text-[18px] font-semibold">
                      {cons.total.pct}% porsi habis · {fmtNum(cons.total.kcal)} kkal
                    </div>
                    <div className="mt-1 text-[13px] text-teal-900">
                      Disajikan pukul {fmtTime(pending.at)} · {cons.total.pre} g, dimakan {cons.total.pre - cons.total.post} g · protein{" "}
                      {fmtNum(cons.total.protein, 1)} g, karbohidrat {fmtNum(cons.total.carbs, 1)} g, lemak {fmtNum(cons.total.fat, 1)} g
                    </div>
                    <TableWrap label="Rincian porsi per menu">
                      <table className="mt-3 table">
                        <thead>
                          <tr>
                            <th>Menu</th>
                            <th className="num">Awal</th>
                            <th className="num">Sisa</th>
                            <th className="num">Makan</th>
                            <th className="num">kkal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cons.items.map((i) => (
                            <tr key={i.name}>
                              <td>{i.name}</td>
                              <td className="num">{i.pre} g</td>
                              <td className="num">{i.post} g</td>
                              <td className="num">{i.eaten} g</td>
                              <td className="num">{i.kcal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                    {match.unmatched.length ? (
                      <p className="mt-2 text-[12.5px] text-teal-900">Tidak ada saat disajikan, diabaikan: {match.unmatched.join(", ")}.</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={save} disabled={saving}>
                    {saving ? "Menyimpan…" : !isPost ? "Simpan piring disajikan" : "Kirim ke orang tua"}
                  </Button>
                  <Button
                    onClick={() => {
                      const used = rows.map((r) => r.name);
                      const f = foods.find((x) => !used.includes(x.name)) ?? foods[0];
                      if (f)
                        setRows((rs) => [
                          ...rs,
                          {
                            name: f.name,
                            grams: 50,
                            conf: 0,
                            family: VZ.familyOf(f.name),
                          },
                        ]);
                    }}
                  >
                    Tambah menu
                  </Button>
                  <Button variant="ghost" onClick={resume}>
                    <RefreshCw size={15} /> Pindai ulang
                  </Button>
                </div>
                <p className="text-muted text-[12.5px] leading-relaxed">
                  Berat diperkirakan dari luas makanan di piring
                  {result.plate.found ? ` (piring ${s.thresholds.plateDiameterCm || 22} cm)` : ""}. Ubah menu atau berat bila perlu; yang tersimpan adalah angka
                  setelah Anda periksa.
                </p>
              </div>
            ) : (
              <div className="text-muted grid gap-3 text-[14px]">
                <p>
                  <b className="text-ink">Cara memindai:</b> letakkan piring di atas alas polos, pastikan seluruh piring masuk bingkai, lalu tekan <b>Pindai</b>
                  . Hasil bisa dikoreksi sebelum disimpan.
                </p>
                <p>
                  Pindaian <b>sebelum makan</b> mencatat menu dan porsi yang disajikan. Pindaian <b>sesudah makan</b> membandingkan sisa dengan porsi awal dan
                  mengirim hasilnya ke orang tua.
                </p>
              </div>
            )}
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

export function PendingAndSent({ onScanPost }: { onScanPost: (p: LogEntry) => void }) {
  const { state: s } = useLive();
  const pend = pendingPlates(s);
  const sent = meals(s);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHead title="Menunggu pindaian sesudah makan" desc={pend.length ? `${pend.length} piring` : undefined} />
        <PanelBody>
          {pend.length ? (
            <ul className="divide-line divide-y">
              {pend.map((p) => (
                <li key={p.id} className="flex gap-3 py-3">
                  {p.photoPreUrl ? (
                    <AuthImg src={p.photoPreUrl} alt="" className="border-line h-14 w-[74px] shrink-0 rounded-md border object-cover" />
                  ) : (
                    <time className="text-muted w-12 shrink-0 tabular-nums">{fmtTime(p.at)}</time>
                  )}
                  <div className="min-w-0 flex-1">
                    <b className="text-[14px]">{p.child}</b> · {mealLabel(p.meal)}
                    <div className="text-muted text-[13px]">
                      {fmtTime(p.at)} · {(p.items as { name: string; pre: number }[]).map((i) => `${i.name} ${i.pre} g`).join(", ")}
                    </div>
                    <Button size="sm" className="mt-2" onClick={() => onScanPost(p)}>
                      Pindai sesudah makan
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Tidak ada. Pindai piring saat disajikan agar muncul di sini.</Empty>
          )}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Terkirim ke orang tua hari ini" desc={sent.length ? `${sent.length} catatan makan` : undefined} />
        <PanelBody>
          {sent.length ? (
            <ul className="divide-line divide-y">
              {sent.map((e) => (
                <li key={e.id} className="flex gap-3 py-3">
                  {e.photoPostUrl ? (
                    <AuthImg src={e.photoPostUrl} alt="" className="border-line h-14 w-[74px] shrink-0 rounded-md border object-cover" />
                  ) : (
                    <time className="text-muted w-12 shrink-0 tabular-nums">{fmtTime(e.at)}</time>
                  )}
                  <div className="min-w-0">
                    <b className="text-[14px]">{e.child}</b> · {e.title}
                    <div className="text-muted text-[13px]">
                      {fmtTime(e.at)} · {e.text} · {e.by}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Belum ada catatan makan yang dikirim hari ini.</Empty>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
