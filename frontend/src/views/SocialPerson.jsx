// Retake Gym friends network: one person's page (their profile and the posts you may see).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { socialApi } from '../lib/api.js'
import { socialError } from '../lib/social.js'
import { nav } from '../lib/nav.js'
import { Button } from '../components/ui.jsx'
import { Avatar, Post } from '../components/SocialParts.jsx'
import Icon from '../components/Icon.jsx'
import './Social.css'

const toast = m => useUI.getState().toast(m)

export default function SocialPerson() {
  const { username } = useParams()
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const reload = () => socialApi.person(username).then(d => { setData(d); setError('') }).catch(e => setError(e.status === 404 ? t('This profile is not available.') : socialError(e)))
  useEffect(() => { reload() }, [username])
  const run = async (fn, done) => { if (busy) return; setBusy(true); try { await fn(); if (done) toast(done); await reload() } catch (e) { toast(socialError(e)) } finally { setBusy(false) } }
  const p = data?.profile
  const removeFriend = () => useUI.getState().openSheet(close => <>
    <h3>{t('Remove {0} from your friends?', p.name)}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('You stop seeing each other’s posts. You can add each other again later.')}</div>
    <Button variant="danger" onClick={() => { close(); run(() => socialApi.removeFriend(p.id)) }}>{t('Remove friend')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>, { kind: 'center' })
  return <div className="narrow social">
    <div className="hdr">
      <button className="iconbtn" data-back="/social" onClick={() => nav('/social')} aria-label={t('Friends')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{p?.name || '@' + username}</h1>{p?.username && <div className="sub">@{p.username}</div>}</div>
    </div>
    {error && <div className="card social-error" role="alert">{error}</div>}
    {!p && !error && <div className="muted small">{t('Loading…')}</div>}
    {p && <div className="card social-profile">
      <div className="row" style={{ gap: 14 }}>
        <Avatar person={p} size={72} />
        <div style={{ minWidth: 0 }}>
          {p.goal && <div><b>{t('Goal')}:</b> {p.goal}</div>}
          {p.bio && <div className="muted">{p.bio}</div>}
          {!p.bio && !p.goal && p.relation !== 'self' && p.visibility !== 'public' && p.relation !== 'friend' && <div className="muted small">{t('Become friends to see more.')}</div>}
        </div>
      </div>
      {p.streak != null && <div className="social-stats">
        <span><b>{p.streak}</b> {t('days in a row')}</span>
        <span><b>{p.workouts}</b> {t('workouts')}</span>
        <span><b>{p.friendCount}</b> {t('friends')}</span>
      </div>}
      <div className="social-row">
        {p.relation === 'self' && <Button onClick={() => nav('/social')}>{t('Edit my profile')}</Button>}
        {p.relation === 'other' && <Button variant="primary" disabled={busy} onClick={() => run(() => socialApi.friend(p.username), t('Request sent'))}>{t('Add friend')}</Button>}
        {p.relation === 'sent' && <Button disabled={busy} onClick={() => run(() => socialApi.removeFriend(p.id))}>{t('Cancel request')}</Button>}
        {p.relation === 'received' && <Button variant="primary" disabled={busy} onClick={() => run(() => socialApi.accept(p.id), t('Now you are friends'))}>{t('Accept request')}</Button>}
        {p.relation === 'friend' && <>
          <Button variant="tinted" disabled={busy} onClick={() => run(() => socialApi.poke(p.id), t('Poke sent'))}>👉 {t('Poke')}</Button>
          {!data.everyone && <Button disabled={busy} onClick={removeFriend}>{t('Remove friend')}</Button>}
        </>}
      </div>
    </div>}
    {p && !data.posts.length && <div className="muted small" style={{ margin: '12px 4px' }}>{t('No posts to show.')}</div>}
    {data?.posts?.map(x => <Post key={x.id} post={x} reload={reload} />)}
  </div>
}
