# Plant Care

A smart houseplant app for the phone: each plant gets a photo, its care profile and a
routine that changes with the seasons. Open it in Safari and choose
**Share → Add to Home Screen** to use it like an app.

- **Today**: what needs water, fertilizer or misting now; tick it off when done.
- **Seasons**: watering and feeding change automatically between winter, spring, summer and autumn.
- **Window compass**: point the phone at the plant's window to record which way it faces.
- **Indoor climate**: type in your thermometer's temperature and humidity; dry or cold air changes the advice.
- **Learns**: "Still wet" or watering early adjusts that plant's schedule.

- **Location & weather**: your city from the phone (or typed in) sets the seasons; the local forecast warns about frost, hot days and grey spells.
- **Shared homes**: sign in with Google, create a home and invite people by their Gmail address;
  everyone in it sees the same plants and who watered them. Friends make their own homes.

- **Reminders**: a daily notification at your chosen time, only on days something is due
  (sent by a scheduled GitHub job), and the next 8 weeks of watering and feeding days for your calendar.

Without signing in, data stays on the phone (backup file in Settings).

## Setup for sharing (once)
Firebase project with Google sign-in and Firestore; `samn69.github.io` as an authorized domain;
the rules in [`firestore.rules`](firestore.rules) published; the web config pasted into
`FIREBASE_CONFIG` in `index.html`.

Reminders also need two repository secrets for `.github/workflows/reminders.yml`:
`FIREBASE_SERVICE_ACCOUNT` (the project's service account key, JSON) and `VAPID_PRIVATE_KEY`
(private half of the key whose public half is `VAPID_PUBLIC` in `index.html`).

- **Identify from a photo** (Pl@ntNet, free, 500 a day): pick the match; plants not in the care guide get a basic routine (leafy, succulent, humidity lover) that can be changed. Needs a free key from my.plantnet.org in `PLANTNET_KEY`.
