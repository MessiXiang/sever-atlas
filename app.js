'use strict';
(() => {
  const D = window.ATLAS_DATA,
    A = D.airports,
    F = D.flights,
    AL = D.airlines,
    S = D.sources,
    $ = id => document.getElementById(id),
    esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    } [c]));
  const name = id => A[id]?.zh || A[id]?.ru || id,
    short = id => A[id]?.iata || A[id]?.icao || A[id]?.ru || id,
    fmt = x => x ? x.replaceAll('-', '.') : '未公布',
    week = ['', '一', '二', '三', '四', '五', '六', '日'],
    TODAY = D.asOf;
  const runtimeDate = new Date().toLocaleDateString('en-CA'),
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
    limit = 35,
    linesOn = true,
    visible = [],
    map, markers = {},
    paths = [],
    routeLayer, markerLayer, hoverLayer, trip = [];
  try {
    trip = JSON.parse(localStorage.getItem('sever-trip-v1') || '[]').map(x => ({
      ...x,
      id: D.flightAliases?.[x.id] || x.id
    })).filter(x => F.some(f => f.id === x.id))
  } catch {}
  const flightLabel = f => f.number || '航班号未公布';
  const arrivalLabel = f => (f.arrival || '未公布') + (f.arrivalDayOffset > 0 ? ' (+' + f.arrivalDayOffset + ')' : f.arrivalDayOffset < 0 ? ' (' + f.arrivalDayOffset + ')' : '');
  const badge = f => {
      let [t, c] = states[f.status] || states.confirmed;
      if (f.accessRestriction) return '<span class="badge warning">新地岛 · 需特别许可</span>';
      if (f.status === 'confirmed' && f.aircraft.length > 1) t = '候选机型范围';
      if (f.conflictDates?.length) {
        t = '部分日期时刻冲突';
        c = 'warning'
      }
      return `<span class="badge ${c}">${t}</span>`
    },
    types = f => f.aircraft.map(x => x === 'TVS' ? 'TVS（An-2 改型）' : x).join(' / '),
    route = f => f.route || [f.from, f.to],
    routeText = f => route(f).map(name).join(' → '),
    plainRoute = f => f.routeKind === 'circuit' ? name(f.from) + ' · 往返环线' : name(f.from) + ' → ' + name(f.to),
    heli = f => f.aircraft.every(x => x.startsWith('Mi'));
  const daysText = f => f.dates ? f.dates.filter(d => d >= baseDate).length + ' 个指定日期' : f.recurrence === 'biweekly-unconfirmed' ? '隔周 · 周' + f.days.map(d => week[d]).join('/') : f.days.length === 7 ? '每日' : f.days.length ? '周' + f.days.map(d => week[d]).join(' / ') : '日期待确认';

  function activeOn(f, d) {
    if (d < f.start || (f.end && d > f.end)) return false;
    if (f.status === 'source-conflict' || f.recurrence === 'biweekly-unconfirmed') return false;
    if (f.dates) return f.dates.includes(d);
    if (f.excludedDates?.includes(d)) return false;
    return f.days.includes(new Date(d + 'T12:00:00Z').getUTCDay() || 7)
  }

  function nextDates(f, n = 14) {
    if (f.status === 'source-conflict' || f.recurrence === 'biweekly-unconfirmed') return [];
    if (f.dates) return f.dates.filter(d => d >= baseDate).slice(0, n);
    let out = [],
      d = new Date((f.start > baseDate ? f.start : baseDate) + 'T12:00:00Z');
    for (let i = 0; i < 367 && out.length < n; i++, d.setUTCDate(d.getUTCDate() + 1)) {
      let s = d.toISOString().slice(0, 10);
      if (f.end && s > f.end) break;
      if (activeOn(f, s)) out.push(s)
    }
    return out
  }
  const modelOrder = ['An-2', 'TVS', 'An-24', 'An-26', 'An-28', 'An-38', 'An-72', 'An-74', 'Yak-40', 'Yak-42', 'Tu-134', 'Tu-154', 'Tu-204', 'Tu-214', 'Il-62', 'Il-76', 'Mi-8', 'Mi-171', 'L-410', 'SSJ100'];
  const modelSet = new Set([...F.flatMap(f => f.aircraft), 'L-410', 'Tu-204', 'Tu-214']);
  const families = [
    ['', '全部'], ...modelOrder.filter(x => modelSet.has(x)).map(x => [x, x === 'An-2' ? 'An-2 / TVS' : x]), ...[...modelSet].filter(x => !modelOrder.includes(x)).sort().map(x => [x, x === 'An-2' ? 'An-2 / TVS' : x])
  ];
  $('familyFilters').innerHTML = families.map(([id, t]) => `<button class="chip ${!id?'active':''}" data-family="${id}">${t}</button>`).join('');
  $('dayFilter').innerHTML = week.slice(1).map((w, i) => `<button data-day="${i+1}" aria-label="星期${w}">${w}</button>`).join('');
  $('airlineFilter').innerHTML += Object.entries(AL).map(([id, a]) => `<option value="${id}">${esc(a.zh)} · ${esc(a.ru)}</option>`).join('');
  $('dateFilter').min = TODAY;
  const Search = window.ATLAS_SEARCH,
    norm = Search.normalize;
  const airlineFields = id => {
    let a = AL[id] || {},
      c = D.coverage.find(x => x.airlineId === id) || {};
    return [a.ru, a.zh, a.code, c.name, c.legal, ...(Search.airlineAliases[id] || [])]
  };
  const searchCache = new Map(F.map(f => [f.id, Search.index([f.number, ...(f.numberAliases || []), types(f), f.aircraftParent, ...airlineFields(f.airline), ...route(f).flatMap(id => [id, A[id]?.iata, A[id]?.icao, A[id]?.sourceCode, A[id]?.ru, A[id]?.zh, A[id]?.en])])]));
  const coverageSearchCache = new Map(D.coverage.map(x => [x.inn, Search.index([x.name, x.legal, x.note, x.zh, x.url, ...(x.airlineId ? airlineFields(x.airlineId) : [])])]));

  function apply() {
    limit = 35;
    const queryTerms = Search.terms(st.q);
    $('search').value = $('tableSearch').value = st.q;
    visible = F.filter(f => (st.private || f.publicAccess !== 'unverified') && (!f.end || f.end >= baseDate) && (!st.q || Search.matches(searchCache.get(f.id), queryTerms)) && (!st.family || f.aircraft.includes(st.family) || f.aircraftParent === st.family) && (!st.airline || f.airline === st.airline) && (!st.date || activeOn(f, st.date)) && (!st.day || f.days.includes(st.day)) && (!st.strict || (f.status === 'confirmed' && f.aircraft.length === 1)) && (!st.airport || (st.airportMode === 'out' ? f.from === st.airport : st.airportMode === 'in' ? f.to === st.airport : route(f).includes(st.airport))));
    visible.sort((a, b) => (nextDates(a, 1)[0] || '9999').localeCompare(nextDates(b, 1)[0] || '9999') || (a.departure || '99').localeCompare(b.departure || '99') || a.number.localeCompare(b.number));
    $('filterSummary').textContent = [st.family || '全部机型', st.airline ? AL[st.airline].zh : '全部航司', st.date, st.day ? '周' + week[st.day] : '', st.strict ? '机型明确' : '', st.private ? '含待核班次' : ''].filter(Boolean).join(' · ');
    $('resultCount').textContent = visible.length + ' 条时刻';
    $('resultTitle').textContent = st.airport ? name(st.airport) : '已收录航班';
    $('selectedAirport').hidden = !st.airport;
    $('selectedAirport').innerHTML = st.airport ? `<button id="clearAirport">${esc(name(st.airport))} × 清除机场筛选</button><div class="airport-modes">${[['all','全部关联'],['out','从此出发'],['in','到达此处']].map(([v,t])=>'<button data-airport-mode="'+v+'" class="'+(st.airportMode===v?'active':'')+'">'+t+'</button>').join('')}</div>` : '';
    $('clearAirport')?.addEventListener('click', () => {
      st.airport = '';
      st.airportMode = 'all';
      apply()
    });
    document.querySelectorAll('[data-airport-mode]').forEach(b => b.onclick = () => {
      st.airportMode = b.dataset.airportMode;
      apply()
    });
    renderList();
    renderTable();
    renderMap();
    let p = new URLSearchParams();
    for (let [k, v] of Object.entries(st))
      if (v && k !== 'view') p.set(k, String(v));
    try {
      history.replaceState(null, '', location.pathname + (p.size ? '?' + p : ''))
    } catch {}
  }

  function renderList() {
    $('routeList').innerHTML = visible.length ? visible.slice(0, limit).map(f => `<button class="route-card" data-flight="${f.id}"><span class="route-top"><span>${esc(flightLabel(f))}</span><span class="aircraft-tag ${heli(f)?'heli':''}">${esc(types(f))}</span></span><span class="route-code">${esc(short(f.from))}<span class="arrow">${f.routeKind==='circuit'?'⟳':'→'}</span>${esc(f.routeKind==='circuit'?'环线':short(f.to))}</span><span class="route-names">${esc(plainRoute(f))}</span><span class="route-foot"><span>${f.departure||'待定'} — ${arrivalLabel(f)}</span><span>${esc(daysText(f))}</span></span><span class="route-evidence">${esc(AL[f.airline].zh)} ${badge(f)}</span></button>`).join('') + (visible.length > limit ? '<button class="load-more" id="loadMore">再显示更多航班 ↓</button>' : '') : '<div class="empty"><strong>没有匹配的已收录航班</strong>试试清除机场、机型或日期筛选。未查到不等于没有航班；请查看「收录与来源」。</div>';
    $('loadMore')?.addEventListener('click', () => {
      limit += 35;
      renderList()
    })
  }

  function renderTable() {
    $('flightTable').innerHTML = visible.slice(0, 500).map(f => `<tr data-flight="${f.id}" tabindex="0"><td><b class="mono">${esc(flightLabel(f))}</b><small>${esc(AL[f.airline].zh)}</small></td><td>${esc(plainRoute(f))}<small>${esc(short(f.from))} → ${esc(short(f.to))}</small></td><td class="mono">${esc(types(f))}</td><td class="mono">${f.departure||'未公布'} — ${arrivalLabel(f)}<small>两地当地时间</small></td><td>${esc(daysText(f))}</td><td>${fmt(f.start)}<small>至 ${f.end?fmt(f.end):'结束日未公布'} ${badge(f)}</small></td><td>↗</td></tr>`).join('') || '<tr><td colspan="7">暂无匹配记录，请返回地图调整筛选。</td></tr>';
    $('tableCount').textContent = '共 ' + visible.length + ' 条时刻记录。' + (visible.length > 500 ? '页面显示前 500 条，CSV 包含全部筛选结果。' : '') + '指定日期记录已合并相同的航线、机型与时刻。'
  }
  const ll = id => A[id]?.lat != null ? [A[id].lat, A[id].lon < 0 ? A[id].lon + 360 : A[id].lon] : null;

  function initMap() {
    if (!window.L) {
      $('map').innerHTML = '<div class="map-error">地图组件未加载。航班查询与来源仍可使用。</div>';
      return
    }
    map = L.map('map', {
      zoomControl: false,
      minZoom: 1,
      maxZoom: 11,
      zoomSnap: .25,
      worldCopyJump: false
    }).setView([62, 115], 3);
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
        fillColor: f.properties?.name === 'Russia' ? '#f8fafb' : '#f0f3f5',
        fillOpacity: 1
      })
    }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    hoverLayer = L.layerGroup().addTo(map);
    let online = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 11,
        opacity: .55,
        attribution: '© OpenStreetMap contributors'
      }),
      control = L.control({
        position: 'bottomleft'
      });
    control.onAdd = () => {
      let el = L.DomUtil.create('button', 'basemap-toggle');
      el.textContent = '街道底图';
      el.title = '联网载入 OpenStreetMap 街道底图';
      L.DomEvent.disableClickPropagation(el);
      el.onclick = () => {
        if (map.hasLayer(online)) {
          map.removeLayer(online);
          el.textContent = '街道底图'
        } else {
          online.addTo(map);
          el.textContent = '简洁底图'
        }
      };
      return el
    };
    control.addTo(map);
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
    let used = new Set(visible.flatMap(route)),
      mapped = [...used].filter(id => ll(id)),
      rs = new Set(visible.flatMap(f => segments(f).map(s => s.slice().sort().join('|'))));
    $('mapStats').innerHTML = `<div><strong>${mapped.length}</strong><span>地图航点</span></div><div><strong>${rs.size}</strong><span>双向合并航线</span></div><div><strong>${new Set(visible.map(f=>f.airline)).size}</strong><span>已收录航司</span></div>`;
    $('mapTip').textContent = '悬停机场预览，点击筛选' + (used.size > mapped.length ? ' · ' + (used.size - mapped.length) + ' 个航点坐标待核实' : '');
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
          dashArray: f.status === 'confirmed' ? null : '3 5'
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
          radius: Math.min(8, 3 + Math.log2(fs.length + 1) * .6),
          color,
          weight: 1.5,
          fillColor: approx ? '#fff' : color,
          fillOpacity: .85
        }).addTo(markerLayer);
      markers[id] = m;
      let dest = new Set(fs.flatMap(route).filter(x => x !== id));
      m.bindTooltip(`<strong>${esc(short(id))}</strong><b>${esc(name(id))}</b><p>${esc(A[id].ru)}</p><p>${esc([...new Set(fs.flatMap(f=>f.aircraft))].join(' / '))}</p><div class="tt-bottom">${fs.length} 条时刻 · ${dest.size} 个关联航点<br>${A[id].coordinateStatus==='settlement'?'村镇参考坐标，非精确起降点':A[id].coordinateStatus==='provider-reference'?'航司查询器参考坐标，精度待核':'机场坐标（OurAirports）'}<br>点击查看相关航班</div>`, {
        className: 'airport-tooltip',
        direction: 'top',
        offset: [0, -7]
      });
      m.on('mouseover', () => highlight(id));
      m.on('mouseout', () => hoverLayer.clearLayers());
      m.on('click', () => {
        st.airport = id;
        st.airportMode = 'all';
        apply();
        if (innerWidth < 800) $('resultTitle').scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      })
    }
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
    let pts = [...new Set(visible.flatMap(route))].map(ll).filter(Boolean);
    if (pts.length) map.fitBounds(pts, {
      paddingTopLeft: innerWidth < 800 ? [20, 130] : [40, 150],
      paddingBottomRight: innerWidth < 800 ? [25, 65] : [65, 120],
      maxZoom: 6,
      animate: !matchMedia('(prefers-reduced-motion:reduce)').matches
    })
  }

  function showFlight(id) {
    let f = F.find(x => x.id === id);
    if (!f) return;
    let s = S[f.source],
      dates = nextDates(f, 120);
    $('flightDetail').innerHTML = `<span class="eyebrow">FLIGHT NOTES · ${esc(AL[f.airline].ru)}</span><h2 class="detail-title">${esc(flightLabel(f))} <span class="aircraft-tag">${esc(types(f))}</span> ${badge(f)}</h2><div class="detail-airports"><div><strong>${esc(short(f.from))}</strong><b>${esc(name(f.from))}</b><small>${esc(A[f.from].ru)}</small></div><span>${f.routeKind==='circuit'?'⟳':'→'}</span><div><strong>${esc(short(f.to))}</strong><b>${esc(name(f.to))}</b><small>${esc(A[f.to].ru)}</small></div></div><div class="detail-times"><div><strong>${f.departure||'未公布'}</strong><small>出发地当地时间 · ${esc(A[f.from].tz||'时区待核实')}</small></div><div><strong>${arrivalLabel(f)}</strong><small>到达地当地时间 · ${esc(A[f.to].tz||'时区待核实')}</small></div></div><dl class="detail-grid"><div><dt>班期</dt><dd>${esc(daysText(f))}</dd></div><div><dt>有效期</dt><dd>${fmt(f.start)} — ${f.end?fmt(f.end):'结束日未公布'}</dd></div><div><dt>${AL[f.airline].role==='organizer'?'包机组织方 · 承运人待核':'运营航司'}</dt><dd>${esc(AL[f.airline].zh)}<br>${esc(AL[f.airline].ru)}</dd></div><div><dt>机型依据</dt><dd>${esc(states[f.status]?.[0]||'官网机型')} ${f.alternatives?.length?'· 可能替代 '+esc(f.alternatives.join('/')):''}</dd></div></dl>${f.route?'<p class="detail-route">航路：'+esc(routeText(f))+'</p>':''}${f.stopTimes?'<ol class="stop-timeline">'+f.stopTimes.map(x=>'<li><strong>'+esc(name(x.airport))+'</strong>'+[x.arrival?'到达 '+x.arrival:'',x.departure?'出发 '+x.departure:''].filter(Boolean).join(' · ')+'</li>').join('')+'</ol>':''}${f.accessRestriction?'<p class="access-warning"><strong>'+esc(f.accessRestriction)+'</strong><br>预约或显示余位不等于获得进入资格；请先向组织方确认许可条件。</p>':''}<p class="detail-note">${esc((f.timeCheck?'官网飞行时长与两地当地时间换算不一致；不计算可靠衔接。':'')+(f.conflictDates?.length?'同航班同航段出现不同计划时刻，冲突日期：'+f.conflictDates.map(fmt).join('、')+'。这些日期不计算衔接。':'')+(f.publicAccess==='unverified'?'散客购票资格尚未核实。':'')+(f.conditional?'按客流/载荷条件执行。':'')+(f.note||'官网计划机型；实际执飞机型和售票状态仍需订票时确认。'))}${f.recurrence==='biweekly-unconfirmed'?'<br>隔周起算日期不明，不在指定日期筛选中推演。':''}${f.status==='source-conflict'?'<br>版本冲突未解决，不进入指定日期筛选。':''}</p>${f.booking?'<div class="booking-note"><b>购票方式 · '+esc(f.booking.method)+'</b><p>'+esc(f.booking.text)+'</p><a href="'+esc(f.booking.url)+'" target="_blank" rel="noopener">购票 / 咨询入口 ↗</a> <a href="'+esc(f.booking.source)+'" target="_blank" rel="noopener">购票信息来源 ↗</a></div>':''}<b class="mini-label">${f.dates?'官网指定日期':'按公布班期展开的近期日期'}</b><div class="detail-dates">${dates.length?dates.map(d=>'<span>'+fmt(d)+' · '+week[new Date(d+'T12:00Z').getUTCDay()||7]+'</span>').join(''):'<span>日期需向航司确认</span>'}</div><div class="detail-source"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a><small>来源定位：${esc(f.sourceLocator)} · 核查 ${fmt(f.checkedAt)}</small>${(f.localSource||s.local)?'<a href="'+esc(f.localSource||s.local)+'" target="_blank">本地原始快照 ↗</a>':''}${f.routeEvidence?.length>1?'<small>经停顺序由官网同号同日班段重建：</small>'+f.routeEvidence.map((url,i)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener">第 '+(i+1)+' 段官方查询快照 ↗</a>').join(''):''}<small>${esc(s.note||'')}<br>计划时刻不代表当日实际起降或当前有余票。</small></div><div class="detail-actions"><button class="primary" id="saveFlight">＋ 加入我的行程</button><button class="secondary" id="focusFlight">在地图中查看 ↗</button><button class="secondary" id="onwardFlight">从目的地继续探索 →</button></div>`;
    $('saveFlight').onclick = () => {
      trip.push({
        id,
        date: st.date && activeOn(f, st.date) ? st.date : dates[0] || '',
        key: Date.now() + '-' + Math.random().toString(36).slice(2, 7)
      });
      persist();
      toast('已保存到「我的行程」');
      $('saveFlight').textContent = '已加入 · 再存一段'
    };
    $('focusFlight').onclick = () => {
      $('flightDialog').close();
      switchView('explore');
      st.airport = f.from;
      apply();
      fit()
    };
    $('onwardFlight').onclick = () => {
      $('flightDialog').close();
      switchView('explore');
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
    try {
      localStorage.setItem('sever-trip-v1', JSON.stringify(trip))
    } catch {
      toast('浏览器未允许本地保存，请导出 CSV 保留行程')
    }
    $('tripCount').textContent = trip.length
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
            hourCycle: 'h23'
          }).formatToParts(new Date(guess)),
          p = Object.fromEntries(ps.map(x => [x.type, x.value])),
          represented = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':00Z');
        guess += target - represented
      }
      return guess
    } catch {
      return null
    }
  }

  function timing(f, d) {
    if (f.locationUnverified || f.operatorUnverified || f.geographyCheck || f.timeCheck || !activeOn(f, d) || f.conflictDates?.includes(d) || f.status === 'conflict' || f.publicAccess === 'unverified' || f.routeKind || f.recurrence === 'biweekly-unconfirmed' || !A[f.from].tzVerified || !A[f.to].tzVerified) return null;
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
      return `${connection?'<div class="trip-connection">'+connection+'</div>':''}<article class="trip-leg"><div class="trip-leg-top"><strong>${i+1}. ${esc(short(f.from))} → ${esc(short(f.to))}</strong><div><button data-up="${i}" aria-label="上移航段" ${i===0?'disabled':''}>↑</button><button data-down="${i}" aria-label="下移航段" ${i===trip.length-1?'disabled':''}>↓</button><button data-remove="${i}" aria-label="移除航段">×</button></div></div><small>${esc(flightLabel(f))} · ${esc(AL[f.airline].zh)} · ${esc(types(f))}</small><small>${esc(plainRoute(f))}</small><div class="trip-meta"><select data-tripdate="${i}" aria-label="选择航段日期">${ds.length?ds.map(d=>'<option value="'+d+'" '+(d===item.date?'selected':'')+'>'+fmt(d)+' · 周'+week[new Date(d+'T12:00Z').getUTCDay()||7]+(d<baseDate?' · 已过期':!activeOn(f,d)?' · 日期需重选':'')+'</option>').join(''):'<option value="">日期需确认</option>'}</select><span>${f.departure||'未公布'} — ${arrivalLabel(f)}</span></div><small>${t?'UTC '+new Date(t.dep).toISOString().slice(0,16).replace('T',' ')+' → '+new Date(t.arr).toISOString().slice(0,16).replace('T',' ')+(t.inferred?' · 到达日推定':''):'当地时间；未进行可靠的跨时区衔接计算'}</small>${badge(f)}<button data-flight="${f.id}" class="trip-detail-link">查看详情 ↗</button></article>`
    }).join('') : '<div class="empty"><strong>先找到一段想坐的航班。</strong>打开机场或航班卡片，在详情中加入行程。保存留在此浏览器，可导出 CSV。</div>'
  }

  function csvCell(x) {
    let s = String(x ?? '');
    if (/^[=+@\-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"'
  }

  function exportCSV(list, isTrip = false) {
    let headers = ['顺序', '选择日期', '航司', '航班号', '出发机场', '目的机场', '完整航路', '机型', '替代机型', '出发当地时间', '到达当地时间', '星期', '指定日期', '有效起始', '有效结束', '证据状态', '来源', '备注'],
      records = list.map((x, i) => {
        let f = isTrip ? F.find(f => f.id === x.id) : x;
        return [i + 1, isTrip ? x.date : '', AL[f.airline].ru, f.number, name(f.from), name(f.to), routeText(f), types(f), (f.alternatives || []).join('/'), f.departure, arrivalLabel(f), f.days.map(d => week[d]).join('/'), f.dates?.join(';'), f.start, f.end, states[f.status]?.[0], S[f.source].url, f.note]
      }),
      blob = new Blob(['\uFEFF' + [headers, ...records].map(r => r.map(csvCell).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8'
      }),
      a = document.createElement('a'),
      url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'sever-' + (isTrip ? 'trip' : 'flights') + '-' + TODAY + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已导出 ' + records.length + ' 条记录')
  }

  function renderCoverage() {
    $('coverageSummary').innerHTML = `<div><strong>${Object.values(AL).filter(a=>a.role!=='organizer').length}</strong><span>已录入时刻的航司</span></div><div><strong>${F.length}</strong><span>合并后的时刻记录</span></div><div><strong>${D.coverage.length}</strong><span>俄文维基名录条目</span></div><div><strong>${D.coverage.filter(x=>['pending','registry-only'].includes(x.review)).length}</strong><span>仍待逐项核查</span></div>`;
    $('scopeText').textContent = D.scope;
    let q = $('coverageSearch').value.trim(),
      queryTerms = Search.terms(q),
      all = $('coverageAll').checked,
      entries = D.coverage.filter(x => (all || q || !['pending', 'registry-only'].includes(x.review) || x.url) && (!q || Search.matches(coverageSearchCache.get(x.inn), queryTerms))),
      labels = {
        included: ['已录入', 'ok'],
        partial: ['部分核实', 'pending'],
        blocked: ['待补核验', 'warning'],
        excluded: ['范围外', ''],
        pending: ['未完成核查', 'pending'],
        'registry-only': ['作业 / 通航', ''],
        nonpublic: ['非普通客运', ''],
        inactive: ['已停止自营', 'warning']
      };
    $('coverageList').innerHTML = entries.map(x => `<article class="coverage-item"><div><h3>${esc(x.name)}</h3><small>${esc(x.zh||x.legal||'')}</small></div><div><p>${esc(x.note||'已从俄文维基名录提取，尚未完成官网运营状态与逐航线核查；不能据此认定仍在运营或没有可体验航班。')}</p>${x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">航司 / 核验来源 ↗</a>':''}${x.wiki?'<a href="'+esc(x.wiki)+'" target="_blank" rel="noopener">俄文维基 ↗</a>':''}${(x.evidence||[]).map(e=>'<a href="'+esc(e.local||e.url)+'" target="_blank" rel="noopener">'+esc(e.title)+' ↗</a>').join('')}</div><span class="badge ${(labels[x.review]||labels.pending)[1]}">${(labels[x.review]||labels.pending)[0]}</span></article>`).join('')
  }

  function switchView(v) {
    st.view = v;
    document.body.dataset.page = v;
    for (let x of ['explore', 'flights', 'coverage']) $(x + 'View').hidden = x !== v;
    document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === v));
    if (v === 'explore') setTimeout(() => map?.invalidateSize(), 30);
    if (v === 'coverage') renderCoverage();
    scrollTo({
      top: 0,
      behavior: 'instant'
    })
  }
  $('tableSearch').oninput = e => {
    st.q = e.target.value;
    apply()
  };
  $('search').oninput = e => {
    st.q = e.target.value;
    apply()
  };
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
        padding: [50, 100]
      });
      document.querySelectorAll('[data-region]').forEach(x => x.classList.toggle('selected', x === r))
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      switchView('explore');
      $('search').focus()
    }
    if (e.key === 'Enter' && e.target.matches('tr[data-flight]')) showFlight(e.target.dataset.flight)
  });
  let layout = {
    titlesCollapsed: true,
    filtersCollapsed: true
  };
  try {
    const saved = JSON.parse(localStorage.getItem('sever-layout-v2') || '{}');
    for (const k of Object.keys(layout))
      if (typeof saved[k] === 'boolean') layout[k] = saved[k]
  } catch {}

  function syncLayout() {
    document.body.classList.toggle('titles-collapsed', layout.titlesCollapsed);
    $('filterOptions').hidden = layout.filtersCollapsed;
    $('headerToggle').setAttribute('aria-expanded', String(!layout.titlesCollapsed));
    $('headerToggle').title = layout.titlesCollapsed ? '展开标题区' : '收起标题区';
    $('headerToggle').setAttribute('aria-label', $('headerToggle').title);
    $('filtersToggle').setAttribute('aria-expanded', String(!layout.filtersCollapsed));
    $('filtersToggle').textContent = layout.filtersCollapsed ? '展开筛选 ＋' : '收起筛选 −';
    try {
      localStorage.setItem('sever-layout-v2', JSON.stringify(layout))
    } catch {}
    requestAnimationFrame(() => map?.invalidateSize({
      pan: false
    }));
  }
  $('headerToggle').onclick = () => {
    layout.titlesCollapsed = !layout.titlesCollapsed;
    syncLayout()
  };
  $('filtersToggle').onclick = () => {
    layout.filtersCollapsed = !layout.filtersCollapsed;
    syncLayout()
  };
  $('fitMap').onclick = fit;
  $('zoomIn').onclick = () => map?.zoomIn();
  $('zoomOut').onclick = () => map?.zoomOut();
  $('toggleLines').onclick = () => {
    linesOn = !linesOn;
    $('toggleLines').classList.toggle('selected', linesOn);
    renderMap()
  };
  $('appreciationButton').onclick = () => $('appreciationDialog').showModal();
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
    toast('已清空本地行程')
  };
  $('exportTrip').onclick = () => exportCSV(trip, true);
  $('exportAll').onclick = () => exportCSV(visible);
  $('coverageSearch').oninput = renderCoverage;
  $('coverageAll').onchange = renderCoverage;
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => {
    if (e.target === d) {
      let r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close()
    }
  }));
  let p = new URLSearchParams(location.search);
  for (let k of ['q', 'family', 'airline', 'date', 'airport', 'airportMode'])
    if (p.has(k)) st[k] = p.get(k);
  st.airport = D.airportAliases?.[st.airport] || st.airport;
  if (!A[st.airport]) st.airport = '';
  st.family = ({
    heli: 'Mi-8',
    ssj: 'SSJ100',
    an2: 'An-2',
    antonov: '',
    yak: ''
  })[st.family] ?? st.family;
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
  syncLayout();
  initMap();
  persist();
  apply();
  fit();
  let wasMobile = innerWidth < 800;
  window.addEventListener('resize', () => {
    const mobile = innerWidth < 800;
    if (wasMobile !== mobile) {
      wasMobile = mobile;
      setTimeout(() => {
        map?.invalidateSize();
        fit()
      }, 120)
    }
  });
  window.ATLAS_APP = {
    get visible() {
      return visible
    },
    get layout() {
      return {
        ...layout
      }
    },
    get mapSize() {
      return map?.getSize()
    },
    get mapZoom() {
      return map?.getZoom()
    },
    activeOn,
    nextDates,
    timing,
    showFlight,
    fit
  };
})();
