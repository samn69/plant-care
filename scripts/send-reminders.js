// Sends each person their daily plant reminder (run by .github/workflows/reminders.yml every 15 minutes).
// For everyone with notifications on: once their reminder time has passed today (in their own time zone),
// collect the plants in their homes whose stored due dates (written by the app) have come, and push one
// notification to each of their phones. Nothing is sent on days with nothing to do.
'use strict';

const VAPID_PUBLIC = 'BEA1ZxKSrqJegIl2Wi4S0aDf0EPT_-xkdd70zDuRdJBqLcpvublaJJqIC3z-U9ffdaSHrbeN9PvVW9qR_3dm-PM';
const APP_URL = 'https://samn69.github.io/plant-care/';

function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { date: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
}
function validTz(tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } }

function message(groups) {
  // groups: [{ home, water: [], feed: [], mist: [] }]
  const lines = []; let count = 0;
  for (const g of groups) {
    const parts = [];
    if (g.water.length) parts.push('💧 Water: ' + g.water.join(', '));
    if (g.feed.length) parts.push('🧪 Feed: ' + g.feed.join(', '));
    if (g.mist.length) parts.push('💦 Mist: ' + g.mist.join(', '));
    if (!parts.length) continue;
    count += g.water.length + g.feed.length + g.mist.length;
    lines.push((groups.length > 1 ? g.home + ': ' : '') + parts.join(' · '));
  }
  if (!lines.length) return null;
  return { title: '🌿 Your plants today', body: lines.join('\n'), tag: 'plants', url: APP_URL, count };
}

async function run({ db, sendPush, now = new Date(), log = console.log, FieldValue }) {
  const users = await db.collection('users').get();
  const stats = { users: users.size, due: 0, sent: 0, removed: 0, skipped: 0, noPhone: 0, off: 0, early: 0, doneToday: 0 };
  for (const u of users.docs) {
    const d = u.data() || {}; const n = d.notify || {}; const subs = Array.isArray(d.subs) ? d.subs : [];
    if (!subs.length) { stats.skipped++; stats.noPhone++; continue; }
    if (n.on === false) { stats.skipped++; stats.off++; continue; }
    const tz = validTz(n.tz) ? n.tz : 'Europe/Berlin';
    const { date, time } = localParts(now, tz);
    if (time < (n.time || '09:00')) { stats.skipped++; stats.early++; continue; }
    if (n.lastSent === date) { stats.skipped++; stats.doneToday++; continue; }
    stats.due++;
    const homes = await db.collection('homes').where('members', 'array-contains', u.id).get();
    const groups = [];
    for (const h of homes.docs) {
      const g = { home: (h.data() || {}).name || 'Home', water: [], feed: [], mist: [] };
      const plants = await h.ref.collection('plants').get();
      for (const p of plants.docs) {
        const x = p.data() || {}; const due = x.due || {}; const name = due.name || x.nick || 'A plant';
        if (due.water && due.water <= date) g.water.push(name);
        if (due.feed && due.feed <= date) g.feed.push(name);
        if (due.mist) g.mist.push(name);
      }
      groups.push(g);
    }
    const msg = message(groups);
    const gone = []; const sentBefore = stats.sent;
    if (msg) {
      for (const s of subs) {
        try { await sendPush(s, JSON.stringify(msg)); stats.sent++; }
        catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s); // that phone unsubscribed or the app was removed
          else log('push failed for one phone of ' + u.id + ': ' + (e && (e.statusCode || e.message)));
        }
      }
    }
    const upd = { 'notify.lastSent': date };
    if (stats.sent > sentBefore) upd['notify.sentOn'] = date; // a reminder really arrived today
    if (gone.length) { upd.subs = FieldValue.arrayRemove(...gone); stats.removed += gone.length; }
    await u.ref.update(upd);
  }
  log('reminders: ' + JSON.stringify(stats));
  return stats;
}

async function main() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT; const key = process.env.VAPID_PRIVATE_KEY;
  if (!sa || !key) { console.log('reminders: secrets FIREBASE_SERVICE_ACCOUNT / VAPID_PRIVATE_KEY not set yet, nothing sent'); return; }
  const admin = require('firebase-admin'); const webpush = require('web-push');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
  webpush.setVapidDetails(APP_URL, VAPID_PUBLIC, key.trim());
  await run({ db: admin.firestore(), FieldValue: admin.firestore.FieldValue,
    sendPush: (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'normal' }) });
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { run, message, localParts };
