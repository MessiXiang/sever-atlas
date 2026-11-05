#!/usr/bin/env python3
"""Static gates for the branch's offline artifact; standard library only."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
errors = []
def check(condition, message):
    if not condition:
        errors.append(message)

def resource(path, base):
    check(not re.match(r'^(?:[a-z]+:|//|/)', path, re.I), 'Nonlocal resource: ' + path)
    check('..' not in Path(path).parts, 'Parent resource path: ' + path)
    check((base / path).is_file(), 'Missing resource: ' + path)

class Page(HTMLParser):
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        check(tag not in ('iframe', 'object', 'embed', 'base', 'form'), 'Forbidden tag: ' + tag)
        check(not any(k.lower().startswith('on') for k in a), 'Inline event on ' + tag)
        check(not (tag == 'a' and 'href' in a), 'Unexpected navigation link')
        if tag == 'script':
            check(bool(a.get('src')) and a.get('type') != 'module', 'Script must be local classic script')
        for key in ('src', 'href'):
            if key in a:
                resource(a[key], DIST)

Page().feed((DIST / 'index.html').read_text())
check(not (DIST / 'data/geography.js').exists(), 'Full country basemap must not ship')
app_source = (DIST / 'app.js').read_text()
check('ATLAS_GEOGRAPHY' not in app_source and 'L.tileLayer(' not in app_source, 'Global or online basemap reintroduced')
check('ATLAS_RUSSIA_GEOGRAPHY' in app_source and 'stroke: false' in app_source, 'Expected limited reference layer without border strokes')
geo_source = (DIST / 'data/geography-russia.js').read_text()
geo = json.loads(geo_source[geo_source.index('{'):].rstrip(';' + chr(10) + ' '))
check(len(geo['features']) == 13, 'Unexpected reference polygon count')
for feature in geo['features']:
    check(feature['properties'] == {'layer':'russia-reference'}, 'Unreviewed country properties')
    check(feature['geometry']['type'] == 'Polygon', 'Unexpected reference geometry')
    points = feature['geometry']['coordinates'][0]
    check(not all(32 < p[0] < 37 and 44 < p[1] < 47 for p in points), 'Excluded peninsula must not reappear')
check('routeDiagramNote' in (DIST / 'index.html').read_text(), 'Missing route diagram explanation')

for path in DIST.rglob('*.css'):
    css = path.read_text()
    for url in re.findall(r'url\(["\x27]?([^\)"\x27]+)', css):
        if not url.startswith(('data:', '#')):
            resource(url, path.parent)
    check(not re.search(r'(?<![-\w])gap\s*:', css), 'Flex gap without margin fallback: ' + path.name)
    check(not re.search(r'\d+dvh|(?<!\w)(?:min|max|clamp)\(', css), 'Modern-only CSS: ' + path.name)
for path in (DIST / 'app.js', DIST / 'minitool-runtime.js', DIST / 'assets/search.js'):
    source = path.read_text()
    check(not re.search(r'\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker|WebAssembly|OffscreenCanvas|eval\s*\(|new\s+Function\b)|window\.open\s*\(|navigator\.(?:clipboard|geolocation)|(?:localStorage|sessionStorage)\.', source), 'Forbidden runtime API: ' + path.name)
    check(not re.search(r'<a\b|https?://|mailto:|tel:|\bdownload\s*=', source), 'Outbound UI reference: ' + path.name)
data_source = (DIST / 'data/flights.js').read_text()
data = json.loads(data_source[data_source.index('{'):].rstrip(';\n '))
check(len(data['flights']) == 2169, 'Unexpected flight record loss')
check(len(data['airports']) == 366, 'Unexpected airport loss')
for flight in data['flights']:
    check(flight['from'] in data['airports'] and flight['to'] in data['airports'], 'Missing airport')
    check(flight['source'] in data['sources'], 'Missing text source')
    check(flight['airline'] in data['airlines'], 'Missing airline')
check(not re.search(r'https?://|mailto:|tel:|www\.', data_source), 'URL in flight data')
manifest = json.loads((DIST / 'mini_tool.json').read_text())
check(manifest == {'is_high_consumption_scene': False}, 'Unexpected manifest')
with zipfile.ZipFile(ROOT / 'artifacts/maoji-xiaohongshu.zip') as z:
    names = z.namelist()
    check('index.html' in names and len(names) == len(set(names)), 'Invalid ZIP root or duplicate entries')
    for name in names:
        check(not name.startswith('/') and '..' not in Path(name).parts, 'Unsafe ZIP path')
        check(z.read(name) == (DIST / name).read_bytes(), 'ZIP differs from audited dist: ' + name)
if errors:
    raise SystemExit('\n'.join(sorted(set(errors))))
print(json.dumps({'static_checks': 'passed', 'flights': len(data['flights']),
    'airports': len(data['airports']), 'zip_entries': len(names)}, ensure_ascii=False))
