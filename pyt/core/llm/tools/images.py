
import base64
import subprocess
from pathlib import Path
from typing import Optional

_media_types = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".gif":  "image/gif",
    ".webp": "image/webp",
}

def encode_image(path: str | Path) -> tuple[str, str]:
    path = Path(path)
    media_type = _media_types.get(path.suffix.lower())
    if media_type is None:
        # TODO
        # if media_type is literally anything that can be imagemagicked into an image, pngify it
        raise ValueError(f"unsupported image extension {path.suffix!r}")
    data = base64.b64encode(path.read_bytes()).decode()
    return data, media_type

def transform(
    path: str | Path,
    *imagemagick_args: str,
    output_format: str = "png",
) -> tuple[bytes, str]:
    media_type = _media_types.get(f".{output_format.lower()}")
    if media_type is None:
        raise ValueError(f"unsupported output_format {output_format!r}")

    cmd = ["convert", "-", *imagemagick_args, f"{output_format}:-"]
    result = subprocess.run(
        cmd,
        input=Path(path).read_bytes(),
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"imagemagick exited {result.returncode}:\n{result.stderr.decode(errors='replace')}"
        )
    return result.stdout, media_type

def image_content_entry(
    path: str | Path,
    media_type: Optional[str] = None,
    *,
    imagemagick_args: Optional[list[str]] = None,
    output_format: str = "png",
) -> dict:
    if imagemagick_args is not None:
        raw, inferred_type = transform(path, *imagemagick_args, output_format=output_format)
        data = base64.b64encode(raw).decode()
    else:
        data, inferred_type = encode_image(path)
    return {
        "type": "image_url",
        "image_url": {
            "url": f"data:{media_type or inferred_type};base64,{data}"
        }
    }

def image_message(
    role: str,
    text: str,
    *image_paths: str | Path,
    imagemagick_args: Optional[list[str]] = None,
    output_format: str = "png",
) -> dict:
    content = [
        image_content_entry(p, imagemagick_args=imagemagick_args, output_format=output_format)
        for p in image_paths
    ] + [{"type": "text", "text": text}]
    return {"role": role, "content": content}

