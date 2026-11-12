// Retake Gym: the friends network (feed, friends, challenges, weekly league). The routes live in
// server.js; the rules they share live here so they can be tested on their own.
//
// Dates: a workout's day (`w.d`) is the phone's local day, and the server runs in UTC. Brazil is
// three hours behind, so "today" taken from the server clock is already tomorrow after 21:00 there.
// The client therefore sends its own day, and the server takes it when it is within a day of its
// own (every time zone on Earth is), falling back to the UTC day otherwise.

const DAY = 86400000;
export const isDay = d => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d) && !Number.isNaN(Date.parse(d + 'T12:00:00Z'));
const utcDay = now => new Date(now).toISOString().slice(0, 10);
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
export const addDays = (d, n) => utcDay(Date.parse(d + 'T12:00:00Z') + n * DAY);

export function localToday(given, now = Date.now()) {
  const server = utcDay(now);
  return isDay(given) && Math.abs(dayDiff(server, given)) <= 1 ? given : server;
}

// The Monday that starts the week holding `today`.
export function weekStart(today) {
  const dow = new Date(today + 'T12:00:00Z').getUTCDay();
  return addDays(today, -((dow + 6) % 7));
}

// Consecutive training days that end today or yesterday (a rest day today does not break it yet).
export function streakDays(dates, today) {
  const set = new Set(dates.filter(isDay));
  let day = set.has(today) ? today : addDays(today, -1), n = 0;
  while (set.has(day)) { n++; day = addDays(day, -1); }
  return n;
}

export const VISIBILITY = ['private', 'friends', 'public'];
// A profile made before this setting existed shares with friends: the network is for friends.
export const visibilityOf = p => (VISIBILITY.includes(p?.visibility) ? p.visibility : 'friends');

export function emptySocial() {
  return { profiles: {}, friends: {}, posts: [], challenges: [], pokes: {}, invites: {}, notifications: {}, seen: {} };
}
export function normalizeSocial(s) {
  const base = emptySocial();
  if (!s || typeof s !== 'object') return base;
  for (const k of Object.keys(base)) if (s[k] == null || typeof s[k] !== typeof base[k] || Array.isArray(s[k]) !== Array.isArray(base[k])) s[k] = base[k];
  return s;
}

export const friendIds = (social, id) => (social.friends[id] || []).filter(x => x.status === 'accepted').map(x => x.id);
export const areFriends = (social, a, b) => (social.friends[a] || []).some(x => x.id === b && x.status === 'accepted');

// What `viewer` is to `id`: self, friend, sent (viewer asked), received (they asked), other.
export function relationOf(social, viewer, id) {
  if (viewer === id) return 'self';
  const x = (social.friends[viewer] || []).find(f => f.id === id);
  if (!x) return 'other';
  if (x.status === 'accepted') return 'friend';
  return x.direction === 'in' ? 'received' : 'sent';
}

// Whether `viewer` may see `post`: their own; a friend's (unless the friend is private); a public
// post of a public profile, for anyone signed in to this server.
export function canSeePost(social, viewer, post) {
  if (!post) return false;
  if (post.author === viewer) return true;
  const vis = visibilityOf(social.profiles[post.author]);
  if (vis === 'private') return false;
  if (areFriends(social, viewer, post.author)) return true;
  return vis === 'public' && post.scope === 'public';
}

// A challenge as its members see it: which day it is on, whether it is over, the standings
// (most check-ins first) and, once over, who won (everyone tied at the top, if they checked in).
export function challengeView(c, today, nameOf = () => '') {
  const day = dayDiff(c.start, today) + 1;
  const ended = day > c.days;
  const standings = c.members.map(id => ({ id, name: nameOf(id), days: (c.checkins?.[id] || []).length }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  const top = standings[0]?.days || 0;
  const winners = ended && top > 0 ? standings.filter(s => s.days === top).map(s => s.id) : [];
  const end = addDays(c.start, c.days - 1);
  return {
    id: c.id, owner: c.owner, title: c.title, days: c.days, start: c.start, end,
    day: Math.max(1, Math.min(day, c.days)), daysLeft: ended ? 0 : Math.max(0, c.days - day + 1),
    started: day >= 1, ended, members: c.members, standings, winners,
    checkedToday: c.members.reduce((o, id) => (o[id] = (c.checkins?.[id] || []).includes(today), o), {})
  };
}

// Photos: one per post, a JPEG/PNG/WebP data: URL the app has already shrunk.
export const PHOTO_MAX = 400 * 1024;
export const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
export const photoOk = v => typeof v === 'string' && v.length <= PHOTO_MAX && PHOTO_RE.test(v);
