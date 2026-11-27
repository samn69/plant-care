// The care logic in index.html: watering, learning, feeding, misting, holidays.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp, plant } = require('./helpers/app');

// next watering / feeding as 'YYYY-MM-DD' and in how many days
function water(app, p) { const w = app.waterStatus(p); return { next: app.isoDay(w.next), due: w.due, days: w.days }; }
function feed(app, p) { const f = app.feedStatus(p); return f.days ? { next: app.isoDay(f.next), due: f.due } : 'none this season'; }

test('watering follows the season', () => {
  const app = loadApp({ today: '2027-01-10' });
  const p = plant('pothos', { watered: '2027-01-01' });
  assert.deepEqual(water(app, p), { next: '2027-01-17', due: 7, days: 16 }); // winter: every 16 days
  app.setToday('2027-07-10');
  const q = plant('pothos', { watered: '2027-07-05' });
  assert.deepEqual(water(app, q), { next: '2027-07-12', due: 2, days: 7 }); // summer: every 7 days
});

test('a plant never watered is due today', () => {
  const app = loadApp({ today: '2027-01-10' });
  const w = app.waterStatus(plant('monstera'));
  assert.equal(w.due, 0); assert.equal(w.never, true);
});

test('a sunny windowsill and a warm room dry the soil faster', () => {
  const app = loadApp({ today: '2027-01-10' });
  assert.equal(water(app, plant('pothos', { watered: '2027-01-01', dir: 180, dist: 'sill' })).days, 14); // 16 × 0.85
  app.app.D.climate = { temp: 26, hum: 50, at: '2027-01-09T18:00:00.000Z' };
  assert.equal(water(app, plant('pothos', { watered: '2027-01-01' })).days, 14); // warm room: 16 × 0.85
  app.app.D.climate.at = '2026-12-20T18:00:00.000Z'; // a reading older than 7 days is not used
  assert.equal(water(app, plant('pothos', { watered: '2027-01-01' })).days, 16);
});

test('watering 2+ days early teaches the app that this plant dries sooner', () => {
  const app = loadApp({ today: '2027-01-10' });
  const p = plant('pothos', { watered: '2027-01-01' }); app.app.D.plants = [p]; // due on 17 Jan
  app.act(p, 'water');
  assert.equal(p.factor, 0.93);
  assert.equal(water(app, p).days, 15); // 16 × 0.93
});

test('watering on the day it is due does not change what the app learned', () => {
  const app = loadApp({ today: '2027-01-17' });
  const p = plant('pothos', { watered: '2027-01-01' }); app.app.D.plants = [p];
  app.act(p, 'water');
  assert.equal(p.factor, 1);
});

test('"Still wet" checks again in 3 days and learns the soil stays wet longer', () => {
  const app = loadApp({ today: '2027-01-17' });
  const p = plant('pothos', { watered: '2027-01-01' }); app.app.D.plants = [p];
  app.snoozeWater(p);
  assert.equal(p.factor, 1.1);
  assert.equal(water(app, p).next, '2027-01-20');
});

test('"Still wet" on a plant never watered: checks again in 3 days, learns nothing', () => {
  const app = loadApp({ today: '2027-01-17' });
  const p = plant('pothos'); app.app.D.plants = [p];
  app.snoozeWater(p);
  assert.equal(p.factor, 1);
  assert.equal(water(app, p).next, '2027-01-20');
});

test('no feeding in winter', () => {
  const app = loadApp({ today: '2027-01-15' });
  assert.equal(feed(app, plant('ficus', { fed: '2026-08-20' })), 'none this season');
});

test('after winter, feeding is due on the first day of spring, not months late', () => {
  const app = loadApp({ today: '2027-03-01' });
  assert.deepEqual(feed(app, plant('ficus', { fed: '2026-08-20' })), { next: '2027-03-01', due: 0 });
  assert.deepEqual(feed(app, plant('ficus', { added: '2026-11-20T09:00:00.000Z' })), { next: '2027-03-01', due: 0 });
  app.setToday('2027-03-06');
  assert.deepEqual(feed(app, plant('ficus', { fed: '2026-08-20' })), { next: '2027-03-01', due: -5 });
});

