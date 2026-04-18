import torch
from nodes import PreviewImage


class CompareFrames(PreviewImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "compare_frame": ("INT",   {"default": 0,    "min": 0,      "max": 99999, "step": 1}),
                "skip_a":        ("INT",   {"default": 0,    "min": -99999, "max": 99999, "step": 1}),
                "skip_b":        ("INT",   {"default": 0,    "min": -99999, "max": 99999, "step": 1}),
                "fps":           ("FLOAT", {"default": 12.0, "min": 0.1,    "max": 60.0,  "step": 0.1}),
            },
            "optional": {
                "images_a": ("IMAGE",),
                "images_b": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            },
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "compare_frames"
    CATEGORY = "preview"

    def compare_frames(self, images_a, images_b, compare_frame, skip_a, skip_b, fps=12.0,
                       prompt=None, extra_pnginfo=None, filename_prefix="temp.compare_frames."):
        result = {"ui": {"a_images": [], "b_images": [], "fps": [fps]}}

        print(f"CompareFrames: A={len(images_a) if images_a is not None else 0} frames, "
              f"B={len(images_b) if images_b is not None else 0} frames, fps={fps}")

        if images_a is not None:
            res_a = self.save_images(images_a, filename_prefix, prompt, extra_pnginfo)
            result["ui"]["a_images"] = res_a["ui"]["images"]

        if images_b is not None:
            res_b = self.save_images(images_b, filename_prefix, prompt, extra_pnginfo)
            result["ui"]["b_images"] = res_b["ui"]["images"]

        return result
