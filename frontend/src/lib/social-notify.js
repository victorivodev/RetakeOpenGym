// Retake Gym: friends' notes (pokes, comments, requests) as phone notifications in the apps.
// The APK and the iPhone app have no Web Push, so the app asks the server when it opens, when it
// comes back to the foreground and every few minutes while it is open, and shows what is new
// as a local notification. With the app closed nothing arrives until it is opened again; the
// note is in the Friends screen either way. The web app gets them as Web Push (Settings).
import { MOBILE, onAppActive } from './mobile.js'
import { socialApi } from './api.js'
import { t } from './i18n.js'

const KEY = 'gym_social_notified'
const ID_BASE = 5000
const lastNotified = () => { try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 } }
const remember = at => { try { localStorage.setItem(KEY, String(at)) } catch { /* private mode */ } }

export function noteText(n) {
  switch (n.kind) {
    case 'poke': return t('{0} poked you: time to train!', n.name)
    case 'friend-request': return t('{0} wants to be your friend.', n.name)
    case 'friend-accepted': return t('{0} is now your friend.', n.name)
    case 'friend-joined': return t('{0} joined with your invite and is now your friend.', n.name)
    case 'comment': return t('{0} commented: {1}', n.name, n.text || '')
    case 'reaction': return t('{0} reacted {1} to your post.', n.name, n.reaction || '')
    case 'challenge': return t('{0} started the challenge "{1}".', n.name, n.title || '')
    default: return n.name || ''
  }
}

// The notes newer than the last one shown, oldest first. Pure, for the test.
export function freshNotes(latest, since) {
  return (Array.isArray(latest) ? latest : []).filter(n => n && n.at > since).sort((a, b) => a.at - b.at)
}

let busy = false
export async function checkSocialNotes(isSignedIn) {
  if (!MOBILE || busy || !isSignedIn()) return
  busy = true
  try {
    const { latest } = await socialApi.unread()
    const since = lastNotified()
    const fresh = freshNotes(latest, since)
    if (!fresh.length) return
    remember(fresh.at(-1).at)
    // The first check on a phone only takes note of where things stand: no burst of old notes.
    if (!since) return
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return
    await LocalNotifications.schedule({ notifications: fresh.map((n, i) => ({
      id: ID_BASE + ((n.at / 1000 + i) % 900 | 0), title: 'Retake Gym', body: noteText(n), extra: { url: '/social' }
    })) })
  } catch { /* offline or not signed in: next time */ } finally { busy = false }
}

let started = false
export function initSocialNotes(isSignedIn) {
  if (!MOBILE || started) return
  started = true
  const check = () => checkSocialNotes(isSignedIn)
  setTimeout(check, 4000)
  setInterval(() => { if (document.visibilityState !== 'hidden') check() }, 3 * 60000)
  onAppActive(check)
}
