/* Supplemental browser regression only. Creator simulator / devices remain required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const cp = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const results = [];
const sourceCache = new Map();
const baseRef = '5bdd7c8';
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'";

async function main() {
  const server = http.createServer((req, res) => {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const baseline = name.startsWith('/baseline/');
    if (baseline) name = name.slice('/baseline'.length);
    name = name === '/' ? 'index.html' : name.replace(/^\//, '');
    if (name.includes('..')) { res.writeHead(400); res.end(); return; }
    try {
      let data;
      if (baseline) {
        if (!sourceCache.has(name)) sourceCache.set(name, cp.execFileSync('git', ['show', baseRef + ':' + name], {cwd:root,maxBuffer:8*1024*1024,stdio:['ignore','pipe','ignore']}));
        data = sourceCache.get(name);
      } else data = fs.readFileSync(path.join(root, 'dist', name));
      res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/html');
      res.setHeader('Content-Security-Policy', csp);
      res.end(data);
    } catch (error) { res.statusCode=404;res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE || undefined});
  async function open(options={}) {
    const context=await browser.newContext({viewport:{width:options.width || 390,height:options.height || 844},isMobile:(options.width || 390)<601,hasTouch:(options.width || 390)<601,timezoneId:'Asia/Shanghai'});
    const errors=[], remote=[];
    await context.route('**/*', route => {
      if (!route.request().url().startsWith(url)) {remote.push(route.request().url());return route.abort();}
      return route.continue();
    });
    const storage=options.storage || {}, writes=[];
    await context.exposeBinding('mockStorage', async (_source,kind,key,data) => {
      if(kind==='get') {if(options.mode==='read-fail') throw Error('read failed');return {data:Object.prototype.hasOwnProperty.call(storage,key)?storage[key]:null};}
      writes.push({key,data});
      if(options.mode==='write-fail') throw Error('write failed');
      if(options.mode==='write-timeout') return new Promise(()=>{});
      storage[key]=data;return {};
    });
    await context.addInitScript(({mode,legacy,safe})=>{
      const NativeDate=Date;
      window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:['2026-11-05T04:00:00Z']));}static now(){return NativeDate.parse('2026-11-05T04:00:00Z');}};
      if(legacy){Array.prototype.flatMap=undefined;Object.fromEntries=undefined;String.prototype.replaceAll=undefined;const original=window.matchMedia;window.matchMedia=q=>{const m=original.call(window,q);m.addEventListener=undefined;return m;};}
      if(mode==='none')return;
      const launch={miniToolEnv:{buildVersion:mode==='old'?9450000:9490000}};
      function wrap(kind,o) {const task=window.mockStorage(kind,o.key,o.data);if(mode==='callback'){task.then(v=>o.success(v),e=>o.fail(e));return;}return task;}
      window.xhs={launchOptions:mode==='async-launch'?undefined:launch,miniTool:{
        getLaunchOptions:()=>Promise.resolve(launch),
        getStorage:o=>wrap('get',o),setStorage:o=>wrap('set',o),
        getWindowInfo:()=>Promise.resolve({windowWidth:innerWidth,windowHeight:innerHeight,safeArea:{top:safe?24:0,left:0,right:innerWidth,bottom:innerHeight-(safe?20:0)},menuButtons:{back:null,me:null,share:safe?{top:24,bottom:58,left:innerWidth-60,right:innerWidth-16}:null}})
      }};
    },{mode:options.mode || 'promise',legacy:!!options.legacy,safe:!!options.safe});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(url+(options.baseline?'/baseline/':'/'));
    await page.waitForFunction(()=>window.ATLAS_APP,{},{timeout:15000});
    if(!options.baseline) await page.waitForFunction(()=>!document.body.classList.contains('app-loading'));
    return {page,context,errors,remote,storage,writes};
  }
  async function close(t,label){assert.deepEqual(t.errors,[],label+' browser errors');assert.deepEqual(t.remote,[],label+' external requests');results.push(label);await t.context.close();}
  async function add(page,index=0){await page.evaluate(i=>ATLAS_APP.showFlight(ATLAS_APP.visible[i].id),index);await page.click('#saveFlight');await page.click('#flightDialog .dialog-close');}
  async function snapshot(page){return page.evaluate(()=>({
    visible:ATLAS_APP.visible.map(f=>f.id),
    records:ATLAS_DATA.flights.map(f=>{const dates=ATLAS_APP.nextDates(f,120);return {id:f.id,dates,active:['2026-11-05','2026-11-09','2026-12-01','2027-01-01'].map(d=>ATLAS_APP.activeOn(f,d)),timing:dates.slice(0,3).map(d=>ATLAS_APP.timing(f,d))};})
  }));}
  try {
    const baseline=await open({baseline:true,mode:'none',width:1440,height:900});
    const expected=await snapshot(baseline.page);await baseline.context.close();
    const t=await open({mode:'async-launch',safe:true,legacy:true});
    const {page}=t;
    assert.deepEqual(await snapshot(page),expected,'Flight dates, timing and visibility preserved against base commit');
    results.push('All 2169 flight records: date/UTC/filter regression vs '+baseRef);
    await page.waitForFunction(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'))===64);
    assert.equal(await page.locator('a[href],#coverageView,#contactDialog,#appreciationDialog').count(),0);
    assert.ok(await page.locator('#appHeader').evaluate(e=>e.getBoundingClientRect().top>=64));
    assert.equal(await page.evaluate(()=>typeof window.ATLAS_GEOGRAPHY), 'undefined');
    assert.equal(await page.locator('.leaflet-tile-pane img,.region-label').count(), 0);
    assert.equal(await page.locator('.leaflet-base-pane path').count(), 13);
    assert.ok(await page.locator('.leaflet-base-pane path').evaluateAll(paths=>paths.every(p=>p.getAttribute('stroke')==='none')));
    assert.ok(await page.locator('#routeDiagramNote').isVisible());
    await page.selectOption('#phoneRegion','east');
    await page.click('#zoomIn');await page.click('#zoomOut');
    assert.equal(await page.locator('.leaflet-base-pane path').count(),13);
    assert.equal(await page.locator('.leaflet-tile-pane img').count(),0);
    await page.selectOption('#phoneRegion','all');
    await page.waitForTimeout(400);
    results.push('Russia-only 13-part basemap without border strokes; no full-country or online basemap after zoom and region changes');
    await page.screenshot({path:path.join(root,'artifacts/mobile-map.png')});
    await page.fill('#phoneSearch','Yakutsk');await page.waitForTimeout(350);
    assert.ok(await page.evaluate(()=>ATLAS_APP.visible.length>0&&ATLAS_APP.visible.length<1994));
    await page.fill('#phoneSearch','海参崴');await page.waitForTimeout(350);
    assert.ok(await page.evaluate(()=>ATLAS_APP.visible.length>0&&ATLAS_APP.visible.every(f=>f.from==='VVO'||f.to==='VVO'||(f.route||[]).includes('VVO'))));
    results.push('Supplementary Chinese place names remain searchable');
    await page.click('#phoneFilters');await page.click('#phoneResetFilters');await page.click('#phoneApplyFilters');
    assert.equal(await page.evaluate(()=>ATLAS_APP.visible.length),1994);
    await page.click('#phoneListView');await page.locator('.route-card').first().click();
    await page.screenshot({path:path.join(root,'artifacts/mobile-detail.png')});
    await page.click('#saveFlight');await page.click('#flightDialog .dialog-close');await add(page,1);
    await page.click('#tripButton');assert.equal(await page.locator('.trip-leg').count(),2);
    await page.waitForFunction(()=>document.getElementById('storageStatus').textContent.startsWith('已保存'));
    const before=await page.evaluate(()=>ATLAS_APP.trip.map(x=>x.id));
    await page.click('[data-down="0"]');assert.deepEqual(await page.evaluate(()=>ATLAS_APP.trip.map(x=>x.id)),before.slice().reverse());
    await page.click('[data-remove="1"]');assert.equal(await page.locator('.trip-leg').count(),1);
    await page.waitForFunction(()=>document.getElementById('storageStatus').textContent.startsWith('已保存'));
    const saved=await page.evaluate(()=>ATLAS_APP.trip);
    await page.reload();await page.waitForFunction(()=>window.ATLAS_APP);
    assert.deepEqual(await page.evaluate(()=>ATLAS_APP.trip),saved);
    await page.click('[data-view="flights"]');assert.equal(await page.locator('#flightTable tr').count(),50);
    await page.click('#tableMore');assert.equal(await page.locator('#flightTable tr').count(),100);
    await page.click('#tripButton');await page.click('#clearTrip');
    await page.waitForFunction(()=>document.getElementById('storageStatus').textContent.startsWith('已保存'));
    await page.reload();await page.waitForFunction(()=>window.ATLAS_APP);assert.equal(await page.evaluate(()=>ATLAS_APP.trip.length),0);
    await close(t,'Mobile search/filter/detail/trip/reorder/delete/reload/clear/pagination + Promise bridge + safe areas + absent modern APIs');
    for(const mode of ['none','old','read-fail','write-fail','write-timeout','callback']){
      const x=await open({mode});await add(x.page);await x.page.click('#tripButton');
      if(mode==='write-timeout')await x.page.waitForTimeout(3800);
      else await x.page.waitForTimeout(80);
      const status=await x.page.locator('#storageStatus').innerText();
      assert.match(status,mode==='callback'?/已保存/:mode==='read-fail'?/不覆盖|暂未读取|未读取/:mode.startsWith('write-')?/保存未完成|本次打开/:/本次打开/);
      if(['none','old','read-fail'].includes(mode))assert.equal(x.writes.length,0);
      if(mode==='write-fail'||mode==='write-timeout')assert.equal(x.writes.length,1);
      await close(x,'Storage mode '+mode);
    }
    const invalid=await open({storage:{'maoji-trip-v1':'not-json'}});assert.equal(invalid.writes.length,0);await add(invalid.page);assert.equal(invalid.writes.length,0);await close(invalid,'Corrupt cache preserved without overwrite');
    for(const width of [320,600,768,1440]){
      const x=await open({width,height:900,mode:'none'});
      assert.ok(await x.page.evaluate(()=>document.body.scrollWidth<=innerWidth+1));
      const size=await x.page.evaluate(()=>ATLAS_APP.mapSize);assert.ok(size.x>0&&size.y>0);
      if(width===1440)await x.page.screenshot({path:path.join(root,'artifacts/desktop-map.png')});
      await close(x,'Viewport '+width+'px');
    }
    const report={status:'passed',checks:results,scope:'Supplemental modern-browser regression under offline CSP with mocked platform API; not platform/device certification.'};
    fs.writeFileSync(path.join(root,'artifacts/browser-tests.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  } finally {await browser.close();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
