# 🖼️ Compare Specific Frames – ComfyUI Extension

**Compare Specific Frames** is a custom [ComfyUI](https://github.com/comfyanonymous/ComfyUI) extension designed for precise, frame-by-frame analysis of image sequences and video batches. It extracts specific frames from two different visual sequences and renders them in an interactive, wipe-style A/B comparison slider directly within the ComfyUI interface.

This tool is highly effective for evaluating the exact frame differences in video generation pipelines, upscaling results, or style transfers.

---

## 🚀 Features

* **Targeted Frame Extraction:** Use standard integer widgets to select exactly which frame to pull from Sequence A and Sequence B.
* **Interactive Wipe Preview:** Click and drag the horizontal slider on the node to seamlessly compare the two isolated frames.
* **Automatic Dimension Handling:** The canvas dynamically scales to fit the aspect ratio of your target images.
* **Lightweight UI:** Extracts only the required frames in the backend to minimize frontend memory load.

---

## 📦 Installation

1. Navigate to your ComfyUI `custom_nodes` directory.
2. Create a folder named `frame_comparer` (or clone this repository if hosted on Git).
3. Ensure the directory structure exactly matches the following:

```text
ComfyUI/
└── custom_nodes/
    └── frame_comparer/
        ├── README.md             <-- (This file)
        ├── __init__.py           <-- (Node registration)
        ├── compare_frames.py     <-- (Backend logic)
        └── web/
            └── compare_frames.js <-- (Frontend slider UI)