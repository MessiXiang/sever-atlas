"""Validate public offers, source links, prices and the nine-country import boundary."""
from pathlib import Path
from urllib.parse import urlparse
import hashlib
import json

root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'data/experiences.json').read_text())
allowed = {'GE', 'AZ', 'KZ', 'KG', 'UZ', 'TJ', 'TM', 'BY', 'MN'}
models = {m['id'] for m in data['models']}
assert set(data['scope']) == allowed
assert len(models) == len(data['models'])
assert len({x['id'] for x in data['items']}) == len(data['items'])
for x in data['items']:
    assert x['country'] in allowed and x['model'] in models, x['id']
    assert x['bookingStatus'] == 'published-offer' and x['sourceIds'], x['id']
    assert urlparse(x['bookingUrl']).scheme in {'https', 'http'}
    for key in x['sourceIds']:
        assert key in data['sources'], (x['id'], key)
    for price in x['prices']:
        assert price['amount'] > 0 and price['minutes'] > 0
        assert price['currency'] in {'BYN', 'USD'}
        assert price['basis'] in {'整机', '每人', '整组／飞行小时', '整机／飞行小时'}
    for contact in x['contacts']:
        assert urlparse(contact['url']).scheme in {'tel', 'mailto', 'https', 'http'}
    assert all(1 <= month <= 12 for month in x.get('seasonMonths', []))
for s in data['sources'].values():
    assert urlparse(s['url']).scheme in {'https', 'http'}
    assert (root / s['local']).is_file(), s['local']

audit = json.loads((root / 'data/neighbour-integration-audit.json').read_text())
flights = json.loads((root / 'data/flights.json').read_text())
index = {f['id']: f for f in flights['flights']}
for key in audit['serviceRecordIds']:
    f = index[key]
    assert f['recordKind'] == 'service' and f['scheduleUnconfirmed'], key
    assert not f['days'] and not f.get('dates') and not f['departure'] and not f['arrival'], key
    assert f['booking']['status'] == 'verified' and f['publicAccess'] == 'verified', key
for key in audit['datedRecordIds']:
    f = index[key]
    assert f['dates'] and not f['scheduleUnconfirmed'] and f['booking']['status'] == 'verified', key
for s in audit['evidence']:
    assert hashlib.sha256((root / s['path']).read_bytes()).hexdigest() == s['sha256'], s['path']
assert set(audit['experienceIds']) == {x['id'] for x in data['items']}
report = dict(status='passed', experiences=len(data['items']), aircraftModels=len(models),
              passengerServices=len(audit['serviceRecordIds']), datedFlights=len(audit['datedRecordIds']),
              evidenceFiles=len(audit['evidence']), scope=sorted(allowed))
(root / 'data/experiences-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False))
