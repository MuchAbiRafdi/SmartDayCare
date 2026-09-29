"""Ekspor model terlatih ke (1) ONNX dan (2) berkas biner ringkas untuk peramban.

Jalankan:  python3 export.py [nama-model]      (bawaan: food-patch-v2)
Keluaran:  models/<nama>.onnx
           ../web/public/models/<nama>.bin   (dipakai web/src/lib/foodnet.ts)

Format .bin (little-endian):
  4 byte  "SDFN"        penanda
  u32     versi = 1
  u32     panjang JSON  header
  JSON    {classes, mean, std, patch, layers:[{name,type,cin,cout,k,pool}], meta}
  float16 bobot tiap lapisan berurutan: W[cout][cin][k][k] lalu b[cout]
BatchNorm dilipat ke bobot konvolusi supaya runtime peramban hanya perlu
konvolusi + ReLU + max-pool + rata-rata.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np
import torch

from train import CLASSES, MEAN, PATCH, STD, FoodNet

ROOT = Path(__file__).resolve().parent
WEB_MODELS = ROOT.parent / "web" / "public" / "models"


def fold(conv: torch.nn.Conv2d, bn: torch.nn.BatchNorm2d) -> tuple[np.ndarray, np.ndarray]:
    g = bn.weight.detach() / torch.sqrt(bn.running_var + bn.eps)
    w = conv.weight.detach() * g.view(-1, 1, 1, 1)
    b = bn.bias.detach() - bn.running_mean * g
    return w.numpy().astype(np.float32), b.numpy().astype(np.float32)


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else "food-patch-v2"
    ck = torch.load(ROOT / "models" / f"{name}.pt", map_location="cpu")
    meta = ck["meta"]
    # v1 tidak menyimpan arsitektur di meta (12,24,40,48); v2+ menyimpannya
    model = FoodNet(ch=tuple(meta.get("arch") or (12, 24, 40, 48)))
    model.load_state_dict(ck["state"])
    model.eval()

    # 1) ONNX (masukan dinamis: N×3×H×W → peta logit rapat)
    class Dense(torch.nn.Module):
        def __init__(self, m: FoodNet) -> None:
            super().__init__()
            self.m = m

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return self.m.dense(x)

    onnx_path = ROOT / "models" / f"{name}.onnx"
    torch.onnx.export(
        Dense(model),
        torch.zeros(1, 3, 96, 128),
        str(onnx_path),
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "n", 2: "h", 3: "w"}, "logits": {0: "n", 2: "h", 3: "w"}},
        opset_version=17,
        dynamo=False,
    )
    print("ONNX:", onnx_path, onnx_path.stat().st_size, "byte")

    # 2) biner ringkas
    layers: list[dict[str, object]] = []
    blobs: list[np.ndarray] = []
    for i, (conv, bn, pool) in enumerate(zip(model.convs, model.bns, model.pools())):
        w, b = fold(conv, bn)
        layers.append({"name": f"conv{i + 1}", "type": "conv", "cin": w.shape[1], "cout": w.shape[0], "k": 3, "pool": pool})
        blobs.append(w.ravel())
        blobs.append(b.ravel())
    fw = model.fc.weight.detach().numpy().astype(np.float32)
    fb = model.fc.bias.detach().numpy().astype(np.float32)
    layers.append({"name": "fc", "type": "fc", "cin": fw.shape[1], "cout": fw.shape[0], "k": 1, "pool": False})
    blobs.append(fw.ravel())
    blobs.append(fb.ravel())
    header = {
        "classes": CLASSES,
        "mean": list(MEAN),
        "std": list(STD),
        "patch": PATCH,
        "window": 6,
        "stride": 8,
        "layers": layers,
        "meta": {
            "name": name,
            **{
                k: meta[k]
                for k in ("version", "arch", "images", "patches", "val_accuracy", "val_balanced_accuracy", "val_image_accuracy", "val_per_class", "val_precision_conf06", "trained_at", "params")
                if k in meta
            },
        },
    }
    hj = json.dumps(header, separators=(",", ":")).encode("utf-8")
    payload = np.concatenate(blobs).astype(np.float16).tobytes()
    WEB_MODELS.mkdir(parents=True, exist_ok=True)
    out = WEB_MODELS / f"{name}.bin"
    with out.open("wb") as f:
        f.write(b"SDFN")
        f.write(struct.pack("<II", 1, len(hj)))
        f.write(hj)
        f.write(payload)
    print("BIN:", out, out.stat().st_size, "byte")

    # 3) contoh keluaran untuk verifikasi runtime peramban (ai/verify.mjs)
    # Catatan: torch.onnx.export memulihkan mode pembungkus Dense (bawaan: training) setelah ekspor,
    # sehingga BatchNorm model ikut kembali ke mode latih. Paksa eval lagi sebelum menghitung contoh.
    model.eval()
    rng = np.random.default_rng(1)
    img = rng.integers(0, 256, size=(72, 96, 3), dtype=np.uint8)
    x = torch.from_numpy(img).permute(2, 0, 1).float().unsqueeze(0) / 255.0
    x = (x - torch.tensor(MEAN).view(1, 3, 1, 1)) / torch.tensor(STD).view(1, 3, 1, 1)
    with torch.no_grad():
        logits = model.dense(x)[0]
        probs = torch.softmax(logits, 0).permute(1, 2, 0).reshape(-1, len(CLASSES)).numpy()
    np.savez(ROOT / "models" / "verify-sample.npz", img=img, probs=probs.astype(np.float32))
    rgba = np.concatenate([img, np.full(img.shape[:2] + (1,), 255, np.uint8)], axis=2).reshape(-1)
    (ROOT / "models" / "verify-sample.json").write_text(
        json.dumps({"w": int(img.shape[1]), "h": int(img.shape[0]), "img": rgba.tolist(), "probs": probs.astype(float).ravel().tolist()})
    )
    print("verifikasi:", ROOT / "models" / "verify-sample.json", probs.shape)


if __name__ == "__main__":
    main()
