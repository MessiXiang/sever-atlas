'use strict';
(async () => {
  const D = window.ATLAS_DATA,
    A = D.airports,
    F = D.flights,
    AL = D.airlines,
    S = D.sources,
    $ = id => document.getElementById(id),
    esc = x => String(((value) => value != null ? value : '')(x)).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    } [c]));
  const name = id => (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.zh; return value; })() || (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.ru; return value; })() || id,
    short = id => (/^[A-Z]{3}$/.test((() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.iata; return value; })() || '') ? A[id].iata : /^[A-Z]{4}$/.test((() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.icao; return value; })() || '') ? A[id].icao : (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.ru; return value; })() || id),
    fmt = x => x ? x.split('-').join('.') : '未公布',
    week = ['', '一', '二', '三', '四', '五', '六', '日'],
    TODAY = D.asOf;
  const romanizedName = id => window.ATLAS_SEARCH.romanize((() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.ru; return value; })() || '');
  const airportHeading = id => '<strong class="airport-code">'+esc(short(id))+'</strong><b class="airport-zh">'+esc(name(id))+'</b><small class="airport-native"><span lang="en">'+esc(romanizedName(id))+'</span> · <span lang="ru">'+esc((() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.ru; return value; })() || '')+'</span></small>';
  const now = new Date(),
    runtimeDate = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0'),
    baseDate = runtimeDate >= TODAY ? runtimeDate : TODAY;
  const states = {
    confirmed: ['机型明确', 'ok'],
    mixed: ['可能替换机型', 'warning'],
    'fleet-supported': ['机队佐证', 'pending'],
    conflict: ['来源冲突', 'warning'],
    'source-conflict': ['版本待确认', 'warning']
  };
  let st = {
      q: '',
      family: '',
      airline: '',
      date: '',
      day: 0,
      strict: false,
      private: false,
      airport: '',
      airportMode: 'all',
      view: 'explore'
    },
    limit = 35, tableLimit = 50,
    linesOn = true,
    visible = [],
    map, markers = {},
    paths = [],
    routeLayer, markerLayer, hoverLayer, trip = [];
  // Keep phone interaction separate from the established tablet and desktop layouts.
  const phoneQuery = matchMedia('(max-width: 600px), (max-width: 1000px) and (max-height: 500px) and (pointer: coarse)');
  let phoneView = 'map', previewAirport = '', previewCandidates = [], phoneSearchTimer;
  const isPhone = () => phoneQuery.matches;
  const Runtime = window.ATLAS_RUNTIME;
  const stored = await Runtime.load();
  trip = Array.isArray(stored.trip) ? stored.trip.filter(x => x && typeof x.id === 'string').map(x => ({id: (D.flightAliases || {})[x.id] || x.id, date: typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : ''})).filter(x => F.some(f => f.id === x.id)) : [];
  function flatMap(items, fn) { return items.reduce((result, item, i) => result.concat(fn(item, i)), []); }
  function fromEntries(entries) { return entries.reduce((result, item) => { result[item[0]] = item[1]; return result; }, {}); }
  const modelFamily = model => ({'Mi-8T':'Mi-8',TVS:'An-2'})[model] || model;
  const flightModels = f => [...new Set(f.aircraft.map(modelFamily))];
  const accessPlaces = f => [...new Set([f.from, ...(f.route || []), f.to, ...(f.stopTimes || []).map(x => x.airport)])];
  const flightAccess = f => [...new Set(flatMap(accessPlaces(f), id => (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.accessPolicyIds; return value; })() || []))].map(id => (Object.assign({}, {id}, (() => { let value = D, receiver; receiver = value; value = value.accessPolicies; if (value == null) return undefined; receiver = value; value = value[id]; return value; })()))).filter(p => p.title);
  const hiddenForAccess = f => flightAccess(f).some(p => p.hideByDefault) || (!!f.accessRestriction && !flightAccess(f).length);
  const accessBadge = f => {
    const policies = flightAccess(f), closed = policies.find(p => p.hideByDefault);
    if (closed) return '<span class="badge warning access-badge">'+esc(closed.badge)+'</span>';
    if (policies.length) return '<span class="badge pending access-badge">'+esc(policies.length === 1 ? policies[0].badge : '沿途许可 · 可申请')+'</span>';
    return f.accessRestriction ? '<span class="badge warning access-badge">受限地区 · 需特别许可</span>' : '';
  };
  function accessDetails(f) {
    const policies = flightAccess(f);
    if (!policies.length) return f.accessRestriction ? '<p class="access-warning"><strong>'+esc(f.accessRestriction)+'</strong><br>预约或余位不等于获得进入许可。</p>' : '';
    return '<section class="access-notices" aria-label="目的地准入要求">'+policies.map(p => {
      const places = accessPlaces(f).filter(id => ((A[id] || {}).accessPolicyIds || []).includes(p.id)).map(id => name(id)+' / '+A[id].ru).join('、');
      return '<article class="access-notice '+(p.hideByDefault?'access-closed':'access-permit')+'"><strong>'+esc(p.title)+'</strong><small>涉及航点：'+esc(places)+'</small><p><b>外国旅客：</b>'+esc(p.foreigners)+'</p><p><b>俄罗斯公民：</b>'+esc(p.russianCitizens)+'</p><p>'+esc(p.note)+'</p></article>';
    }).join('')+'</section>';
  }
  const airportAccessNote = id => ((() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.accessPolicyIds; return value; })() || []).map(key => (() => { let value = D, receiver; receiver = value; value = value.accessPolicies; if (value == null) return undefined; receiver = value; value = value[key]; return value; })()).filter(Boolean).map(p => '<div class="airport-access '+(p.hideByDefault?'access-closed':'access-permit')+'"><b>'+esc(p.badge)+'</b><span>'+esc(p.hideByDefault?'普通外国旅客通常无法进入；俄罗斯公民亦须核实入区许可。':'可按规定申请许可；此提示不自动隐藏航班。')+'</span></div>').join('');
  const flightLabel = f => f.number || '航班号未公布';
  const bookingBadge = f => (() => { let value = f, receiver; receiver = value; value = value.booking; if (value == null) return undefined; receiver = value; value = value.status; return value; })() === 'unverified' ? '<span class="badge warning">购票待确认</span>' : (() => { let value = f, receiver; receiver = value; value = value.booking; if (value == null) return undefined; receiver = value; value = value.status; return value; })() === 'verified' && (() => { let value = f, receiver; receiver = value; value = value.booking; if (value == null) return undefined; receiver = value; value = value.method; receiver = value; value = value.includes; value = value.call(receiver, '二楼'); receiver = undefined; return value; })() ? '<span class="badge pending">机场柜台购票</span>' : '';
  const arrivalLabel = f => (f.arrival || '未公布') + (f.arrivalDayOffset > 0 ? ' (+' + f.arrivalDayOffset + ')' : f.arrivalDayOffset < 0 ? ' (' + f.arrivalDayOffset + ')' : '');
  const badge = f => {
      let [t, c] = states[f.status] || states.confirmed;
      if (hiddenForAccess(f)) return accessBadge(f);
      if (f.scheduleUnconfirmed) return '<span class="badge warning">'+(f.recurrence === 'seasonal-unconfirmed' ? '换季期间 · 日期待确认' : '适用日期待确认')+'</span>' + accessBadge(f);
      if (f.status === 'confirmed' && flightModels(f).length > 1) t = '候选机型范围';
      if ((() => { let value = f, receiver; receiver = value; value = value.conflictDates; if (value == null) return undefined; receiver = value; value = value.length; return value; })()) {
        t = '部分日期时刻冲突';
        c = 'warning'
      }
      return `<span class="badge ${c}">${t}</span>` + accessBadge(f)
    },
    types = f => flightModels(f).join(' / '),
    sourceTypes = f => f.aircraft.map(x => x === 'TVS' ? 'TVS（An-2 改型）' : x).join(' / '),
    route = f => f.route || [f.from, f.to],
    routeText = f => route(f).map(name).join(' → '),
    plainRoute = f => f.routeKind === 'circuit' ? name(f.from) + ' · 往返环线' : name(f.from) + ' → ' + name(f.to),
    heli = f => f.aircraft.every(x => x.startsWith('Mi'));
  const daysText = f => f.scheduleUnconfirmed ? (f.recurrence === 'seasonal-unconfirmed' ? '换季期间' : '日期待确认') + (f.days.length ? ' · ' + (f.days.length === 7 ? '每日' : '周' + f.days.map(d => week[d]).join('/')) : '') : f.dates ? f.dates.filter(d => d >= baseDate && !(() => { let value = f, receiver; receiver = value; value = value.unconfirmedDates; if (value == null) return undefined; receiver = value; value = value.includes; value = value.call(receiver, d); receiver = undefined; return value; })()).length + ' 个日期' + ((() => { let value = f, receiver; receiver = value; value = value.unconfirmedDates; if (value == null) return undefined; receiver = value; value = value.some; value = value.call(receiver, d => d >= baseDate); receiver = undefined; return value; })() ? ' · '+f.unconfirmedDates.filter(d => d >= baseDate).length+' 待确认' : '') : f.recurrence === 'biweekly-unconfirmed' ? '隔周 · 周' + f.days.map(d => week[d]).join('/') : f.days.length === 7 ? '每日' : f.days.length ? '周' + f.days.map(d => week[d]).join(' / ') : '日期待确认';

  function activeOn(f, d) {
    if (f.scheduleUnconfirmed || (() => { let value = f, receiver; receiver = value; value = value.unconfirmedDates; if (value == null) return undefined; receiver = value; value = value.includes; value = value.call(receiver, d); receiver = undefined; return value; })() || (f.start && d < f.start) || (f.end && d > f.end)) return false;
    if (f.status === 'source-conflict' || f.recurrence === 'biweekly-unconfirmed') return false;
    if (f.dates) return f.dates.includes(d);
    if ((() => { let value = f, receiver; receiver = value; value = value.excludedDates; if (value == null) return undefined; receiver = value; value = value.includes; value = value.call(receiver, d); receiver = undefined; return value; })()) return false;
    return f.days.includes(new Date(d + 'T12:00:00Z').getUTCDay() || 7)
  }

  function nextDates(f, n = 14) {
    if (f.scheduleUnconfirmed || f.status === 'source-conflict' || f.recurrence === 'biweekly-unconfirmed') return [];
    if (f.dates) return f.dates.filter(d => d >= baseDate && !(() => { let value = f, receiver; receiver = value; value = value.unconfirmedDates; if (value == null) return undefined; receiver = value; value = value.includes; value = value.call(receiver, d); receiver = undefined; return value; })()).slice(0, n);
    let out = [],
      d = new Date((f.start > baseDate ? f.start : baseDate) + 'T12:00:00Z');
    for (let i = 0; i < 367 && out.length < n; i++, d.setUTCDate(d.getUTCDate() + 1)) {
      let s = d.toISOString().slice(0, 10);
      if (f.end && s > f.end) break;
      if (activeOn(f, s)) out.push(s)
    }
    return out
  }
  const modelOrder = ['An-2', 'An-24', 'An-26', 'An-28', 'An-38', 'An-72', 'An-74', 'Yak-40', 'Yak-42', 'Tu-134', 'Tu-154', 'Tu-204', 'Tu-214', 'Il-62', 'Il-76', 'Mi-8', 'Mi-171', 'L-410', 'SSJ100'];
  const modelSet = new Set([...flatMap(F, flightModels), 'L-410', 'Tu-204', 'Tu-214']);
  const families = [
    ['', '全部'], ...modelOrder.filter(x => modelSet.has(x)).map(x => [x, x]), ...[...modelSet].filter(x => !modelOrder.includes(x)).sort().map(x => [x, x])
  ];
  $('familyFilters').innerHTML = families.map(([id, t]) => `<button class="chip ${!id?'active':''}" data-family="${id}">${t}</button>`).join('');
  $('dayFilter').innerHTML = week.slice(1).map((w, i) => `<button data-day="${i+1}" aria-label="星期${w}">${w}</button>`).join('');
  $('airlineFilter').innerHTML += Object.entries(AL).map(([id, a]) => `<option value="${id}">${esc(a.zh)} · ${esc(a.ru)}</option>`).join('');
  $('dateFilter').min = TODAY;
  const Search = window.ATLAS_SEARCH,
    norm = Search.normalize;
  const airlineFields = id => {
    const a = AL[id] || {};
    return [a.ru, a.en, a.zh, a.code, ...(Search.airlineAliases[id] || [])];
  };
  const searchCache = new Map(F.map(f => [f.id, Search.index([f.number, ...(f.numberAliases || []), types(f), sourceTypes(f), f.aircraftParent, ...airlineFields(f.airline), ...flatMap(route(f), id => [id, (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.iata; return value; })(), (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.icao; return value; })(), (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.sourceCode; return value; })(), (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.ru; return value; })(), (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.zh; return value; })(), (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.en; return value; })(), (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.nameOriginalRu; return value; })(), romanizedName(id)])])]));
  function apply() {
    limit = 35; tableLimit = 50;
    const queryTerms = Search.terms(st.q);
    $('search').value = $('tableSearch').value = $('phoneSearch').value = st.q;
    visible = F.filter(f => (st.private || (!hiddenForAccess(f) && f.publicAccess !== 'unverified')) && (!f.end || f.end >= baseDate) && (!st.q || Search.matches(searchCache.get(f.id), queryTerms)) && (!st.family || flightModels(f).includes(st.family) || modelFamily(f.aircraftParent) === st.family) && (!st.airline || f.airline === st.airline) && (!st.date || activeOn(f, st.date)) && (!st.day || f.days.includes(st.day)) && (!st.strict || (f.status === 'confirmed' && flightModels(f).length === 1)) && (!st.airport || (st.airportMode === 'out' ? f.from === st.airport : st.airportMode === 'in' ? f.to === st.airport : route(f).includes(st.airport))));
    visible.sort((a, b) => (nextDates(a, 1)[0] || '9999').localeCompare(nextDates(b, 1)[0] || '9999') || (a.departure || '99').localeCompare(b.departure || '99') || a.number.localeCompare(b.number));
    $('resultCount').textContent = visible.length + ' 条时刻';
    $('resultTitle').textContent = st.airport ? name(st.airport) : '已收录航班';
    $('selectedAirport').hidden = !st.airport;
    $('selectedAirport').innerHTML = st.airport ? `<button id="clearAirport">${esc(name(st.airport))} × 清除机场筛选</button><div class="airport-modes">${[['all','全部关联'],['out','从此出发'],['in','到达此处']].map(([v,t])=>'<button data-airport-mode="'+v+'" class="'+(st.airportMode===v?'active':'')+'">'+t+'</button>').join('')}</div>` : '';
    (() => { let value = $, receiver; value = value.call(receiver, 'clearAirport'); receiver = undefined; if (value == null) return undefined; receiver = value; value = value.addEventListener; value = value.call(receiver, 'click', () => {
      st.airport = '';
      st.airportMode = 'all';
      apply()
    }); receiver = undefined; return value; })();
    document.querySelectorAll('[data-airport-mode]').forEach(b => b.onclick = () => {
      st.airportMode = b.dataset.airportMode;
      apply()
    });
    renderList();
    renderTable();
    renderMap();
    updatePhoneControls();
    let p = new URLSearchParams();
    for (let [k, v] of Object.entries(st))
      if (v && k !== 'view') p.set(k, String(v));
    try {
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : ''))
    } catch (error) {}
  }

  function renderList() {
    $('routeList').innerHTML = visible.length ? visible.slice(0, limit).map(f => `<button class="route-card" data-flight="${f.id}"><span class="route-top"><span>${esc(flightLabel(f))}</span><span class="aircraft-tag ${heli(f)?'heli':''}">${esc(types(f))}</span></span><span class="route-code">${esc(short(f.from))}<span class="arrow">${f.routeKind==='circuit'?'⟳':'→'}</span>${esc(f.routeKind==='circuit'?'环线':short(f.to))}</span><span class="route-names">${esc(plainRoute(f))}</span><span class="route-foot"><span>${f.departure||'待定'} — ${arrivalLabel(f)}</span><span>${esc(daysText(f))}</span></span><span class="route-evidence">${esc(AL[f.airline].zh)} ${badge(f)} ${bookingBadge(f)}</span></button>`).join('') + (visible.length > limit ? '<button class="load-more" id="loadMore">再显示更多航班 ↓</button>' : '') : '<div class="empty"><strong>没有匹配的已收录航班</strong>试试清除机场、机型或日期筛选。未查到不等于没有航班；资料为定期整理的时刻快照。</div>';
    (() => { let value = $, receiver; value = value.call(receiver, 'loadMore'); receiver = undefined; if (value == null) return undefined; receiver = value; value = value.addEventListener; value = value.call(receiver, 'click', () => {
      limit += 35;
      renderList()
    }); receiver = undefined; return value; })()
  }

  function renderTable() {
    $('flightTable').innerHTML = visible.slice(0, tableLimit).map(f => `<tr data-flight="${f.id}" tabindex="0"><td><b class="mono">${esc(flightLabel(f))}</b><small>${esc(AL[f.airline].zh)}</small></td><td>${esc(plainRoute(f))}<small>${esc(short(f.from))} → ${esc(short(f.to))}</small></td><td class="mono">${esc(types(f))}</td><td class="mono">${f.departure||'未公布'} — ${arrivalLabel(f)}<small>两地当地时间</small></td><td>${esc(daysText(f))}</td><td>${fmt(f.start)}<small>至 ${f.end?fmt(f.end):'结束日未公布'} ${badge(f)}</small></td><td>↗</td></tr>`).join('') || '<tr><td colspan="7">暂无匹配记录，请返回地图调整筛选。</td></tr>';
    $('tableCount').textContent = '共 ' + visible.length + ' 条时刻记录。' + ('当前显示 ' + Math.min(visible.length, tableLimit) + ' 条。') + '指定日期记录已合并相同的航线、机型与时刻。'
    $('tableMore').hidden = visible.length <= tableLimit;
  }
  const ll = id => (() => { let value = A, receiver; receiver = value; value = value[id]; if (value == null) return undefined; receiver = value; value = value.lat; return value; })() != null ? [A[id].lat, A[id].lon < 0 ? A[id].lon + 360 : A[id].lon] : null;

  // Visual dots stay small; the independent 26px tap radius handles touch input.
  const phoneMarkerRadius = () => Math.min(3.5, 2 + Math.max(0, ((() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.getZoom; value = value.call(receiver); receiver = undefined; return value; })() || 1) - 3) * .3);

  function initMap() {
    if (!window.L) {
      $('map').innerHTML = '<div class="map-error">地图组件未加载，请使用航班总览查询。</div>';
      return
    }
    map = L.map('map', {
      zoomControl: false,
      minZoom: 1,
      maxZoom: 11,
      zoomSnap: .25,
      worldCopyJump: false
    }).setView([62, 115], 3);
    map.on('zoomend', () => {
      if (isPhone()) Object.values(markers).forEach(marker => marker.setRadius(phoneMarkerRadius()));
    });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('Natural Earth · OurAirports');
    map.createPane('base');
    map.getPane('base').style.zIndex = 200;
    map.createPane('routes');
    map.getPane('routes').style.zIndex = 420;
    L.geoJSON(window.ATLAS_GEOGRAPHY, {
      pane: 'base',
      interactive: false,
      style: f => ({
        color: '#cad6dd',
        weight: .7,
        fillColor: (() => { let value = f, receiver; receiver = value; value = value.properties; if (value == null) return undefined; receiver = value; value = value.name; return value; })() === 'Russia' ? '#f8fafb' : '#f0f3f5',
        fillOpacity: 1
      })
    }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    hoverLayer = L.layerGroup().addTo(map);
    map.on('click', e => {
      if (!isPhone()) return;
      const hits = Object.entries(markers).map(([id, marker]) => ({id, distance: map.latLngToContainerPoint(marker.getLatLng()).distanceTo(e.containerPoint)})).filter(x => x.distance <= 26).sort((a, b) => a.distance - b.distance);
      if (!hits.length) closeAirportPreview();
      else if (hits.length === 1) showAirportPreview(hits[0].id);
      else showAirportChoices(hits.map(x => x.id));
    });
    [
      ['白海', 65, 36],
      ['西伯利亚', 62, 93],
      ['雅库特', 67, 132],
      ['鄂霍次克海', 54, 149],
      ['楚科奇', 67, 176],
      ['白令海', 58, 183]
    ].forEach(([t, lat, lon]) => L.marker([lat, lon], {
      icon: L.divIcon({
        className: 'region-label',
        html: esc(t),
        iconSize: [100, 20]
      }),
      interactive: false
    }).addTo(map));
  }

  function segments(f) {
    let r = route(f),
      s = [];
    for (let i = 0; i < r.length - 1; i++)
      if (ll(r[i]) && ll(r[i + 1]) && r[i] !== r[i + 1]) s.push([r[i], r[i + 1]]);
    return s
  }

  function curve(a, b) {
    let [la, lo] = ll(a), [lb, lp] = ll(b), mid = [(la + lb) / 2 + Math.min(5, Math.abs(lp - lo) * .05), (lo + lp) / 2];
    return Array.from({
      length: 25
    }, (_, i) => {
      let t = i / 24;
      return [(1 - t) ** 2 * la + 2 * (1 - t) * t * mid[0] + t * t * lb, (1 - t) ** 2 * lo + 2 * (1 - t) * t * mid[1] + t * t * lp]
    })
  }

  function renderMap() {
    let used = new Set(flatMap(visible, route)),
      mapped = [...used].filter(id => ll(id)),
      rs = new Set(flatMap(visible, f => segments(f).map(s => s.slice().sort().join('|'))));
    $('mapStats').innerHTML = `<div><strong>${mapped.length}</strong><span>地图航点</span></div><div><strong>${rs.size}</strong><span>双向合并航线</span></div><div><strong>${new Set(visible.map(f=>f.airline)).size}</strong><span>已收录航司</span></div>`;
    if (!map) return;
    routeLayer.clearLayers();
    markerLayer.clearLayers();
    hoverLayer.clearLayers();
    markers = {};
    paths = [];
    let drawn = new Set();
    for (let f of visible)
      for (let [a, b] of segments(f)) {
        let k = [a, b].sort().join('|');
        if (drawn.has(k)) continue;
        drawn.add(k);
        let p = L.polyline(curve(a, b), {
          pane: 'routes',
          color: heli(f) ? '#568775' : '#4f7bc2',
          weight: 1,
          opacity: .24,
          interactive: false,
          dashArray: f.status === 'confirmed' && !f.scheduleUnconfirmed ? null : '3 5'
        });
        paths.push({
          p,
          a,
          b
        });
        if (linesOn) p.addTo(routeLayer)
      }
    for (let id of mapped) {
      let fs = visible.filter(f => route(f).includes(id)),
        clear = fs.some(f => f.status === 'confirmed'),
        approx = ['settlement', 'provider-reference'].includes(A[id].coordinateStatus),
        color = clear ? (fs.every(heli) ? '#377560' : '#285bce') : '#a48a60',
        m = L.circleMarker(ll(id), {
          radius: isPhone() ? phoneMarkerRadius() : Math.min(8, 3 + Math.log2(fs.length + 1) * .6),
          interactive: !isPhone(),
          color,
          weight: isPhone() ? .8 : 1.5,
          fillColor: approx ? '#fff' : color,
          fillOpacity: .85
        }).addTo(markerLayer);
      markers[id] = m;
      (() => { let value = m, receiver; receiver = value; value = value.getElement; value = value.call(receiver); receiver = undefined; if (value == null) return undefined; receiver = value; value = value.setAttribute; value = value.call(receiver, 'data-airport', id); receiver = undefined; return value; })();
      let dest = new Set(flatMap(fs, route).filter(x => x !== id));
      if (!isPhone()) m.bindTooltip(`${airportHeading(id)}${airportAccessNote(id)}<p>${esc([...new Set(flatMap(fs, flightModels))].join(' / '))}</p><div class="tt-bottom">${fs.length} 条时刻 · ${dest.size} 个关联航点<br>${A[id].coordinateStatus==='settlement'?'村镇参考坐标，非精确起降点':A[id].coordinateStatus==='provider-reference'?'航司查询器参考坐标，精度待核':'机场坐标（OurAirports）'}<br>点击查看相关航班</div>`, {
        className: 'airport-tooltip',
        direction: 'top',
        offset: [0, -7]
      });
      m.on('mouseover', () => { if (!isPhone()) highlight(id) });
      m.on('mouseout', () => { if (!isPhone()) hoverLayer.clearLayers() });
      m.on('click', () => {
        if (isPhone()) { showAirportPreview(id); return }
        st.airport = id;
        st.airportMode = 'all';
        apply();
        if (innerWidth < 800) $('resultTitle').scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      })
    }
    if (isPhone() && previewAirport && markers[previewAirport]) showAirportPreview(previewAirport, false);
    else if (isPhone() && previewCandidates.length) {
      const remaining = previewCandidates.filter(id => markers[id]);
      if (remaining.length) showAirportChoices(remaining, false); else closeAirportPreview();
    } else closeAirportPreview();
  }

  function highlight(id) {
    if (!map) return;
    hoverLayer.clearLayers();
    paths.filter(x => x.a === id || x.b === id).forEach(x => L.polyline(curve(x.a, x.b), {
      pane: 'routes',
      color: '#285bce',
      weight: 2,
      opacity: .75,
      interactive: false,
      className: 'map-segment'
    }).addTo(hoverLayer))
  }

  function fit() {
    if (!map) return;
    let pts = [...new Set(flatMap(visible, route))].map(ll).filter(Boolean);
    if (pts.length) map.fitBounds(pts, {
      paddingTopLeft: isPhone() ? [32, 70] : innerWidth < 800 ? [20, 130] : [40, 150],
      paddingBottomRight: isPhone() ? [64, 48] : innerWidth < 800 ? [25, 65] : [65, 120],
      maxZoom: 6,
      animate: !matchMedia('(prefers-reduced-motion:reduce)').matches
    })
  }

  function showFlight(id) {
    let f = F.find(x => x.id === id);
    if (!f) return;
    let s = S[f.source],
      dates = nextDates(f, 120);
    $('flightDetail').innerHTML = `<span class="eyebrow">FLIGHT NOTES · ${esc(AL[f.airline].ru)}</span><h2 class="detail-title">${esc(flightLabel(f))} <span class="aircraft-tag">${esc(types(f))}</span> ${badge(f)} ${bookingBadge(f)}</h2><div class="detail-airports"><div>${airportHeading(f.from)}</div><span>${f.routeKind==='circuit'?'⟳':'→'}</span><div>${airportHeading(f.to)}</div></div><div class="detail-times"><div><strong>${f.departure||'未公布'}</strong><small>${f.timeBasis==='unconfirmed'?'官网所列时间 · 时区口径待确认':'出发地当地时间 · '+esc(A[f.from].tz||'时区待核实')}</small></div><div><strong>${arrivalLabel(f)}</strong><small>${f.timeBasis==='unconfirmed'?'官网所列时间 · 时区口径待确认':'到达地当地时间 · '+esc(A[f.to].tz||'时区待核实')}</small></div></div><dl class="detail-grid"><div><dt>班期</dt><dd>${esc(daysText(f))}</dd></div><div><dt>有效期</dt><dd>${fmt(f.start)} — ${f.end?fmt(f.end):'结束日未公布'}</dd></div><div><dt>${AL[f.airline].role==='organizer'?'包机组织方 · 承运人待核':'运营航司'}</dt><dd>${esc(AL[f.airline].zh)}<br>${esc(AL[f.airline].ru)}</dd></div><div><dt>机型依据</dt><dd>${esc(sourceTypes(f))} · ${esc((() => { let value = states, receiver; receiver = value; value = value[f.status]; if (value == null) return undefined; receiver = value; value = value[0]; return value; })()||'官网机型')} ${(() => { let value = f, receiver; receiver = value; value = value.alternatives; if (value == null) return undefined; receiver = value; value = value.length; return value; })()?'· 可能替代 '+esc(f.alternatives.join('/')):''}</dd></div></dl>${f.scheduleOriginal?'<p class="detail-note"><b>官网原始班期</b><br>'+esc(f.scheduleOriginal)+'</p>':''}${(() => { let value = f, receiver; receiver = value; value = value.unconfirmedDates; if (value == null) return undefined; receiver = value; value = value.some; value = value.call(receiver, d=>d>=baseDate); receiver = undefined; return value; })()?'<p class="detail-note"><b>星号日期 · 执行条件待确认</b><br>'+f.unconfirmedDates.filter(d=>d>=baseDate).map(fmt).join('、')+'；不进入确定日期筛选和衔接计算。</p>':''}${f.route?'<p class="detail-route">航路：'+esc(routeText(f))+'</p>':''}${f.stopTimes?'<ol class="stop-timeline">'+f.stopTimes.map(x=>'<li><strong>'+esc(name(x.airport))+'</strong>'+[x.arrival?'到达 '+x.arrival:'',x.departure?'出发 '+x.departure:''].filter(Boolean).join(' · ')+'</li>').join('')+'</ol>':''}${accessDetails(f)}<p class="detail-note">${esc((f.timeCheck?'官网飞行时长与两地当地时间换算不一致；不计算可靠衔接。':'')+((() => { let value = f, receiver; receiver = value; value = value.conflictDates; if (value == null) return undefined; receiver = value; value = value.length; return value; })()?'同航班同航段出现不同计划时刻，冲突日期：'+f.conflictDates.map(fmt).join('、')+'。这些日期不计算衔接。':'')+(f.publicAccess==='unverified'?'散客购票资格尚未核实。':'')+(f.conditional?'按客流/载荷条件执行。':'')+(f.note||'官网计划机型；实际执飞机型和售票状态仍需订票时确认。'))}${f.recurrence==='biweekly-unconfirmed'?'<br>隔周起算日期不明，不在指定日期筛选中推演。':''}${f.status==='source-conflict'?'<br>版本冲突未解决，不进入指定日期筛选。':''}</p><b class="mini-label">${f.dates?'官网指定日期':'按公布班期展开的近期日期'}</b><div class="detail-dates">${dates.length?dates.map(d=>'<span>'+fmt(d)+' · '+week[new Date(d+'T12:00Z').getUTCDay()||7]+'</span>').join(''):'<span>日期需向航司确认</span>'}</div><div class="detail-source"><strong>${esc(s.title || '航司计划时刻')}</strong><small>资料核查 ${fmt(f.checkedAt)} · 计划时刻不代表当日实际运行或当前余票。</small></div><div class="detail-actions"><button class="primary" id="saveFlight">＋ 加入我的行程</button><button class="secondary" id="focusFlight">在地图中查看 ↗</button><button class="secondary" id="onwardFlight">从目的地继续探索 →</button></div>`;
    $('saveFlight').onclick = () => {
      trip.push({
        id,
        date: st.date && activeOn(f, st.date) ? st.date : dates[0] || ''
      });
      persist();
      toast('已加入本次行程；保存状态请查看「我的行程」');
      $('saveFlight').textContent = '已加入 · 再存一段'
    };
    $('focusFlight').onclick = () => {
      $('flightDialog').close();
      switchView('explore');
      setPhoneView('map');
      st.airport = f.from;
      apply();
      fit()
    };
    $('onwardFlight').onclick = () => {
      $('flightDialog').close();
      switchView('explore');
      setPhoneView('map');
      Object.assign(st, {
        q: '',
        family: '',
        airline: '',
        date: '',
        day: 0,
        airport: f.to,
        airportMode: 'out'
      });
      $('search').value = $('airlineFilter').value = $('dateFilter').value = '';
      document.querySelectorAll('[data-family]').forEach(b => b.classList.toggle('active', b.dataset.family === ''));
      document.querySelectorAll('[data-day]').forEach(b => b.classList.remove('active'));
      apply();
      fit()
    };
    $('flightDialog').showModal()
  }

  function persist() {
    Runtime.saveTrip(trip);
    $('tripCount').textContent = trip.length;
  }

  function toast(s) {
    $('toast').textContent = s;
    $('toast').classList.add('visible');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600)
  }

  function utc(d, t, tz) {
    if (!d || !t || !tz) return null;
    let target = Date.parse(d + 'T' + t + ':00Z'),
      guess = target;
    try {
      for (let i = 0; i < 3; i++) {
        let ps = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).formatToParts(new Date(guess)),
          p = fromEntries(ps.map(x => [x.type, x.value])),
          represented = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute + ':00Z');
        guess += target - represented
      }
      return guess
    } catch (error) {
      return null
    }
  }

  function timing(f, d) {
    if (f.timeBasis === 'unconfirmed' || f.scheduleUnconfirmed || f.locationUnverified || f.operatorUnverified || f.geographyCheck || f.timeCheck || !activeOn(f, d) || (() => { let value = f, receiver; receiver = value; value = value.conflictDates; if (value == null) return undefined; receiver = value; value = value.includes; value = value.call(receiver, d); receiver = undefined; return value; })() || f.status === 'conflict' || hiddenForAccess(f) || f.publicAccess === 'unverified' || (() => { let value = f, receiver; receiver = value; value = value.booking; if (value == null) return undefined; receiver = value; value = value.status; return value; })() === 'unverified' || f.routeKind || f.recurrence === 'biweekly-unconfirmed' || !A[f.from].tzVerified || !A[f.to].tzVerified) return null;
    let arrivalDate = d;
    if (Number.isInteger(f.arrivalDayOffset)) {
      let ad = new Date(d + 'T12:00Z');
      ad.setUTCDate(ad.getUTCDate() + f.arrivalDayOffset);
      arrivalDate = ad.toISOString().slice(0, 10)
    }
    let dep = utc(d, f.departure, A[f.from].tz),
      arr = utc(arrivalDate, f.arrival, A[f.to].tz);
    if (dep === null || arr === null) return null;
    let inferred = false;
    while (arr <= dep && !Number.isInteger(f.arrivalDayOffset)) {
      arr += 864e5;
      inferred = true
    }
    if (arr <= dep) return null;
    if (f.durationMinutes) {
      const actual = dep + f.durationMinutes * 6e4;
      if (Math.abs(actual - arr) > 9e4) return null;
      arr = actual;
      inferred = false
    }
    if (arr - dep > 18 * 36e5) return null;
    return {
      dep,
      arr,
      inferred
    }
  }

  function renderTrip() {
    persist();
    $('tripList').innerHTML = trip.length ? trip.map((item, i) => {
      let f = F.find(f => f.id === item.id),
        ds = nextDates(f, 300),
        t = timing(f, item.date),
        connection = '';
      if (item.date && !ds.includes(item.date)) ds = [item.date, ...ds];
      if (i) {
        let prev = trip[i - 1],
          pf = F.find(f => f.id === prev.id),
          pt = timing(pf, prev.date);
        let transfer = pf.to !== f.from ? '需自行安排 ' + esc(name(pf.to)) + ' → ' + esc(name(f.from)) + ' 的地面或其他航段' : '';
        if (t && pt) {
          let gap = (t.dep - pt.arr) / 36e5,
            minutes = Math.round(gap * 60);
          connection = gap < 0 ? '日期或时间倒序，无法按当前顺序衔接' + (transfer ? '；' + transfer : '') : transfer ? transfer + '；两段间隔 ' + Math.floor(minutes / 60) + ' 小时 ' + minutes % 60 + ' 分钟' : '同一机场间隔 ' + Math.floor(minutes / 60) + ' 小时 ' + minutes % 60 + ' 分钟；请自行核实最短衔接时间' + (pt.inferred ? '（前段到达日由时区换算推定）' : '')
        } else connection = (transfer ? transfer + '；' : '') + '时间或日期依据不足，暂不计算衔接'
      }
      return `${connection?'<div class="trip-connection">'+connection+'</div>':''}<article class="trip-leg"><div class="trip-leg-top"><strong>${i+1}. ${esc(short(f.from))} → ${esc(short(f.to))}</strong><div><button data-up="${i}" aria-label="上移航段" ${i===0?'disabled':''}>↑</button><button data-down="${i}" aria-label="下移航段" ${i===trip.length-1?'disabled':''}>↓</button><button data-remove="${i}" aria-label="移除航段">×</button></div></div><small>${esc(flightLabel(f))} · ${esc(AL[f.airline].zh)} · ${esc(types(f))}</small><small>${esc(plainRoute(f))}</small><div class="trip-meta"><select data-tripdate="${i}" aria-label="选择航段日期">${ds.length?ds.map(d=>'<option value="'+d+'" '+(d===item.date?'selected':'')+'>'+fmt(d)+' · 周'+week[new Date(d+'T12:00Z').getUTCDay()||7]+(d<baseDate?' · 已过期':!activeOn(f,d)?' · 日期需重选':'')+'</option>').join(''):'<option value="">日期需确认</option>'}</select><span>${f.departure||'未公布'} — ${arrivalLabel(f)}</span></div><small>${t?'UTC '+new Date(t.dep).toISOString().slice(0,16).replace('T',' ')+' → '+new Date(t.arr).toISOString().slice(0,16).replace('T',' ')+(t.inferred?' · 到达日推定':''):(f.timeBasis==='unconfirmed'?'官网时间，时区口径待确认；不计算衔接':'当地时间；未进行可靠的跨时区衔接计算')}</small>${badge(f)}${flightAccess(f).length?'<small class="trip-access">'+(hiddenForAccess(f)?'此行程含通常无法进入的封闭地点；请核实特别许可。':'此行程含需事先审批或通行证的地点；请查看详情并办理许可。')+'</small>':''}<button data-flight="${f.id}" class="trip-detail-link">查看详情 ↗</button></article>`
    }).join('') : '<div class="empty"><strong>先找到一段想坐的航班。</strong>打开机场或航班卡片，在详情中加入行程。保存状态会显示在行程上方。</div>'
  }

  function switchView(v) {
    closeAirportPreview();
    st.view = v;
    document.body.dataset.page = v;
    for (let x of ['explore', 'flights']) $(x + 'View').hidden = x !== v;
    document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === v));
    if (v === 'explore') setTimeout(() => (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.invalidateSize; value = value.call(receiver); receiver = undefined; return value; })(), 30);
    window.scrollTo(0, 0)
  }
  let searchTimer;
  function queueSearch(value) { clearTimeout(searchTimer); searchTimer = setTimeout(() => { st.q = value; closeAirportPreview(); apply(); }, 140); }
  $('tableSearch').oninput = e => queueSearch(e.target.value);
  $('search').oninput = e => queueSearch(e.target.value);
  $('airlineFilter').onchange = e => {
    st.airline = e.target.value;
    apply()
  };
  $('dateFilter').onchange = e => {
    st.date = e.target.value;
    apply()
  };
  $('strictFilter').onchange = e => {
    st.strict = e.target.checked;
    apply()
  };
  $('privateFilter').onchange = e => {
    st.private = e.target.checked;
    apply()
  };
  $('familyFilters').onclick = e => {
    let b = e.target.closest('[data-family]');
    if (!b) return;
    st.family = b.dataset.family;
    document.querySelectorAll('[data-family]').forEach(x => x.classList.toggle('active', x === b));
    apply()
  };
  $('dayFilter').onclick = e => {
    let b = e.target.closest('[data-day]');
    if (!b) return;
    st.day = st.day === +b.dataset.day ? 0 : +b.dataset.day;
    document.querySelectorAll('[data-day]').forEach(x => x.classList.toggle('active', +x.dataset.day === st.day));
    apply()
  };
  $('resetFilters').onclick = () => {
    Object.assign(st, {
      q: '',
      family: '',
      airline: '',
      date: '',
      day: 0,
      strict: false,
      private: false,
      airport: '',
      airportMode: 'all'
    });
    $('search').value = $('airlineFilter').value = $('dateFilter').value = '';
    $('strictFilter').checked = false;
    $('privateFilter').checked = false;
    document.querySelectorAll('[data-family]').forEach(b => b.classList.toggle('active', b.dataset.family === ''));
    document.querySelectorAll('[data-day]').forEach(b => b.classList.remove('active'));
    apply()
  };
  document.addEventListener('click', e => {
    let f = e.target.closest('[data-flight]');
    if (f) {
      if ($('tripDialog').open) $('tripDialog').close();
      showFlight(f.dataset.flight)
    }
    let nav = e.target.closest('[data-view]');
    if (nav) switchView(nav.dataset.view);
    let c = e.target.closest('.dialog-close');
    if (c) c.closest('dialog').close();
    let r = e.target.closest('[data-region]');
    if (r && map) {
      let regions = {
        all: [
          [37, 27],
          [76, 191]
        ],
        west: [
          [57, 29],
          [72, 65]
        ],
        siberia: [
          [49, 78],
          [70, 120]
        ],
        yakutia: [
          [56, 107],
          [76, 154]
        ],
        east: [
          [43, 131],
          [73, 192]
        ]
      };
      map.fitBounds(regions[r.dataset.region], {
        padding: isPhone() ? [45, 60] : [50, 100]
      });
      document.querySelectorAll('[data-region]').forEach(x => x.classList.toggle('selected', x === r))
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      switchView('explore');
      (isPhone() ? $('phoneSearch') : $('search')).focus()
    }
    if (e.key === 'Escape') { closeAirportPreview(); }
    if (e.key === 'Enter' && e.target.matches('tr[data-flight]')) showFlight(e.target.dataset.flight)
  });
  let layout = {
    titlesCollapsed: true,
    filtersCollapsed: true
  };
  const savedLayout = stored.layout || {};
  for (const k of Object.keys(layout)) if (typeof savedLayout[k] === 'boolean') layout[k] = savedLayout[k];

  function syncLayout() {
    document.body.classList.toggle('titles-collapsed', layout.titlesCollapsed);
    $('filterOptions').hidden = $('phoneFilterDialog').open ? false : layout.filtersCollapsed;
    $('headerToggle').setAttribute('aria-expanded', String(!layout.titlesCollapsed));
    $('headerToggle').title = layout.titlesCollapsed ? '展开标题区' : '收起标题区';
    $('headerToggle').setAttribute('aria-label', $('headerToggle').title);
    $('filtersToggle').setAttribute('aria-expanded', String(!layout.filtersCollapsed));
    $('filtersToggle').textContent = layout.filtersCollapsed ? '展开筛选 ＋' : '收起筛选 −';
    Runtime.saveLayout(layout);
    requestAnimationFrame(() => (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.invalidateSize; value = value.call(receiver, {
      pan: false
    }); receiver = undefined; return value; })());
  }
  function updatePhoneControls() {
    $('phoneResultCount').textContent = visible.length;
    const count = [st.family, st.airline, st.date, st.day, st.strict, st.private].filter(Boolean).length;
    $('phoneFilterCount').textContent = count || '';
    $('phoneFilters').classList.toggle('has-filters', !!count);
    $('phoneApplyFilters').textContent = '显示 ' + visible.length + ' 条时刻';
    $('phoneAirportChip').hidden = !st.airport;
    $('phoneAirportChip').textContent = st.airport ? short(st.airport) + ' · 清除 ×' : '';
    $('phoneAirportChip').title = st.airport ? '清除 ' + name(st.airport) + ' 机场筛选' : '';
  }

  function closeAirportPreview() {
    previewAirport = '';
    previewCandidates = [];
    $('airportPreview').hidden = true;
    document.body.classList.remove('airport-preview-open');
    (() => { let value = hoverLayer, receiver; if (value == null) return undefined; receiver = value; value = value.clearLayers; value = value.call(receiver); receiver = undefined; return value; })();
  }

  function openAirportPreview(focus) {
    $('airportPreview').hidden = false;
    document.body.classList.add('airport-preview-open');
    if (focus) {
      $('airportPreviewContent').scrollTop = 0;
      $('airportPreview').focus({preventScroll: true});
    }
  }

  function showAirportPreview(id, focus = true) {
    const fs = visible.filter(f => route(f).includes(id));
    if (!fs.length || !A[id]) { closeAirportPreview(); return }
    previewAirport = id;
    previewCandidates = [];
    const dest = new Set(flatMap(fs, route).filter(x => x !== id));
    const coordinate = A[id].coordinateStatus === 'settlement' ? '村镇参考坐标，非精确起降点' : A[id].coordinateStatus === 'provider-reference' ? '航司参考坐标，精度待核' : '';
    $('airportPreviewContent').innerHTML = '<div class="preview-identity">' + airportHeading(id) + '</div><p class="preview-summary">' + fs.length + ' 条时刻 · ' + dest.size + ' 个关联航点</p><p class="preview-models">' + esc([...new Set(flatMap(fs, flightModels))].join(' / ')) + '</p>' + airportAccessNote(id) + (coordinate ? '<small class="preview-coordinate">' + esc(coordinate) + '</small>' : '');
    $('airportPreviewActions').innerHTML = '<button class="primary" data-preview-mode="all">查看航班 →</button><button data-preview-mode="out">从此出发</button><button data-preview-mode="in">到达这里</button>';
    highlight(id);
    L.circleMarker(ll(id), {radius: 8, color: '#285bce', weight: 1.2, fillOpacity: .05, interactive: false}).addTo(hoverLayer);
    openAirportPreview(focus);
  }

  function showAirportChoices(ids, focus = true) {
    previewAirport = '';
    previewCandidates = ids;
    (() => { let value = hoverLayer, receiver; if (value == null) return undefined; receiver = value; value = value.clearLayers; value = value.call(receiver); receiver = undefined; return value; })();
    $('airportPreviewContent').innerHTML = '<h2 class="preview-choice-title">选择机场 <span>' + ids.length + '</span></h2><div class="airport-choices">' + ids.map(id => '<button data-preview-airport="' + esc(id) + '"><span>' + airportHeading(id) + '</span><span aria-hidden="true">›</span></button>').join('') + '</div>';
    $('airportPreviewActions').innerHTML = '';
    openAirportPreview(focus);
  }

  function setPhoneView(view) {
    phoneView = view;
    document.body.dataset.phoneView = view;
    document.querySelectorAll('button[data-phone-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.phoneView === view)));
    $('phoneSearch').blur();
    if (view === 'map') requestAnimationFrame(() => (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.invalidateSize; value = value.call(receiver, {pan:false}); receiver = undefined; return value; })());
  }

  document.addEventListener('click', e => {
    const view = e.target.closest('button[data-phone-view]');
    if (view) setPhoneView(view.dataset.phoneView);
  });
  $('closeAirportPreview').onclick = closeAirportPreview;
  $('airportPreviewContent').onclick = e => {
    const button = e.target.closest('[data-preview-airport]');
    if (button) showAirportPreview(button.dataset.previewAirport);
  };
  $('airportPreviewActions').onclick = e => {
    const button = e.target.closest('[data-preview-mode]');
    if (!button || !previewAirport) return;
    st.airport = previewAirport;
    st.airportMode = button.dataset.previewMode;
    closeAirportPreview();
    apply();
    $('routeList').scrollTop = 0;
    setPhoneView('list');
  };
  $('phoneAirportChip').onclick = () => {
    st.airport = '';
    st.airportMode = 'all';
    closeAirportPreview();
    apply();
  };
  $('phoneSearch').oninput = e => {
    queueSearch(e.target.value);
    clearTimeout(phoneSearchTimer);
    phoneSearchTimer = setTimeout(() => { if (isPhone() && phoneView === 'map') fit() }, 220);
  };
  $('phoneSearch').onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); st.q = e.target.value; closeAirportPreview(); apply(); e.target.blur(); fit() }
  };
  $('phoneRegion').onchange = e => {
    closeAirportPreview();
    (() => { let value = document, receiver; receiver = value; value = value.querySelector; value = value.call(receiver, '[data-region="' + e.target.value + '"]'); receiver = undefined; if (value == null) return undefined; receiver = value; value = value.click; value = value.call(receiver); receiver = undefined; return value; })();
  };
  $('phoneFilters').onclick = () => {
    $('phoneSearch').blur();
    $('phoneFilterContent').append($('filterOptions'));
    $('filterOptions').hidden = false;
    $('phoneFilterDialog').showModal();
  };
  $('phoneFilterDialog').addEventListener('close', () => {
    $('filterSidebar').insertBefore($('filterOptions'), document.querySelector('.results-heading'));
    syncLayout();
    if (isPhone() && phoneView === 'map') fit();
  });
  $('phoneApplyFilters').onclick = () => $('phoneFilterDialog').close();
  $('phoneResetFilters').onclick = () => $('resetFilters').click();

  $('headerToggle').onclick = () => {
    layout.titlesCollapsed = !layout.titlesCollapsed;
    syncLayout()
  };
  $('filtersToggle').onclick = () => {
    layout.filtersCollapsed = !layout.filtersCollapsed;
    syncLayout()
  };
  $('fitMap').onclick = fit;
  $('zoomIn').onclick = () => (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.zoomIn; value = value.call(receiver); receiver = undefined; return value; })();
  $('zoomOut').onclick = () => (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.zoomOut; value = value.call(receiver); receiver = undefined; return value; })();
  $('toggleLines').onclick = () => {
    linesOn = !linesOn;
    $('toggleLines').classList.toggle('selected', linesOn);
    renderMap()
  };
  $('tableMore').onclick = () => { tableLimit += 50; renderTable(); };
  $('tripButton').onclick = () => {
    renderTrip();
    $('tripDialog').showModal()
  };
  $('tripList').onclick = e => {
    let b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.remove !== undefined) trip.splice(+b.dataset.remove, 1);
    if (b.dataset.up !== undefined) {
      let i = +b.dataset.up;
      if (i > 0)[trip[i - 1], trip[i]] = [trip[i], trip[i - 1]]
    }
    if (b.dataset.down !== undefined) {
      let i = +b.dataset.down;
      if (i < trip.length - 1)[trip[i], trip[i + 1]] = [trip[i + 1], trip[i]]
    }
    if (!b.dataset.flight) renderTrip()
  };
  $('tripList').onchange = e => {
    if (e.target.dataset.tripdate !== undefined) {
      trip[+e.target.dataset.tripdate].date = e.target.value;
      renderTrip()
    }
  };
  $('clearTrip').onclick = () => {
    trip = [];
    renderTrip();
    toast('当前行程已清空；缓存结果请查看保存状态')
  };
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => {
    if (e.target === d) {
      let r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close()
    }
  }));
  let p = new URLSearchParams(location.search);
  for (let k of ['q', 'family', 'airline', 'date', 'airport', 'airportMode'])
    if (p.has(k)) st[k] = p.get(k);
  st.airport = (() => { let value = D, receiver; receiver = value; value = value.airportAliases; if (value == null) return undefined; receiver = value; value = value[st.airport]; return value; })() || st.airport;
  if (!A[st.airport]) st.airport = '';
  st.family = ((value) => value != null ? value : st.family)(({
    heli: 'Mi-8',
    'Mi-8T': 'Mi-8',
    TVS: 'An-2',
    ssj: 'SSJ100',
    an2: 'An-2',
    antonov: '',
    yak: ''
  })[st.family]);
  if (!families.some(([v]) => v === st.family)) st.family = '';
  st.day = +p.get('day') || 0;
  st.strict = p.get('strict') === 'true';
  st.private = p.get('private') === 'true';
  $('privateFilter').checked = st.private;
  $('search').value = st.q;
  $('airlineFilter').value = st.airline;
  $('dateFilter').value = st.date;
  $('strictFilter').checked = st.strict;
  document.querySelectorAll('[data-family]').forEach(b => b.classList.toggle('active', b.dataset.family === st.family));
  document.querySelectorAll('[data-day]').forEach(b => b.classList.toggle('active', +b.dataset.day === st.day));
  document.body.dataset.phoneView = phoneView;
  syncLayout();
  initMap();
  persist();
  apply();
  fit();
  Runtime.listenMedia(phoneQuery, () => {
    if ($('phoneFilterDialog').open) $('phoneFilterDialog').close();
    closeAirportPreview();
    renderMap();
    requestAnimationFrame(() => { (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.invalidateSize; value = value.call(receiver, {pan:false}); receiver = undefined; return value; })(); fit() });
  });
  function syncPhoneViewport() {
    const viewport = window.visualViewport;
    const keyboard = isPhone() && viewport && viewport.scale === 1 && viewport.height < innerHeight - 120 && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
    document.body.style.setProperty('--phone-viewport-height', keyboard ? viewport.height + 'px' : innerHeight + 'px');
    document.body.style.setProperty('--phone-keyboard-inset', keyboard ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) + 'px' : '0px');
    requestAnimationFrame(() => { if (isPhone()) (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.invalidateSize; value = value.call(receiver, {pan:false}); receiver = undefined; return value; })() });
  }
  (() => { let value = window, receiver; receiver = value; value = value.visualViewport; if (value == null) return undefined; receiver = value; value = value.addEventListener; value = value.call(receiver, 'resize', syncPhoneViewport); receiver = undefined; return value; })();
  window.addEventListener('atlas-window-change', syncPhoneViewport);
  document.addEventListener('focusout', () => requestAnimationFrame(syncPhoneViewport));
  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.invalidateSize; value = value.call(receiver, {pan:false}); receiver = undefined; return value; })());
  });
  let wasMobile = innerWidth < 800;
  window.addEventListener('resize', () => {
    const mobile = innerWidth < 800;
    if (wasMobile !== mobile) {
      wasMobile = mobile;
      setTimeout(() => {
        (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.invalidateSize; value = value.call(receiver); receiver = undefined; return value; })();
        fit()
      }, 120)
    }
  });
  syncPhoneViewport();
  Runtime.refreshWindow();
  document.body.classList.remove('app-loading');
  document.body.setAttribute('aria-busy', 'false');
  document.querySelectorAll('button[disabled]').forEach(button => button.removeAttribute('disabled'));
  window.ATLAS_APP = {
    get visible() {
      return visible
    },
    get layout() {
      return Object.assign({}, layout)
    },
    get mapSize() {
      return (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.getSize; value = value.call(receiver); receiver = undefined; return value; })()
    },
    get mapZoom() {
      return (() => { let value = map, receiver; if (value == null) return undefined; receiver = value; value = value.getZoom; value = value.call(receiver); receiver = undefined; return value; })()
    },
    get trip() { return trip.map(item => Object.assign({}, item)); },
    activeOn,
    nextDates,
    timing,
    showFlight,
    fit
  };
})().catch(error => {
  document.body.setAttribute('aria-busy','false');
  const target = document.getElementById('routeList');
  if (target) target.textContent = '初始化未完成，请关闭后重新打开。';
  const message = document.getElementById('toast');
  if (message) { message.textContent = '页面初始化失败，请重新打开小工具。'; message.classList.add('visible'); }
  console.error('Atlas initialization failed', error);
});
