// Retake Gym: the profile friends will see. Its photo, display name and @user name, changed in
// Settings → Account → Profile (POST /api/account/profile, /api/account/avatar). The photo is cut
// to a square and shrunk here before it is sent, so the server only ever keeps a small picture.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { getAvatar, setAvatar, updateProfile } from '../lib/api.js'
import { Row, Button } from './ui.jsx'
import { accountError, foldUsername, looksLikeUsername, suggestUsername } from './EmailAuth.jsx'

const AVATAR_PX = 256

// Photos already fetched, by profile id and version, so a list of friends asks once each.
const cache = new Map()
export function useAvatar(id, version) {
  const key = id && version ? id + ':' + version : null
  const [src, setSrc] = useState(() => (key ? cache.get(key) || null : null))
  useEffect(() => {
    if (!key) { setSrc(null); return }
    if (cache.has(key)) { setSrc(cache.get(key)); return }
    let live = true
    getAvatar(id).then(r => { if (r?.avatar) cache.set(key, r.avatar); if (live) setSrc(r?.avatar || null) }).catch(() => {})
    return () => { live = false }
  }, [key])
  return src
}

/** A round photo, or the name's first letter on the accent colour when there is none. */
export function Avatar({ user, size = 44, src: given }) {
  const fetched = useAvatar(given ? null : user?.id, user?.avatar)
  const src = given || fetched
  const initial = String(user?.name || '?').trim().charAt(0).toUpperCase() || '?'
  const box = { width: size, height: size, borderRadius: '50%', flex: 'none', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  if (src) return <img src={src} alt="" width={size} height={size} style={{ ...box, objectFit: 'cover' }} />
  return <span aria-hidden="true" style={{ ...box, background: 'var(--acc)', color: 'var(--acc-on, #fff)', fontWeight: 700, fontSize: size * 0.42 }}>{initial}</span>
}

// A picked picture as a centred square JPEG of AVATAR_PX, as a data: URL.
export function shrinkPhoto(file, px = AVATAR_PX) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight)
        const c = document.createElement('canvas')
        c.width = px; c.height = px
        const g = c.getContext('2d')
        g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, px, px)
        resolve(c.toDataURL('image/jpeg', 0.85))
      } catch (e) { reject(e) } finally { URL.revokeObjectURL(url) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')) }
    img.src = url
  })
}

export function ProfileRow() {
  const user = useStore(s => s.user)
  if (!user) return null
  return <Row title={user.name || t('Profile')} subtitle={user.username ? '@' + user.username : t('Choose a user name')} accessory="chevron"
    onClick={() => useUI.getState().openSheet(close => <ProfileSheet close={close} />)}>
    <span style={{ order: -1, marginInlineEnd: 12, display: 'inline-flex' }}><Avatar user={user} size={40} /></span>
  </Row>
}

export function ProfileSheet({ close }) {
  const user = useStore(s => s.user)
  const patchUser = useStore(s => s.patchUser)
  const [name, setName] = useState(user?.name || '')
  const [username, setUsername] = useState(user?.username || suggestUsername(user?.name))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const file = useRef(null)
  const current = useAvatar(user?.id, user?.avatar)
  if (!user) return null

  const pick = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true); setErr(null)
    try {
      const data = await shrinkPhoto(f)
      const r = await setAvatar(data)
      if (r?.user?.avatar) cache.set(user.id + ':' + r.user.avatar, data)
      patchUser(r.user)
    } catch (e2) { setErr(e2?.message === 'unreadable' ? t('Could not read that photo') : accountError(e2)) }
    finally { setBusy(false) }
  }
  const removePhoto = async () => {
    setBusy(true); setErr(null)
    try { patchUser((await setAvatar(null)).user) } catch (e) { setErr(accountError(e)) } finally { setBusy(false) }
  }
  const save = async ev => {
    ev.preventDefault()
    if (busy) return
    const handle = foldUsername(username)
    if (!name.trim()) { setErr(t('Enter your name.')); return }
    if (handle && !looksLikeUsername(handle)) { setErr(t('A user name has 3 to 20 letters, numbers, dots or underscores.')); return }
    setBusy(true); setErr(null)
    try {
      const r = await updateProfile({ name: name.trim(), ...(handle || user.username ? { username: handle } : {}) })
      patchUser(r.user)
      close()
      useUI.getState().toast(t('Profile saved'))
    } catch (e) { setErr(accountError(e)) }
    finally { setBusy(false) }
  }

  return <form onSubmit={save} noValidate>
    <h3>{t('Your profile')}</h3>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <Avatar user={user} src={current} size={72} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <Button type="button" icon="camera" disabled={busy} onClick={() => file.current?.click()}>{current ? t('Change photo') : t('Add a photo')}</Button>
        {current && <Button type="button" variant="ghost" className="dim" disabled={busy} onClick={removePhoto}>{t('Remove photo')}</Button>}
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
    </div>
    <input className="input" name="name" autoComplete="name" placeholder={t('Your name')} maxLength={40}
      value={name} onChange={e => setName(e.target.value)} />
    <div style={{ height: 10 }} />
    <div style={{ position: 'relative' }}>
      <span className="dim" style={{ position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>@</span>
      <input className="input" name="nickname" placeholder={t('user name')} maxLength={21} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={username} onChange={e => setUsername(e.target.value.toLowerCase())} style={{ paddingInlineStart: 30 }} />
    </div>
    <div className="dim small" style={{ marginTop: 6 }}>{t('Unique. Your friends will find you by it.')}</div>
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>}
    <div style={{ height: 12 }} />
    <Button type="submit" variant="primary" disabled={busy}>{t('Save')}</Button>
  </form>
}
