// Retake Gym friends network: what a post shows, built from the profile's own data. Nothing here
// is sent anywhere by itself; the Social screen shows the card and the person decides to publish.
import { t } from './i18n.js'
import { fmtNum, fmtDate } from './format.js'
import { sessionVolume, setsDone, workoutDuration } from './history.js'
import { EXIDX } from './exercises.js'
import { exerciseNameText } from './format.js'

const round1 = n => Math.round(n * 10) / 10

// The workout card: name, sets done, minutes, volume and up to five exercises.
export function workoutCard(w, S) {
  if (!w) return null
  const names = (Array.isArray(w.entries) ? w.entries : [])
    .filter(e => (e.sets || []).some(s => s.done || s.sides?.L?.done || s.sides?.R?.done))
    .map(e => (EXIDX[e.id] ? exerciseNameText(EXIDX[e.id]) : null)).filter(Boolean)
  const vol = Math.round(sessionVolume(w, S))
  return {
    type: 'workout', name: String(w.name || t('Workout')).slice(0, 40),
    sets: Array.isArray(w.entries) ? setsDone(w) : 0,
    minutes: Math.round(workoutDuration(w) / 60000),
    volume: vol > 0 ? fmtNum(vol) + ' ' + (S?.unit || 'kg') : '',
    exercises: [...new Set(names)].slice(0, 5)
  }
}

// The weight card: first and latest weigh-in and the change between them. `format` 'percent'
// leaves the weights out and shows only the percentage.
export function weightCard(S, format = 'percent') {
  const points = (Array.isArray(S?.bodyweight) ? S.bodyweight : [])
    .filter(x => x && Number.isFinite(Number(x.w)) && Number(x.w) > 0 && typeof x.d === 'string')
    .sort((a, b) => a.d.localeCompare(b.d))
  if (points.length < 2) return null
  const first = points[0], last = points.at(-1), unit = S.unit || 'kg'
  const diff = Number(last.w) - Number(first.w), pct = round1(diff / Number(first.w) * 100)
  const sign = n => (n > 0 ? '+' : '')
  const kg = format === 'kg'
  return {
    type: 'weight', from: first.d, to: last.d,
    change: kg ? `${sign(diff)}${fmtNum(round1(diff))} ${unit}` : `${sign(pct)}${fmtNum(pct)}%`,
    before: kg ? `${fmtNum(round1(Number(first.w)))} ${unit}` : '',
    after: kg ? `${fmtNum(round1(Number(last.w)))} ${unit}` : ''
  }
}

// The text a post starts with, which the person can change before publishing.
export function cardText(card) {
  if (!card) return ''
  if (card.type === 'workout') return t('Finished {0} today.', card.name)
  if (card.type === 'weight') return t('My weight progress since {0}: {1}', fmtDate(card.from), card.change)
  return ''
}

// The server's refusals, in words the person can act on.
export function socialError(e) {
  const code = e?.data?.code, msg = String(e?.message || '')
  if (code === 'private' || /visible to friends/.test(msg)) return t('Your profile is private. Set it to Friends or Public to post.')
  if (code === 'photo' || /photo/.test(msg)) return t('That photo could not be used. Try another one.')
  if (code === 'no-workout' || /complete a workout/.test(msg)) return t('Log a workout today first, then check in.')
  if (code === 'ended' || /has ended/.test(msg)) return t('This challenge has ended.')
  if (code === 'muted') return t('This friend has turned pokes off.')
  if (code === 'today' || /already nudged/.test(msg)) return t('You already poked this friend today.')
  if (/user not found/.test(msg)) return t('Nobody here has that user name.')
  if (/request already exists/.test(msg)) return t('You already sent a request to this person.')
  if (/invalid or expired/.test(msg)) return t('That code is wrong or has expired.')
  if (/friends only/.test(msg)) return t('Only friends can do that.')
  if (/too many/.test(msg)) return t('Too many at once. Try again later.')
  if (e?.status === 401) return t('Sign in to use the friends network.')
  return msg || t('Something went wrong. Try again.')
}

// "5 min", "3 h", "2 d", or the date: how long ago a post or comment was made.
export function ago(at, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - at) / 60000))
  if (m < 1) return t('now')
  if (m < 60) return t('{0} min', m)
  const h = Math.round(m / 60)
  if (h < 24) return t('{0} h', h)
  const d = Math.round(h / 24)
  if (d < 7) return t('{0} d', d)
  return fmtDate(new Date(at - new Date(at).getTimezoneOffset() * 60000).toISOString().slice(0, 10))
}
