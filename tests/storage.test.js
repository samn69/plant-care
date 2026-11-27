// Asking the browser to keep the plants on this phone (navigator.storage.persist), and what Settings says.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, plant } = require('./helpers/app');

// a browser whose answers we choose; counts how often the app asked
function browser({ kept = false, grants = true } = {}) {
  const b = { asked: 0, storage: { persisted: async () => kept, persist: async () => { b.asked++; kept = grants; return grants; } } };
  return b;
}
const withPlants = { pc_data: JSON.stringify({ v: 1, plants: [plant('pothos', { watered: '2026-11-20' })], climate: null, settings: { hemi: 'N', locAsked: true } }) };
const settled = () => new Promise(r => setImmediate(r));
async function settingsBackup(app) { await settled(); app.app.tab = 'settings'; app.render(); return app.el('tab-settings').innerHTML; }

test('with plants on this phone, the app asks once and Settings says they are kept', async () => {
  const b = browser({ grants: true });
  const app = loadApp({ storage: withPlants, navigator: { storage: b.storage } });
  assert.match(await settingsBackup(app), /the browser keeps them/);
  assert.equal(b.asked, 1);
});

test('already kept: the app does not ask again', async () => {
  const b = browser({ kept: true });
  const app = loadApp({ storage: withPlants, navigator: { storage: b.storage } });
  assert.match(await settingsBackup(app), /the browser keeps them/);
  assert.equal(b.asked, 0);
});

test('the browser says no: Settings warns and suggests a backup', async () => {
  const b = browser({ grants: false });
  const app = loadApp({ storage: withPlants, navigator: { storage: b.storage } });
  const html = await settingsBackup(app);
  assert.match(html, /may clear them when space runs low/);
  assert.match(html, /Save a backup file/);
});

test('no plants on this phone yet: no question; asked when the first plant is added', async () => {
  const b = browser({ grants: true });
  const app = loadApp({ navigator: { storage: b.storage } });
  await settled();
  assert.equal(b.asked, 0);
  app.app.draft = { sp: 'monstera', nick: '', room: '', photo: null, last: '', dir: null, dist: 'near' };
  app.saveDraft();
  assert.match(await settingsBackup(app), /the browser keeps them/);
  assert.equal(b.asked, 1);
});

test('a browser without this feature: the usual text, nothing breaks', async () => {
  const app = loadApp({ storage: withPlants });
  assert.match(await settingsBackup(app), /Your plants are saved on this phone. Save a backup file now and then./);
});
