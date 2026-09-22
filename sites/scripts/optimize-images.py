"""Generate responsive web assets without changing the original photographs."""
from pathlib import Path
from PIL import Image, ImageOps
import hashlib
import json

root = Path(__file__).resolve().parents[1]
destination = root / 'public' / 'optimized'
destination.mkdir(exist_ok=True)
manifest = {}
original_bytes = optimized_bytes = 0
for source in sorted((root / 'public' / 'imported').glob('*.jpg')):
    original_bytes += source.stat().st_size
    variants = {}
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        for width in (640, 1280):
            variant = image.copy()
            variant.thumbnail((width, width), Image.Resampling.LANCZOS)
            from io import BytesIO
            buffer = BytesIO()
            variant.save(buffer, 'WEBP', quality=82, method=6)
            payload = buffer.getvalue()
            name = f'{source.stem}-{width}-{hashlib.sha256(payload).hexdigest()[:12]}.webp'
            (destination / name).write_bytes(payload)
            variants[str(width)] = '/optimized/' + name
            variants['width' + str(width)] = str(variant.width)
            if width == 640:
                optimized_bytes += len(payload)
            with Image.open(destination / name) as check:
                assert max(check.size) <= width and check.format == 'WEBP'
                check.verify()
    manifest[source.stem] = variants
(root / 'src' / 'lib' / 'image-assets.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
print(json.dumps({'images':len(manifest),'original_bytes':original_bytes,'card_bytes':optimized_bytes,'reduction_percent':round((1-optimized_bytes/original_bytes)*100,1)}))
