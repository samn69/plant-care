// Loads the app's own script from index.html into Node with a small stand-in for the page, so tests can
// call its functions directly and read the HTML it writes. The app code is the real one, unchanged.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const INDEX = path.join(__dirname, '..', '..', 'index.html');

function classes() {
  const s = new Set();
  return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), contains: c => s.has(c),
    toggle: (c, on) => { on = on === undefined ? !s.has(c) : !!on; if (on) s.add(c); else s.delete(c); return on; } };
}
// An element that remembers what is written to it; any method the app calls on it does nothing.
function fakeElement(id) {
  const o = { id, innerHTML: '', textContent: '', value: '', dataset: {}, style: {}, classList: classes(), files: [], isConnected: true };
  return new Proxy(o, { get: (t, k) => k in t ? t[k] : typeof k === 'symbol' ? undefined : () => fakeElement(), set: (t, k, v) => { t[k] = v; return true; } });
}

// today: 'YYYY-MM-DD' (the app thinks it is 10:00 that day). storage: localStorage contents. navigator: extra phone features.
function loadApp({ today = '2026-11-27', storage = {}, navigator = {} } = {}) {
  const html = fs.readFileSync(INDEX, 'utf8');
  const code = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  const els = new Map(); const byId = id => { if (!els.has(id)) els.set(id, fakeElement(id)); return els.get(id); };
  const store = Object.assign({}, storage);
  const ctx = {
    document: { getElementById: byId, querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, createElement: () => fakeElement(), head: fakeElement(), body: fakeElement(), activeElement: null, hidden: false },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    navigator, location: { protocol: 'file:', origin: 'file://', pathname: '/index.html' },
    setTimeout: () => 0, clearTimeout() {}, fetch: () => Promise.reject(new Error('offline in tests')),
    console, URL, TextEncoder, Intl, Date, Math, JSON, Promise
  };
  ctx.window = ctx; ctx.self = ctx; ctx.__NOW = today + 'T10:00:00';
  vm.createContext(ctx);
  vm.runInContext(code + '\n;globalThis.app = { get D() { return D; }, get LIB() { return LIB; }, get cloud() { return cloud; }, get tab() { return tab; }, set tab(v) { tab = v; } };', ctx, { filename: 'index.html' });
  ctx.setToday = d => { ctx.__NOW = d + 'T10:00:00'; };
  ctx.el = byId; ctx.storage = store;
  return ctx;
}

// Objects made inside the app come from another JavaScript "realm": compare them as plain JSON.
const plain = x => JSON.parse(JSON.stringify(x));

// A plant as the app stores it. watered / fed / misted: 'YYYY-MM-DD' (or a list of them).
function plant(sp, { id = sp, watered, fed, misted, ...rest } = {}) {
  const log = [];
  const add = (t, d) => [].concat(d || []).forEach(day => log.push({ t, at: day + 'T09:00:00.000Z' }));
  add('water', watered); add('feed', fed); add('mist', misted);
  return Object.assign({ id, sp, nick: '', room: '', photo: null, dir: null, dist: 'near', factor: 1, added: '2026-01-01T09:00:00.000Z', log, snooze: null }, rest);
}

// Just enough of Firestore for the app's syncToCloud: records every write instead of sending it.
function fakeHome(app, homeId = 'home1') {
  const writes = [];
  const ref = p => ({ path: p, collection: n => ({ doc: id => ref(p + '/' + n + '/' + id) }) });
  app.firebase = { firestore: { FieldValue: { arrayUnion: (...a) => ({ arrayUnion: a }), arrayRemove: (...a) => ({ arrayRemove: a }), delete: () => ({ delete: true }) } } };
  Object.assign(app.app.cloud, { user: { uid: 'me', displayName: 'Sam Tester', email: 'sam@example.com' }, homeId, authKnown: true, loading: false,
    db: { collection: () => ({ doc: id => ref('homes/' + id) }),
      batch: () => ({ set: r => writes.push('set ' + r.path), update: (r, ch) => writes.push('update ' + r.path + ' ' + Object.keys(ch).join(',')), delete: r => writes.push('delete ' + r.path), commit: () => Promise.resolve() }) } });
  // the home's plants as they are online right now
  app.setOnline = plants => {
    app.app.D.plants = plants.map(p => app.norm(plain(p)));
    for (const p of app.app.D.plants) p.due = app.computeDue(p); // as the app last saved them
    app.app.cloud.synced = {}; for (const p of app.app.D.plants) app.app.cloud.synced[p.id] = JSON.stringify(app.norm(p));
    app.app.cloud.climateJson = JSON.stringify(app.app.D.climate || null);
  };
  return writes;
}

module.exports = { loadApp, plain, plant, fakeHome };
