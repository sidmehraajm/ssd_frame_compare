from .compare_frames import CompareFrames

# Maps the internal class name to the Python class
NODE_CLASS_MAPPINGS = {
    "CompareFrames": CompareFrames,
}

# Maps the internal class name to the display name in the ComfyUI menu
NODE_DISPLAY_NAME_MAPPINGS = {
    "CompareFrames": "🖼️ Compare: Specific Frames",
}

# Tells ComfyUI to load frontend extensions from the "web" folder
WEB_DIRECTORY = "./web"

# Exposes these variables to the ComfyUI node loader
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']