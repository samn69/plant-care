// The real app in headless Chrome, offline, showing a fake shared home whose data is booby-trapped:
// no trap may run code, nothing may crash, and the good plants must still show.
// Skipped when Chrome is not installed (GitHub's test machines have it).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
function findChrome() {
  for (const c of [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)) {
    try { execFileSync('which', [c], { stdio: 'ignore' }); return c; } catch (e) {}
  }
  return null;
}
const chrome = findChrome();

// Runs before the app: Firebase is replaced by a stand-in, the phone has no plants of its own.
const BEFORE = `<script>
window.firebase = { apps: [1], auth: () => ({ getRedirectResult: () => Promise.resolve(), onAuthStateChanged() {} }),
  firestore: Object.assign(() => ({ enablePersistence: () => Promise.resolve() }), { FieldValue: { arrayUnion: () => 0, arrayRemove: () => 0, delete: () => 0 } }) };
localStorage.setItem('pc_data', JSON.stringify({ v: 1, plants: [], climate: null, settings: { hemi: 'N', locAsked: true } }));
</script>`;

// Runs after the app: a home whose members' phones saved traps. Each trap that runs leaves a mark.
const ATTACK = `
window.__xss = [];
const trap = n => 'window.__xss.push(' + JSON.stringify(n) + ')';
const docs = [
  { id: 'good1', data: () => ({ sp: 'pothos', nick: 'Good pothos', log: [{ t: 'water', at: '2026-11-20T09:00:00.000Z', by: 'Sam' }], added: '2026-11-01T09:00:00.000Z' }) },
  { id: 'bad1', data: () => ({ sp: 'monstera', nick: 'Evil photo', photo: 'x" onerror="' + trap('photo') + '"', dir: '<b>', dist: 'constructor', factor: 'x' }) },
  { id: 'bad2" onmouseover="x', data: () => ({ sp: 'pothos', nick: 'Evil id' }) },
  { id: 'proto', data: () => ({ sp: '__proto__', nick: 'Evil kind' }) },
  { id: 'logbad', data: () => ({ sp: 'zz', nick: 'Evil history', log: [{ t: '<img src=x onerror="' + trap('history') + '">', at: '2026-11-20T09:00:00.000Z' }] }) }
];
const homeData = { name: 'Test home', owner: 'u', members: ['u', 'm"><img src=x onerror="' + trap('member') + '">'], invites: [], names: {},
  climate: { temp: '<img src=x onerror="' + trap('climate') + '">', hum: 30, at: new Date().toISOString() } };
const ref = { onSnapshot: cb => { cb({ exists: true, data: () => homeData }); return () => {}; },
  collection: () => ({ onSnapshot: cb => { cb({ docs }); return () => {}; }, doc: () => ({}) }) };
cloud.db = { collection: () => ({ doc: () => ref }), batch: () => ({ set() {}, update() {}, delete() {}, commit: () => Promise.resolve() }) };
cloud.user = { uid: 'u', displayName: 'Tester', email: 't@example.com' }; cloud.authKnown = true;
const errors = [];
window.addEventListener('error', e => errors.push(e.message));
const steps = [() => enterHome('h'), () => { tab = 'today'; render(); }, () => { tab = 'plants'; render(); }, () => openPlant('bad1'),
  () => { closePage('plantPage'); openPlant('logbad'); }, () => { closePage('plantPage'); tab = 'settings'; render(); }, () => openHomePage()];
let i = 0;
(function next() {
  if (i < steps.length) { try { steps[i++](); } catch (e) { errors.push('step ' + i + ': ' + e.message); } setTimeout(next, 300); return; }
  document.title = 'RESULT ' + JSON.stringify({ traps: window.__xss, plants: D.plants.map(p => p.nick), climate: D.climate, errors,
    homePage: document.getElementById('homeBody').innerHTML.includes('Someone (you)') });
})();`;

test('booby-trapped shared data runs no code and crashes nothing (headless Chrome)', { skip: !chrome && 'Chrome is not installed', timeout: 120000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plant-care-test-'));
  try {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(html.includes("<script>\n'use strict';"), 'the app script starts as expected');
    fs.writeFileSync(path.join(dir, 'index.html'), html.replace("<script>\n'use strict';", BEFORE + "\n<script>\n'use strict';").replace('</body>', '<script src="attack.js"></script>\n</body>'));
    fs.writeFileSync(path.join(dir, 'attack.js'), ATTACK);
    for (const f of ['icon-192.png', 'apple-touch-icon.png', 'manifest.webmanifest']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND', '--virtual-time-budget=6000',
      '--user-data-dir=' + path.join(dir, 'profile'), '--dump-dom', 'file://' + path.join(dir, 'index.html')], { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = dom.match(/<title>RESULT ([^<]*)<\/title>/);
    assert.ok(m, 'the page finished');
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    assert.deepEqual(r.traps, [], 'no trap ran code');
    assert.deepEqual(r.errors, [], 'nothing crashed');
    assert.deepEqual(r.plants, ['Good pothos', 'Evil photo', 'Evil history']);
    assert.equal(r.climate, null);
    assert.equal(r.homePage, true, 'the home page shows its people');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
