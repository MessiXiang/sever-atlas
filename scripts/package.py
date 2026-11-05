#!/usr/bin/env python3
"""Build the offline artifact from an explicit allowlist; never publish."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    'index.html', 'style.css', 'app.js', 'minitool-runtime.js', 'legal-notices.js',
    'assets/leaflet.css', 'assets/leaflet.js', 'assets/search.js',
    'assets/maoji-icon.png', 'assets/maoji-logo.png',
    'data/flights.js', 'data/geography.js',
)
DIST = ROOT / 'dist'
OUT = ROOT / 'artifacts' / 'maoji-xiaohongshu.zip'

def build():
    if DIST.is_symlink() or OUT.parent.is_symlink():
        raise SystemExit('Output directories must not be symlinks')
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    for name in FILES:
        src, dst = ROOT / name, DIST / name
        if src.is_symlink() or not src.is_file():
            raise SystemExit('Missing or unsafe source: ' + name)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
    # Reviewed runtime: ordinary DOM/SVG Leaflet rendering; no Worker,
    # OffscreenCanvas, WebAssembly or game-engine startup.
    (DIST / 'mini_tool.json').write_text(
        json.dumps({'is_high_consumption_scene': False}) + '\n', encoding='utf-8')
    OUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(DIST.rglob('*')):
            if p.is_file():
                info = zipfile.ZipInfo(p.relative_to(DIST).as_posix(), (2026, 11, 5, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                z.writestr(info, p.read_bytes(), compresslevel=9)
    if OUT.stat().st_size > 10 * 1024 * 1024:
        raise SystemExit('Artifact exceeds 10 MiB')
    print(json.dumps({'artifact': str(OUT), 'bytes': OUT.stat().st_size,
        'sha256': hashlib.sha256(OUT.read_bytes()).hexdigest(),
        'files': len(FILES) + 1}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    build()