test('during the feeding season, late is still late', () => {
  const app = loadApp({ today: '2027-06-10' });
  assert.deepEqual(feed(app, plant('ficus', { fed: '2027-05-01' })), { next: '2027-05-22', due: -19 }); // summer: every 21 days
  app.setToday('2027-03-20');
  assert.deepEqual(feed(app, plant('ficus', { fed: '2027-03-10' })), { next: '2027-04-07', due: 18 });
});

test('southern hemisphere: spring feeding starts on 1 September', () => {
  const app = loadApp({ today: '2027-09-01' });
  app.app.D.settings.loc = { lat: -33.87, lon: 151.21, name: 'Sydney' };
  assert.deepEqual(feed(app, plant('ficus', { fed: '2027-02-20' })), { next: '2027-09-01', due: 0 });
});

test('misting: only for plants that like humid air, while the air is dry', () => {
  const app = loadApp({ today: '2026-11-27' });
  const elephant = plant('alocasia'), snake = plant('sansevieria');
  assert.equal(app.needsMist(elephant), false); // no humidity reading yet
  app.app.D.climate = { temp: 21, hum: 30, at: '2026-11-27T08:00:00.000Z' };
  assert.equal(app.needsMist(elephant), true);
  assert.equal(app.needsMist(snake), false);
  app.app.D.climate.hum = 70;
  assert.equal(app.needsMist(elephant), false);
});

test('misting is saved as dates for the reminder job', () => {
  const app = loadApp({ today: '2026-11-27' });
  app.app.D.climate = { temp: 21, hum: 30, at: '2026-11-27T08:00:00.000Z' };
  const p = plant('alocasia');
  assert.deepEqual([app.computeDue(p).mist, app.computeDue(p).mistUntil], ['2026-11-27', '2026-12-04']);
  p.log.push({ t: 'mist', at: '2026-11-27T09:30:00.000Z' }); // misted today: next tomorrow
  assert.equal(app.computeDue(p).mist, '2026-11-28');
  assert.equal(app.needsMist(p), false);
  app.setToday('2026-11-28');
  assert.equal(app.needsMist(p), true);
});

test('holiday plan: which plants last, and which need someone', () => {
  const app = loadApp({ today: '2027-07-01' });
  const plan = (p, from, to) => {
    app.app.D.settings.holiday = { from, to };
    const r = app.holidayPlan(p, app.holiday());
    return { kind: r.kind, water: r.water ? app.isoDay(r.water) : null, help: r.help ? app.isoDay(r.help) : null };
  };
  // pothos waters every 7 days in summer
  assert.deepEqual(plan(plant('pothos', { watered: '2027-06-26' }), '2027-07-05', '2027-07-09'), { kind: 'ok', water: '2027-07-03', help: null });
  assert.deepEqual(plan(plant('pothos', { watered: '2027-06-26' }), '2027-07-05', '2027-07-20'), { kind: 'help', water: '2027-07-05', help: '2027-07-12' });
  // a snake plant watered just before: no extra watering, someone around its usual day
  assert.deepEqual(plan(plant('sansevieria', { watered: '2027-06-30' }), '2027-07-05', '2027-07-20'), { kind: 'help', water: null, help: '2027-07-14' });
  // next watering after we are back: no change
  assert.equal(plan(plant('zz', { watered: '2027-06-30' }), '2027-07-05', '2027-07-10').kind, 'after');
});

test('every plant in the care guide shows its page and the lists without errors', () => {
  const app = loadApp({ today: '2027-04-15' });
  app.app.D.climate = { temp: 19, hum: 32, at: '2027-04-14T18:00:00.000Z' };
  app.app.D.plants = Object.keys(app.app.LIB).map(k => plant(k, { watered: '2027-04-01', dir: 90, common: app.app.LIB[k].generic ? 'Mystery plant' : undefined }));
  for (const p of app.app.D.plants) {
    app.openPlant(p.id);
    assert.match(app.el('plantPageBody').innerHTML, /Through the year/, p.sp);
  }
  for (const t of ['today', 'plants', 'settings']) { app.app.tab = t; app.render(); }
  assert.match(app.el('tab-settings').innerHTML, /Backup/);
  app.app.tab = 'today'; app.render();
  assert.match(app.el('tab-today').innerHTML, /Still wet/);
});
