"""Publish reviewed JSON to the offline browser bundle. Does not fetch or fabricate data."""
from pathlib import Path
import json,subprocess,sys
root=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(root/'maintenance/validate_data.py')],check=True)
subprocess.run([sys.executable,str(root/'maintenance/validate_experiences.py')],check=True)
d=json.load(open(root/'data/flights.json'))
(root/'data/flights.js').write_text('window.ATLAS_DATA='+json.dumps(d,ensure_ascii=False,separators=(',',':'))+';\n')
(root/'data/coverage.json').write_text(json.dumps(d['coverage'],ensure_ascii=False,indent=2))
for file, variable in [('experiences', 'ATLAS_EXPERIENCES'), ('remote-routes', 'REMOTE_ROUTES')]:
 data=json.loads((root/f'data/{file}.json').read_text())
 (root/f'data/{file}.js').write_text('window.'+variable+'='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
print('Published',len(d['flights']),'reviewed passenger records, experiences and remote routes. Verification dates unchanged.')
