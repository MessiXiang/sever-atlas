from pathlib import Path
import json,re,datetime,collections
ROOT=Path(__file__).resolve().parents[1]
D=json.load(open(ROOT/'data/flights.json'));F=D['flights'];A=D['airports'];errors=[]
for f in F:
 for key,coll in [('from',A),('to',A),('airline',D['airlines']),('source',D['sources'])]:
  if f[key] not in coll:errors.append([f['id'],'missing '+key,f[key]])
 for t in ['departure','arrival']:
  if f[t] and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',f[t]):errors.append([f['id'],'bad time',f[t]])
 if any(x not in range(1,8) for x in f['days']):errors.append([f['id'],'bad weekday',f['days']])
 for d in f.get('dates') or []:
  datetime.date.fromisoformat(d)
  if d<f['start'] or (f['end'] and d>f['end']):errors.append([f['id'],'date outside period',d])
 if not f['aircraft'] or any(x not in ['An-2','An-24','An-26','An-28','An-38','Yak-40','Yak-42','Mi-8','SSJ100','Tu-204','Tu-214','L-410'] for x in f['aircraft']):errors.append([f['id'],'bad aircraft',f['aircraft']])
 if f.get('localSource') and not (ROOT/f['localSource']).exists():errors.append([f['id'],'missing snapshot',f['localSource']])
for a in A.values():
 if a['lat'] is not None and not (-90<=a['lat']<=90 and -180<=a['lon']<=180):errors.append([a['id'],'bad coords'])
index=collections.defaultdict(list)
for f in F:
 for d in f.get('dates') or []:
  index[(f['airline'],re.sub(r'[\s-]','',f['number']),f['from'],f['to'],d)].append(f)
conf=[]
for key,fs in index.items():
 variants=set((f['departure'],f['arrival'],tuple(f['aircraft'])) for f in fs)
 if len(variants)>1:conf.append({'key':key,'variants':[{'id':f['id'],'departure':f['departure'],'arrival':f['arrival'],'aircraft':f['aircraft'],'source':f['source']} for f in fs]})
report={'records':len(F),'airports':len(A),'operators':len(D['airlines']),'errors':errors,'possibleSameDayConflicts':len(conf),'conflicts':conf,'noCoords':[a['id'] for a in A.values() if a['lat'] is None],'status':dict(collections.Counter(f['status'] for f in F))}
(ROOT/'data/data-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='conflicts'},ensure_ascii=False));print('CONFLICT SAMPLE',json.dumps(conf[:4],ensure_ascii=False))
assert not errors,errors[:20]

# Geographic regression guards for reviewed collisions and stop sequences.
assert A['NYA']['icao']=='USHN' and abs(A['NYA']['lat']-62.11)<0.001 and abs(A['NYA']['lon']-65.615)<0.001, 'NYA must resolve to Nyagan / USHN'
assert A['NYA']['tz']=='Asia/Yekaterinburg'
assert 'RU-0361' not in A and not any(a.get('icao')=='ULSJ' for a in A.values()), 'ULSJ is not KrasAvia Burny'
assert A['KYA-BURNY']['region']=='RU-KYA' and A['KYA-BURNY']['coordinateStatus']=='settlement'
reviewed=[f for f in F if f['number'] in ['KV 783','KV 784'] and f['airline']=='kras']
assert len(reviewed)==20
for f in reviewed:
 assert not f.get('timeCheck') and f.get('arrivalDayOffset')==0
 assert f['route'][0]==f['from'] and f['route'][-1]==f['to']
 assert all(89<A[k]['lon']<97 and 61<A[k]['lat']<63 for k in f['route'])
 assert all((ROOT/p).exists() for p in f.get('routeEvidence',[]))
for f in F:
 if f.get('geographyCheck'):assert f.get('publicAccess')=='unverified', 'Unresolved geographic anomaly must not appear as ordinary public service'
