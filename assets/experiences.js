'use strict';
(() => {
  const D = window.ATLAS_EXPERIENCES;
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  if (!D) {
    $('experienceGroups').innerHTML = '<p class="empty">体验资料未加载，请检查 data/experiences.js 是否与网页一同保存。</p>';
    return;
  }
  const money = price => Number(price.amount).toLocaleString('zh-CN', {maximumFractionDigits:2}) + ' ' + price.currency;
  const duration = price => price.minutes === 60 ? '1 小时' : price.minutes + ' 分钟';
  const month = new Date().getMonth() + 1;
  $('experienceDate').textContent = D.asOf.replaceAll('-', '.');
  $('experienceCount').textContent = D.models.length + ' 种机型 · ' + D.items.length + ' 项服务';
  $('experienceModels').innerHTML = D.models.map(m => '<a href="#experience-'+esc(m.id)+'">'+esc(m.id)+'<span>'+D.items.filter(x=>x.model===m.id).length+'</span></a>').join('');

  function item(x) {
    const primary = x.prices[0], seasonal = x.seasonMonths && !x.seasonMonths.includes(month);
    const prices = x.prices.length ? '<table class="experience-prices"><caption>公开报价 · '+esc(x.prices[0].basis)+'</caption><thead><tr><th scope="col">时长</th><th scope="col">价格</th><th scope="col">计费单位</th></tr></thead><tbody>'+x.prices.map(p=>'<tr><th scope="row">'+esc(duration(p))+'</th><td>'+esc(money(p))+'</td><td>'+esc(p.basis)+'</td></tr>').join('')+'</tbody></table>' : '';
    return '<article class="experience-item" id="'+esc(x.id)+'">'+
      '<div class="experience-location"><span>'+esc(x.countryZh)+'</span><b>'+esc(x.location)+'</b><small>'+esc(x.category)+'</small></div>'+
      '<div class="experience-content"><div class="experience-title-row"><h3>'+esc(x.title)+'</h3>'+(seasonal?'<span class="badge warning">季外 · 下季需确认</span>':'')+'</div><p class="experience-summary">'+esc(x.summary)+'</p>'+
      '<div class="experience-meta"><span>'+esc(x.capacity)+'</span><span>'+esc(x.period)+'</span></div>'+
      '<div class="experience-offer"><div class="experience-price">'+(primary?'<strong>'+esc(money(primary))+'</strong><span>'+esc(duration(primary)+' · '+primary.basis)+'</span>':'<strong>按需询价</strong><span>整机包租</span>')+'</div><a class="experience-book" href="'+esc(x.bookingUrl)+'" target="_blank" rel="noopener noreferrer">查看报价与预约 ↗</a></div>'+
      (x.priceNote?'<p class="experience-price-note">'+esc(x.priceNote)+'</p>':'')+
      '<div class="experience-contacts">'+x.contacts.map(c=>'<a href="'+esc(c.url)+'">'+esc(c.label)+'</a>').join('')+'</div>'+
      '<details class="experience-details"><summary>完整价目、参加条件与来源</summary><div class="experience-detail-body">'+prices+(x.extraPrice?'<p>'+esc(x.extraPrice)+'</p>':'')+'<p><b>提供方：</b>'+esc(x.operator)+'</p><p><b>机型：</b>'+esc(x.aircraftDetail)+'</p><ul>'+x.conditions.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul><div class="experience-sources">'+x.sourceIds.map(id=>{const s=D.sources[id];return '<span><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+' ↗</a><a href="'+esc(s.local)+'" target="_blank" rel="noopener">原文快照</a></span>';}).join('')+'</div><small>核查 '+esc(x.checkedAt)+'</small></div></details></div></article>';
  }
  $('experienceGroups').innerHTML = D.models.map(m => '<section class="experience-group" id="experience-'+esc(m.id)+'" aria-labelledby="experience-heading-'+esc(m.id)+'"><div class="experience-model-heading"><h2 id="experience-heading-'+esc(m.id)+'" tabindex="-1">'+esc(m.id)+'</h2><p>'+esc(m.description)+'</p></div><div class="experience-items">'+D.items.filter(x=>x.model===m.id).map(item).join('')+'</div></section>').join('');
  $('experienceModels').addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    const heading = document.querySelector(link.getAttribute('href') + ' h2');
    heading.focus({preventScroll:true});
    heading.closest('section').scrollIntoView({block:'start',behavior:'instant'});
  });
})();
