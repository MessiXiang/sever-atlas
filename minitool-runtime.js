'use strict';
(() => {
  const keys = {trip: 'maoji-trip-v1', layout: 'maoji-layout-v1'};
  const state = {trip: [], layout: {}};
  let api = null, version = 0, canSave = false, failedRead = false, failedWrite = false;
  let queue = Promise.resolve(), revision = 0, resizeTimer;
  function status(message) {
    const node = document.getElementById('storageStatus');
    if (node) node.textContent = message;
  }
  function call(name, options) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn, result) => { if (!done) { done = true; clearTimeout(timer); fn(result); } };
      const timer = setTimeout(() => finish(reject, new Error('平台响应超时')), 3500);
      try {
        const result = api[name](Object.assign({}, options || {}, {
          success: result => finish(resolve, result),
          fail: error => finish(reject, error)
        }));
        if (result && typeof result.then === 'function') result.then(value => finish(resolve, value), error => finish(reject, error));
      } catch (error) { finish(reject, error); }
    });
  }
  async function load() {
    const xhs = window.xhs;
    api = xhs && xhs.miniTool;
    let launch = xhs && xhs.launchOptions;
    if (!(launch && launch.miniToolEnv && launch.miniToolEnv.buildVersion) && api && typeof api.getLaunchOptions === 'function') {
      try { launch = await call('getLaunchOptions'); } catch (error) { launch = null; }
    }
    version = Math.floor(Number(launch && launch.miniToolEnv && launch.miniToolEnv.buildVersion || 0) / 1000);
    canSave = !!(version >= 9460 && api && typeof api.getStorage === 'function' && typeof api.setStorage === 'function');
    if (!canSave) { status('当前环境仅保留本次打开期间的行程；关闭后不会保存。'); return state; }
    try {
      const values = await Promise.all([call('getStorage', {key: keys.trip}), call('getStorage', {key: keys.layout})]);
      const trip = values[0].data == null || values[0].data === '' ? [] : JSON.parse(values[0].data);
      const layout = values[1].data == null || values[1].data === '' ? {} : JSON.parse(values[1].data);
      if (!Array.isArray(trip) || !layout || typeof layout !== 'object' || Array.isArray(layout)) throw new Error('保存数据格式不正确');
      state.trip = trip;
      state.layout = layout;
      status('行程保存在此小工具的本地缓存中，清理缓存或卸载后可能丢失。');
    } catch (error) {
      failedRead = true; canSave = false;
      status('暂未读取到已保存行程。本次修改仅在当前页面保留，请重新打开后再试。');
    }
    return state;
  }
  function save(field, value) {
    const serialized = JSON.stringify(value);
    if (JSON.stringify(state[field]) === serialized) return queue;
    state[field] = JSON.parse(serialized);
    if (!canSave) {
      status(failedWrite ? '保存未完成。本次修改仍在页面中，关闭后可能丢失。' : failedRead ? '未读取到原有行程，本次修改暂不覆盖原缓存。' : '当前环境仅保留本次打开期间的行程；关闭后不会保存。');
      return queue;
    }
    const ownRevision = ++revision;
    status('正在保存…');
    queue = queue.then(async () => {
      if (!canSave) return;
      try {
        await call('setStorage', {key: keys[field], data: serialized});
        if (ownRevision === revision) status('已保存至小工具本地缓存；清理缓存或卸载后可能丢失。');
      } catch (error) {
        canSave = false; failedWrite = true;
        status('保存未完成。本次修改仍在页面中，关闭后可能丢失。');
      }
    });
    return queue;
  }
  async function refreshWindow() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    if (version < 9490 || !api || typeof api.getWindowInfo !== 'function') return;
    try {
      const info = await call('getWindowInfo');
      const rect = info.safeArea || {}, buttons = info.menuButtons || {};
      let top = Number(rect.top) || 0;
      Object.keys(buttons).forEach(key => {
        const box = buttons[key];
        if (box && box.top >= 0 && Number.isFinite(box.bottom)) top = Math.max(top, box.bottom + 6);
      });
      const values = {
        top,
        left: Math.max(0, Number(rect.left) || 0),
        right: Math.max(0, Number(info.windowWidth) - Number(rect.right) || 0),
        bottom: Math.max(0, Number(info.windowHeight) - Number(rect.bottom) || 0)
      };
      Object.keys(values).forEach(side => document.documentElement.style.setProperty('--safe-area-inset-' + side, values[side] + 'px'));
      window.dispatchEvent(new Event('atlas-window-change'));
    } catch (error) { /* Keep container-injected variables and CSS fallback. */ }
  }
  function listenMedia(query, listener) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', listener);
    else if (typeof query.addListener === 'function') query.addListener(listener);
  }
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refreshWindow, 180); });
  window.ATLAS_RUNTIME = {load, saveTrip: value => save('trip', value), saveLayout: value => save('layout', value), refreshWindow, listenMedia};
})();
