// Data that comes from other phones (shared homes) and backup files: checked before it is shown,
// and restoring a backup in a shared home never deletes anything.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, plain, plant, fakeHome } = require('./helpers/app');

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U';

test('normal plants pass the checks unchanged (so nothing is rewritten online)', () => {
  const app = loadApp();
  const normal = [
    plant('monstera', { id: 'mf3k2a1x9q', nick: 'Big one', room: 'Living room', photo: PHOTO, dir: 135, dist: 'sill', factor: 0.93,
      due: { water: '2026-11-30', feed: null, mist: null, mistUntil: null, name: 'Big one' },
      log: [{ t: 'mist', at: '2026-11-21T08:00:00.000Z' }, { t: 'water', at: '2026-11-22T08:00:00.000Z', by: 'Sam' }] }),
    plant('leafy', { id: 'mf3k2b7zz1', common: 'Boston fern', latin: 'Nephrolepis exaltata', snooze: { set: '2026-11-25T08:00:00.000Z', until: '2026-11-28T00:00:00.000Z' } }),
    plant('cactus', { id: 'old1', photo: 'data:image/png;base64,iVBORw0KGgo=', dir: 0, dist: 'far', factor: 1.21, fed: '2026-11-02' })
  ];
  for (const p of normal) {
    assert.ok(app.validPlant(p), p.id);
    const n = plain(app.norm(plain(p)));
    for (const k of ['id', 'sp', 'nick', 'room', 'photo', 'dir', 'dist', 'factor', 'added', 'snooze', 'common', 'latin', 'due']) assert.deepEqual(n[k], plain(p)[k], p.id + ' ' + k);
    assert.deepEqual(n.log, plain(p).log.sort((a, b) => a.at.localeCompare(b.at)));
    assert.equal(JSON.stringify(app.norm(n)), JSON.stringify(n), 'checking twice changes nothing');
  }
  const c = { temp: 21.5, hum: 38, at: '2026-11-26T18:00:00.000Z' };
  assert.deepEqual(plain(app.cleanClimate(c)), c);
});

test('plants with an id or kind the app never makes are refused', () => {
  const app = loadApp();
  for (const id of ['a" onclick="x', '', 'x'.repeat(41), 42, 'a/b']) assert.equal(app.validPlant(plant('pothos', { id })), false, String(id));
  for (const sp of ['__proto__', 'constructor', 'toString', 'rose', undefined]) assert.equal(app.validPlant(plant(sp, { id: 'ok' })), false, String(sp));
});

test('booby-trapped fields are dropped, the rest of the plant is kept', () => {
  const app = loadApp();
  const n = plain(app.norm(plant('monstera', { id: 'bad1', nick: 'Evil', photo: 'x" onerror="alert(1)', dir: '<b>', dist: 'constructor', factor: 'x', added: '<img>',
    snooze: { set: '<b>', until: 1 }, log: [{ t: '<img src=x onerror=alert(1)>', at: '2026-11-20T09:00:00.000Z' }, { t: 'water', at: '"><img>' }, { t: 'feed', at: '2026-11-21T09:00:00.000Z', by: 42 }] })));
  assert.equal(n.nick, 'Evil');
  assert.equal(n.photo, null); assert.equal(n.dir, null); assert.equal(n.dist, 'near'); assert.equal(n.factor, 1); assert.equal(n.snooze, null);
  assert.ok(!isNaN(Date.parse(n.added)));
  assert.deepEqual(n.log, [{ t: 'feed', at: '2026-11-21T09:00:00.000Z' }]);
  for (const c of [{ temp: '<img>', hum: 30, at: '2026-11-27T08:00:00.000Z' }, { temp: 20, hum: 30, at: 'yesterday' }, 'hot', null]) assert.equal(app.cleanClimate(c), null);
});

test('restoring a backup on this phone replaces its plants', () => {
  const app = loadApp();
  app.app.D.plants = [plant('pothos', { id: 'newer' })];
  app.restoreBackup({ plants: [plant('zz', { id: 'a' }), plant('cactus', { id: 'b' })], climate: { temp: 18, hum: 40, at: '2026-11-01T09:00:00.000Z' } });
  assert.deepEqual(app.app.D.plants.map(p => p.id), ['a', 'b']);
  assert.equal(app.app.D.climate.temp, 18);
});

test('restoring a backup in a shared home only adds missing plants and deletes nothing', () => {
  const app = loadApp(); const writes = fakeHome(app);
  app.app.D.climate = { temp: 22, hum: 50, at: '2026-11-26T09:00:00.000Z' };
  app.setOnline([plant('pothos', { id: 'a', nick: 'In the home' }), plant('zz', { id: 'partners' })]);
  app.restoreBackup({ plants: [plant('pothos', { id: 'a', nick: 'Old copy' }), plant('cactus', { id: 'deleted-since' })], climate: { temp: 15, hum: 20, at: '2026-01-01T09:00:00.000Z' } });
  assert.deepEqual(app.app.D.plants.map(p => p.id), ['a', 'partners', 'deleted-since']);
  assert.equal(app.app.D.plants[0].nick, 'In the home');
  assert.equal(app.app.D.climate.temp, 22);
  assert.deepEqual(writes, ['set homes/home1/plants/deleted-since']);
});

test('restoring a backup with nothing new in a shared home writes nothing', () => {
  const app = loadApp(); const writes = fakeHome(app);
  app.setOnline([plant('pothos', { id: 'a' })]);
  app.restoreBackup({ plants: [plant('pothos', { id: 'a' })] });
  assert.deepEqual(writes, []);
});

test('ticking off a plant in a shared home sends only the new history entry', () => {
  const app = loadApp({ today: '2027-01-17' }); const writes = fakeHome(app);
  app.setOnline([plant('pothos', { id: 'a', watered: '2027-01-01' }), plant('zz', { id: 'b', watered: '2027-01-01' })]);
  app.act(app.findPlant('a'), 'water');
  assert.deepEqual(writes, ['update homes/home1/plants/a due', 'update homes/home1/plants/a log']);
  assert.equal(app.findPlant('a').log.at(-1).by, 'Sam');
});
