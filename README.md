# 🖼️ Compare Frames – ComfyUI Extension

![Compare Frames Node](node.jpg)

**Compare Frames** is a custom [ComfyUI](https://github.com/comfyanonymous/ComfyUI) extension for precise, frame-by-frame analysis of image sequences and video batches. It renders two sequences in an interactive A/B comparison viewer directly inside the ComfyUI node — with a wipe slider, side-by-side mode, and full video playback controls.

Ideal for evaluating differences in video generation pipelines, upscaling results, style transfers, or any workflow where you need to compare two sequences frame-by-frame.

---

## 🚀 Features

**Two comparison layouts**
- **⧪ Slider** — both sequences are drawn at full size, overlapping. Drag the green handle left or right to reveal A or B in a true wipe/reveal effect.
- **⬛⬛ Side by Side** — canvas splits 50/50 with a divider, showing A and B simultaneously.

**Video playback**
- **▶ Play / ⏸ Pause** — plays through both sequences in sync at the configured fps.
- **◀ / ▶ Step** — step one frame at a time; updates the `compare_frame` widget live.
- **↺ Loop** — toggle looping at the end of the sequence.
- **Speed selector** — 0.25×, 0.5×, 1×, 1.5×, 2×, 4×.

**Scrubber bar**
- Drag to jump to any frame instantly. Shows current frame / total frames at all times.

**Offset syncing**
- A base `compare_frame` playhead plus per-side `skip_a` and `skip_b` offsets. Perfectly sync two sequences that start at different points and scrub them together.

**Frontend caching**
- Image batches are cached in the browser after the first run. Changing frames, offsets, or layout updates the view instantly — no need to re-queue the prompt.

**Header overlay**
- Always shows the resolved frame index for A and B (after offsets) and the base frame number.

**Nodes 2.0 Compatible**
- Fully compatible with ComfyUI's Vue-based frontend.

---

## 🎛️ Inputs

| Input | Type | Description |
|---|---|---|
| `images_a` | IMAGE | First image sequence (A side) |
| `images_b` | IMAGE | Second image sequence (B side) |
| `compare_frame` | INT | Base frame number for both sequences |
| `skip_a` | INT | Frame offset applied on top of `compare_frame` for A |
| `skip_b` | INT | Frame offset applied on top of `compare_frame` for B |
| `fps` | FLOAT | Playback speed in frames per second (default 12) |

---

## 📦 Installation

1. Navigate to your ComfyUI `custom_nodes` directory.
2. Clone this repository or create a folder named `ssd_frame_compare`.
3. Ensure the directory structure matches:

```text
ComfyUI/
└── custom_nodes/
    └── ssd_frame_compare/
        ├── README.md             <-- (This file)
        ├── node.jpg              <-- (Preview image)
        ├── __init__.py           <-- (Node registration)
        ├── compare_frames.py     <-- (Backend logic)
        └── web/
            └── compare_frames.js <-- (Frontend UI)
```

4. Restart ComfyUI. The node will appear in the **preview** category as **🖼️ Compare Frames**.
