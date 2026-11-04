"""Retrieve one public timetable query. Does not alter the reviewed site dataset."""
from pathlib import Path
import argparse,json,urllib.request,hashlib,datetime
p=argparse.ArgumentParser();p.add_argument('--carrier',choices=['6r','kv','wz'],required=True);p.add_argument('--origin',required=True);p.add_argument('--destination',required=True);p.add_argument('--output',required=True);a=p.parse_args()
q=(Path(__file__).parent/'websky-query.graphql').read_text();url='https://'+a.carrier+'.webskyx.com/graphql/query/nemo'
payload={'operationName':'FullFlightsSchedule','query':q,'variables':{'parameters':[{'departure':a.origin,'arrival':a.destination}],'groupEqualFlights':False}}
r=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','User-Agent':'Mozilla/5.0','Origin':{'6r':'https://aero.alrosa.ru','kv':'https://www.krasavia.ru','wz':'https://flyredwings.com'}[a.carrier]})
with urllib.request.urlopen(r,timeout=45) as response:raw=response.read()
d=json.loads(raw)
if d.get('errors'):raise RuntimeError(d['errors'])
if not d.get('data',{}).get('FullFlightsSchedule'):raise RuntimeError('No timetable result')
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(raw)
out.with_suffix(out.suffix+'.meta.json').write_text(json.dumps({'url':url,'request':payload,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest()},ensure_ascii=False,indent=2))
print(out)
