import torch
import os
from nodes import PreviewImage

class CompareFrames(PreviewImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images_a": ("IMAGE",),
                "images_b": ("IMAGE",),
                "frame_a": ("INT", {"default": 0, "min": 0, "max": 99999, "step": 1}),
                "frame_b": ("INT", {"default": 0, "min": 0, "max": 99999, "step": 1}),
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

    def compare_frames(self, images_a, images_b, frame_a, frame_b, prompt=None, extra_pnginfo=None, filename_prefix="temp.compare_frames."):
        result = { "ui": { "a_images":[], "b_images": [] } }

        # Path in output window
        print(f"CompareFrames processing: {len(images_a) if images_a is not None else 0} frames in A, {len(images_b) if images_b is not None else 0} frames in B")

        if images_a is not None:
            # Save all images in images_a to temp and return their metadata for the UI
            res_a = self.save_images(images_a, filename_prefix, prompt, extra_pnginfo)
            result['ui']['a_images'] = res_a['ui']['images']

        if images_b is not None:
            # Save all images in images_b to temp and return their metadata for the UI
            res_b = self.save_images(images_b, filename_prefix, prompt, extra_pnginfo)
            result['ui']['b_images'] = res_b['ui']['images']

        return result
