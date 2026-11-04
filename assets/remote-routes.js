'use strict';
(()=>{
const D=window.REMOTE_ROUTES,S=window.ATLAS_SEARCH,$=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={imported:'已补入时刻','official-plan':'官方航线 / 计划',lead:'近期客运线索',unresolved:'仍待复核',restricted:'特别许可'};
const cache=new Map(D.items.map(x=>[x.id,S.index([x.title,x.routeRu,x.operator,x.region,x.aircraft,x.booking,x.notes,...(x.tags||[])])]));
const u=new URLSearchParams(location.search);$('query').value=u.get('q')||'';$('status').value=u.get('status')||'';
$('region').innerHTML+=[...new Set(D.items.map(x=>x.region))].map(x=>'<option>'+esc(x)+'</option>').join('');
function render(){const terms=S.terms($('query').value),shown=D.items.filter(x=>(!$('region').value||x.region===$('region').value)&&(!$('status').value||x.status===$('status').value)&&S.matches(cache.get(x.id),terms));
$('count').textContent=shown.length+' / '+D.items.length+' 项核查记录';
$('results').innerHTML=shown.map(x=>`<details class="entry" id="${esc(x.id)}"><summary><span class="region">${esc(x.region)}</span><div><h2>${esc(x.title)}</h2><div class="route-ru">${esc(x.routeRu)}</div><div class="summary-meta">${esc(x.aircraft)} · ${esc(x.operator)}</div></div><span class="summary-end"><span class="badge ${x.status}">${labels[x.status]}</span><span class="expand">查看详情 ＋</span></span></summary><div class="entry-body">${x.restriction?'<p class="restriction"><strong>'+esc(x.restriction)+'</strong></p>':''}<dl><div><dt>有效期 / 核查范围</dt><dd>${esc(x.period)}</dd></div><div><dt>班期与时刻</dt><dd>${esc(x.schedule)}</dd></div><div class="wide"><dt>怎样购票 / 向哪里确认</dt><dd>${esc(x.booking)}</dd></div><div class="wide"><dt>证据与待核事项</dt><dd>${esc(x.notes)}</dd></div></dl>${x.mapQuery?'<a class="map-link" href="./?'+esc(x.mapQuery)+'">'+(x.status==='restricted'?'查看受限航班（需特别许可）':'在地图中查看已补航班')+' ↗</a>':''}<div class="evidence">${x.sources.map(s=>'<span class="source"><a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.title)+' ↗</a>'+(s.local?'<a class="snapshot" href="'+esc(s.local)+'" target="_blank" rel="noopener">原件快照</a>':'')+'</span>').join('')}</div></div></details>`).join('')||'<p class="empty">没有匹配记录，试试机场俄文、英文转写或清除筛选。</p>';
if(!terms.length&&!$('region').value&&!$('status').value)$('results').innerHTML+='<section class="remaining"><h2>仍未取得现行完整时刻的地区</h2>'+D.unresolvedRegions.map(x=>'<p><b>'+esc(x.region)+'</b> · '+esc(x.detail)+'</p>').join('')+'<p>这次确认了具体遗漏，也保留了未解决的缺口；清单不代表全部航网已收齐。政府计划与预约页面均不保证当天实际执行。</p></section>';
}
for(const id of ['query','region','status'])$(id).addEventListener(id==='query'?'input':'change',render);render();
if(location.hash){const x=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(x?.matches('details')){x.open=true;x.scrollIntoView();}}
})();
