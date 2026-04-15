from .compare_frames import CompareFrames

NODE_CLASS_MAPPINGS = {
    "CompareFrames": CompareFrames,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CompareFrames": "🖼️ Compare Frames",
}

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
