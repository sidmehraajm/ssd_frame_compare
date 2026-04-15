import torch
from nodes import PreviewImage


class VideoCompare(PreviewImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images_a": ("IMAGE",),
                "images_b": ("IMAGE",),
                "fps": ("FLOAT", {"default": 12.0, "min": 0.1, "max": 60.0, "step": 0.1}),
            },
            "optional": {
                "images_b": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            },
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "compare_videos"
    CATEGORY = "preview"

    def compare_videos(self, images_a, images_b=None, fps=12.0, prompt=None, extra_pnginfo=None, filename_prefix="temp.video_compare."):
        result = {"ui": {"a_images": [], "b_images": [], "fps": [fps]}}

        print(f"VideoCompare: A={len(images_a) if images_a is not None else 0} frames, B={len(images_b) if images_b is not None else 0} frames, fps={fps}")

        if images_a is not None:
            res_a = self.save_images(images_a, filename_prefix, prompt, extra_pnginfo)
            result["ui"]["a_images"] = res_a["ui"]["images"]

        if images_b is not None:
            res_b = self.save_images(images_b, filename_prefix, prompt, extra_pnginfo)
            result["ui"]["b_images"] = res_b["ui"]["images"]

        return result
