// The daily reminder job (scripts/send-reminders.js), with a fake database and fake phones.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { run, mistDueOn, localParts } = require('../scripts/send-reminders.js');

// users: { uid: user doc }. homes: [{ name, members, plants: [plant doc] }]
function setup({ users, homes = [], gone = [] }) {
  const sent = [], updates = {};
  const db = { collection(name) {
    if (name === 'users') return { get: async () => ({ size: Object.keys(users).length, docs: Object.entries(users).map(([id, d]) => ({ id, data: () => d, ref: { update: async u => { updates[id] = u; } } })) }) };
    return { where: (field, op, uid) => ({ get: async () => ({ docs: homes.filter(h => h.members.includes(uid)).map((h, i) => ({ id: 'h' + i, data: () => ({ name: h.name, members: h.members }),
      ref: { collection: () => ({ get: async () => ({ docs: h.plants.map((p, j) => ({ id: 'p' + j, data: () => p })) }) }) } })) }) }) };
  } };
  const sendPush = async (sub, payload) => { if (gone.includes(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 }); sent.push({ to: sub.endpoint, msg: JSON.parse(payload) }); };
  const go = async iso => { sent.length = 0; for (const k of Object.keys(updates)) delete updates[k];
    const stats = await run({ db, sendPush, now: new Date(iso), log: () => {}, FieldValue: { arrayRemove: (...a) => ({ arrayRemove: a }) } }); return { stats, sent, updates }; };
  return go;
}
const user = (notify = {}, subs = [{ endpoint: 'phone1' }]) => ({ notify: Object.assign({ on: true, time: '09:00', tz: 'Europe/Berlin' }, notify), subs });
const due = (name, d) => ({ due: Object.assign({ water: null, feed: null, mist: null, mistUntil: null, name }, d) });

test('sends one message at the reminder time with what is due', async () => {
  const go = setup({ users: { u: user() }, homes: [{ name: 'Home', members: ['u'], plants: [
    due('Monstera', { water: '2026-11-27' }), due('Pilea', { water: '2026-11-25', feed: '2026-11-27' }),
    due('Ellie', { water: '2026-12-01', mist: '2026-11-27', mistUntil: '2026-12-01' }), due('Cactus', { water: '2026-12-20' })] }] });
  const { sent, updates } = await go('2026-11-27T08:05:00Z'); // 09:05 in Berlin
  assert.equal(sent.length, 1);
  assert.equal(sent[0].msg.title, '🌿 Your plants today');
  assert.equal(sent[0].msg.body, '💧 Water: Monstera, Pilea · 🧪 Feed: Pilea · 💦 Mist: Ellie');
  assert.equal(updates.u['notify.lastSent'], '2026-11-27');
  assert.equal(updates.u['notify.sentOn'], '2026-11-27');
});

test('nothing before the reminder time, and only once a day', async () => {
  const plants = [due('Monstera', { water: '2026-11-27' })];
  let go = setup({ users: { u: user() }, homes: [{ name: 'Home', members: ['u'], plants }] });
  let r = await go('2026-11-27T07:55:00Z'); // 08:55 in Berlin
  assert.equal(r.sent.length, 0); assert.equal(r.stats.early, 1);
  go = setup({ users: { u: user({ lastSent: '2026-11-27' }) }, homes: [{ name: 'Home', members: ['u'], plants }] });
  r = await go('2026-11-27T15:00:00Z');
  assert.equal(r.sent.length, 0); assert.equal(r.stats.doneToday, 1);
});

test('uses each person\'s own time zone', async () => {
  const go = setup({ users: { u: user({ tz: 'America/New_York' }) }, homes: [{ name: 'Home', members: ['u'], plants: [due('Monstera', { water: '2026-11-27' })] }] });
  assert.equal((await go('2026-11-27T13:30:00Z')).sent.length, 0); // 08:30 in New York
  assert.equal((await go('2026-11-27T14:30:00Z')).sent.length, 1); // 09:30 in New York
  assert.deepEqual(localParts(new Date('2026-11-27T23:30:00Z'), 'Europe/Berlin'), { date: '2026-11-28', time: '00:30' });
});

test('no message on a day with nothing to do (but the day counts as done)', async () => {
  const go = setup({ users: { u: user() }, homes: [{ name: 'Home', members: ['u'], plants: [due('Cactus', { water: '2026-12-20' })] }] });
  const { sent, updates } = await go('2026-11-27T10:00:00Z');
  assert.equal(sent.length, 0);
  assert.equal(updates.u['notify.lastSent'], '2026-11-27');
  assert.equal(updates.u['notify.sentOn'], undefined);
});

test('notifications turned off, or no phone: nothing is sent', async () => {
  const plants = [due('Monstera', { water: '2026-11-27' })];
  const go = setup({ users: { off: user({ on: false }), nophone: user({}, []) }, homes: [{ name: 'Home', members: ['off', 'nophone'], plants }] });
  const { sent, stats } = await go('2026-11-27T10:00:00Z');
  assert.equal(sent.length, 0); assert.equal(stats.off, 1); assert.equal(stats.noPhone, 1);
});

test('every phone gets it; a phone that is gone is removed', async () => {
  const go = setup({ users: { u: user({}, [{ endpoint: 'phone1' }, { endpoint: 'old-phone' }]) }, gone: ['old-phone'],
    homes: [{ name: 'Home', members: ['u'], plants: [due('Monstera', { water: '2026-11-27' })] }] });
  const { sent, updates, stats } = await go('2026-11-27T10:00:00Z');
  assert.deepEqual(sent.map(s => s.to), ['phone1']);
  assert.deepEqual(updates.u.subs, { arrayRemove: [{ endpoint: 'old-phone' }] });
  assert.equal(stats.removed, 1);
});

test('someone in two homes gets the home names', async () => {
  const go = setup({ users: { u: user() }, homes: [
    { name: 'Flat', members: ['u'], plants: [due('Monstera', { water: '2026-11-27' })] },
    { name: 'Office', members: ['u'], plants: [due('ZZ', { feed: '2026-11-26' })] }] });
  assert.equal((await go('2026-11-27T10:00:00Z')).sent[0].msg.body, 'Flat: 💧 Water: Monstera\nOffice: 🧪 Feed: ZZ');
});

test('no "Mist" in the message when it was misted today, or the room reading is too old', async () => {
  const go = setup({ users: { u: user() }, homes: [{ name: 'Home', members: ['u'], plants: [due('Monstera', { water: '2026-11-27' }),
    due('Misted today', { mist: '2026-11-28', mistUntil: '2026-12-04' }), due('Old reading', { mist: '2026-11-10', mistUntil: '2026-11-17' })] }] });
  assert.equal((await go('2026-11-27T10:00:00Z')).sent[0].msg.body, '💧 Water: Monstera');
});

test('misting: from the day after the last misting until the room reading is too old', () => {
  const d = { mist: '2026-11-28', mistUntil: '2026-12-04' };
  assert.equal(mistDueOn(d, '2026-11-27'), false);
  assert.equal(mistDueOn(d, '2026-11-28'), true);
  assert.equal(mistDueOn(d, '2026-12-04'), true);
  assert.equal(mistDueOn(d, '2026-12-05'), false);
  assert.equal(mistDueOn({ mist: null }, '2026-12-05'), false);
  // saved by an older app version
  assert.equal(mistDueOn({ mist: true }, '2026-12-05'), true);
  assert.equal(mistDueOn({ mist: false }, '2026-12-05'), false);
});
