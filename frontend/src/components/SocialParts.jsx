// Retake Gym friends network: the pieces the Social screen, a friend's page and the end of a
// workout share (avatar, a post, the composer with its one photo).
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate } from '../lib/format.js'
import { socialApi, getAvatar } from '../lib/api.js'
import { socialError, ago, cardText } from '../lib/social.js'
import { nav } from '../lib/nav.js'
import { Button, MenuButton } from './ui.jsx'
import Icon from './Icon.jsx'

const toast = m => useUI.getState().toast(m)

// Photos and avatars are fetched once per session and kept here.
const avatars = new Map(), photos = new Map()
export function Avatar({ person, size = 44 }) {
  const key = person?.id && person.avatar ? person.id + ':' + person.avatar : null
  const [src, setSrc] = useState(key ? avatars.get(key) || null : null)
  useEffect(() => {
    if (!key) { setSrc(null); return }
    if (avatars.has(key)) { setSrc(avatars.get(key)); return }
    let live = true
    getAvatar(person.id).then(x => { avatars.set(key, x.avatar || null); if (live) setSrc(x.avatar || null) }).catch(() => {})
    return () => { live = false }
  }, [key])
  const letter = (person?.name || '?').trim().slice(0, 1).toUpperCase()
  return <span className="social-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
    {src ? <img src={src} alt="" /> : letter}
  </span>
}

function PostPhoto({ id }) {
  const [src, setSrc] = useState(photos.get(id) || null)
  useEffect(() => {
    if (photos.has(id)) return
    let live = true
    socialApi.photo(id).then(x => { photos.set(id, x.photo); if (live) setSrc(x.photo) }).catch(() => {})
    return () => { live = false }
  }, [id])
  return src ? <img className="social-photo" src={src} alt={t('Photo of the post')} /> : <div className="social-photo social-photo-wait" />
}

export function PostCardView({ card }) {
  if (card?.type === 'weight') return <div className="social-card social-card-weight">
    <div className="small">{t('Weight progress')}</div>
    {card.before ? <div className="social-ba">
      <div><div className="small muted-inv">{t('Before')} · {fmtDate(card.from)}</div><b>{card.before}</b></div>
      <Icon name="chevronRight" />
      <div><div className="small muted-inv">{t('Now')} · {fmtDate(card.to)}</div><b>{card.after}</b></div>
    </div> : <div className="small muted-inv">{fmtDate(card.from)} → {fmtDate(card.to)}</div>}
    <strong className="social-card-big">{card.change}</strong>
  </div>
  if (card?.type === 'workout') return <div className="social-card social-card-workout">
    <div className="row" style={{ gap: 8 }}><Icon name="dumbbell" /><b>{card.name}</b></div>
    <div className="social-stats">
      {card.minutes > 0 && <span><b>{card.minutes}</b> {t('min')}</span>}
      {card.sets > 0 && <span><b>{card.sets}</b> {t('sets')}</span>}
      {card.volume && <span><b>{card.volume}</b></span>}
    </div>
    {card.exercises?.length > 0 && <div className="small muted-inv">{card.exercises.join(' · ')}</div>}
  </div>
  return null
}

const REACTIONS = ['💪', '🔥', '👏']
export function Post({ post, reload }) {
  const [busy, setBusy] = useState(false), [comment, setComment] = useState(''), [open, setOpen] = useState(false)
  const run = async fn => { if (busy) return; setBusy(true); try { await fn(); await reload?.() } catch (e) { toast(socialError(e)) } finally { setBusy(false) } }
  const author = post.author || { name: t('Member') }
  const openAuthor = () => author.username && nav('/social/u/' + encodeURIComponent(author.username))
  const remove = () => useUI.getState().openSheet(close => <>
    <h3>{t('Delete this post?')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Your friends stop seeing it, with its photo and comments.')}</div>
    <Button variant="danger" onClick={() => { close(); run(() => socialApi.removePost(post.id)) }}>{t('Delete')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>, { kind: 'center' })
  const comments = open ? post.comments : post.comments.slice(-2)
  return <article className="card social-post">
    <div className="social-post-head">
      <button type="button" className="social-who" onClick={openAuthor}>
        <Avatar person={author} size={40} />
        <span className="social-name"><b>{author.name}</b>
          <span className="social-when">{author.username ? '@' + author.username + ' · ' : ''}{ago(post.at)}{post.scope === 'public' ? ' · ' + t('Public') : ''}</span></span>
      </button>
      {post.mine && <button type="button" className="iconbtn social-del" aria-label={t('Delete post')} onClick={remove}><Icon name="trash" /></button>}
    </div>
    {post.text && <p className="social-text">{post.text}</p>}
    <PostCardView card={post.card} />
    {post.photo && <PostPhoto id={post.id} />}
    <div className="social-actions">
      {REACTIONS.map(r => <button type="button" key={r} className={'social-react' + (post.myReaction === r ? ' on' : '')} disabled={busy}
        onClick={() => run(() => socialApi.react(post.id, r))}>{r}{post.reactions?.[r] ? ' ' + post.reactions[r] : ''}</button>)}
      {post.commentCount > 2 && !open && <button type="button" className="social-more small" onClick={() => setOpen(true)}>{t('See all {0} comments', post.commentCount)}</button>}
    </div>
    {comments.length > 0 && <div className="social-comments">
      {comments.map(c => <div className="social-comment" key={c.id}>
        <span><b>{c.name}</b> {c.text} <span className="social-ctime">{ago(c.at)}</span></span>
        {(c.mine || post.mine) && <button type="button" className="social-x" aria-label={t('Delete comment')} onClick={() => run(() => socialApi.removeComment(post.id, c.id))}><Icon name="xmark" /></button>}
      </div>)}
    </div>}
    <form className="social-row social-reply" onSubmit={e => { e.preventDefault(); const v = comment.trim(); if (v) run(async () => { await socialApi.comment(post.id, v); setComment('') }) }}>
      <input className="input" maxLength={300} value={comment} onChange={e => setComment(e.target.value)} placeholder={t('Write a comment')} />
      <button type="submit" className="iconbtn social-send" aria-label={t('Send comment')} disabled={busy || !comment.trim()}><Icon name="arrowUp" /></button>
    </form>
  </article>
}

// A photo from the phone, made small enough to post: 1080 px on the long side, JPEG.
export function compactPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error(t('No photo chosen.')))
    const url = URL.createObjectURL(file), image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 1080 / Math.max(image.width, image.height)), canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      let result = ''
      for (const quality of [0.8, 0.68, 0.55, 0.42]) { result = canvas.toDataURL('image/jpeg', quality); if (result.length <= 380000) break }
      result.length <= 380000 ? resolve(result) : reject(new Error(t('That photo is too big. Try another one.')))
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('Could not open that photo.'))) }
    image.src = url
  })
}

// Write a post: text, one photo and, when given, a card (a workout or the weight progress).
export function Composer({ kind = 'text', card = null, initialText, onDone, onCancel, compact = false }) {
  const me = useStore(s => s.user)
  const [text, setText] = useState(initialText ?? cardText(card))
  const [photo, setPhoto] = useState(null), [scope, setScope] = useState('friends'), [busy, setBusy] = useState(false)
  const file = useRef(null)
  useEffect(() => { if (initialText == null) setText(cardText(card)) }, [card])
  const pick = async e => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try { setPhoto(await compactPhoto(f)) } catch (x) { toast(x.message) }
  }
  const publish = async () => {
    if (busy || (!text.trim() && !photo)) return
    setBusy(true)
    try {
      await socialApi.publish({ kind, text, scope, photo, card })
      toast(t('Posted for your friends'))
      setText(''); setPhoto(null); onDone?.()
    } catch (e) { toast(socialError(e)) } finally { setBusy(false) }
  }
  if (!me) return null
  return <div className={'social-composer' + (compact ? ' compact' : '')}>
    <PostCardView card={card} />
    <textarea className="input" maxLength={500} value={text} onChange={e => setText(e.target.value)} placeholder={t('How was your training?')} />
    {photo && <div className="social-photo-pick"><img className="social-photo" src={photo} alt={t('Photo of the post')} />
      <button type="button" className="iconbtn social-photo-x" aria-label={t('Remove photo')} onClick={() => setPhoto(null)}><Icon name="xmark" /></button></div>}
    <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
    <div className="social-row social-tools">
      <button type="button" className="iconbtn social-tool" aria-label={photo ? t('Change photo') : t('Add a photo')} onClick={() => file.current?.click()}><Icon name="camera" /></button>
      <MenuButton title={t('Who sees it')} value={scope} onChange={setScope} className="social-scope" options={[
        { value: 'friends', label: t('Friends') },
        { value: 'public', label: t('Everyone on the app') }
      ]} />
      <span className="grow" />
      {onCancel && <Button size="sm" variant="ghost" className="dim" onClick={onCancel}>{t('Not now')}</Button>}
      <Button size="sm" variant="primary" disabled={busy || (!text.trim() && !photo)} onClick={publish}>{busy ? t('Posting…') : t('Post')}</Button>
    </div>
    <div className="social-hint">{t('One photo per post. Only what you see here is shared.')}</div>
  </div>
}
