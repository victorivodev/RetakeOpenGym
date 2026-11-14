// Retake Gym friends network: the feed, friends (invites, requests, search), group challenges and
// the weekly league. The server side is api/social.js; the cards are built in lib/social.js.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { socialApi, serverAddress } from '../lib/api.js'
import { socialError, workoutCard, weightCard, ago } from '../lib/social.js'
import { nav } from '../lib/nav.js'
import { noteText } from '../lib/social-notify.js'
import { MOBILE } from '../lib/mobile.js'
import { copyText } from '../lib/clipboard.js'
import { Button, Section, Segmented, MenuButton } from '../components/ui.jsx'
import { Avatar, Post, Composer } from '../components/SocialParts.jsx'
import Icon from '../components/Icon.jsx'
import './Social.css'

const toast = m => useUI.getState().toast(m)
const TAB_KEY = 'gym_social_tab'
const readTab = () => { try { return localStorage.getItem(TAB_KEY) || 'feed' } catch { return 'feed' } }

async function shareText(text, url) {
  if (MOBILE) {
    try { const { Share } = await import('@capacitor/share'); await Share.share({ title: 'Retake Gym', text, url, dialogTitle: t('Invite a friend') }); return } catch (e) { if (/cancel/i.test(String(e?.message || ''))) return }
  } else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ title: 'Retake Gym', text, url }); return } catch (e) { if (e?.name === 'AbortError') return }
  }
  toast(await copyText(text + '\n' + url) ? t('Copied. Paste it to your friend.') : url)
}

export default function Social() {
  const user = useStore(s => s.user)
  const S = useStore(s => s.S)
  const [tab, setTabState] = useState(readTab)
  const [data, setData] = useState(null), [error, setError] = useState('')
  const [ranking, setRanking] = useState(null), [challenges, setChallenges] = useState(null)
  const setTab = v => { setTabState(v); try { localStorage.setItem(TAB_KEY, v) } catch { /* private mode */ } }
  const reload = () => socialApi.get().then(d => { setData(d); setError('') }).catch(e => setError(socialError(e)))
  const loadChallenges = () => socialApi.challenges().then(x => setChallenges(x.challenges || [])).catch(e => toast(socialError(e)))
  const loadRanking = () => socialApi.ranking().then(x => setRanking(x)).catch(e => toast(socialError(e)))
  useEffect(() => {
    if (!user) return
    reload()
    const timer = setInterval(reload, 45000)
    return () => clearInterval(timer)
  }, [user?.id])
  useEffect(() => { if (user && tab === 'challenges') loadChallenges(); if (user && tab === 'league') loadRanking() }, [tab, user?.id])
  // Opening the screen reads the notes.
  useEffect(() => { if (data?.unread) socialApi.seen().catch(() => {}) }, [data?.unread])

  // One line: back, the title. The tagline only greets someone not signed in yet.
  const header = <div className="hdr social-hdr">
    <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1 }}><h1>{t('Friends')}</h1>{!user && <div className="sub">{t('Train together, share only what you choose.')}</div>}</div>
  </div>
  if (!user) return <div className="narrow social">{header}
    <div className="card"><b>{t('Sign in to use the friends network.')}</b>
      <div className="muted small" style={{ marginTop: 6 }}>{t('The friends network needs an account on the Retake Gym server.')}</div></div>
  </div>

  return <div className="narrow social">
    {header}
    {error && <div className="card social-error" role="alert">{error} <Button size="sm" onClick={reload}>{t('Try again')}</Button></div>}
    <Segmented value={tab} onChange={setTab} options={[
      { value: 'feed', label: t('Feed') },
      { value: 'friends', label: t('Friends') + (data?.incoming?.length ? ' · ' + data.incoming.length : '') },
      { value: 'challenges', label: t('Challenges') },
      { value: 'league', label: t('League') }
    ]} />
    <div style={{ height: 16 }} />
    {tab === 'feed' && <Feed data={data} S={S} reload={reload} goFriends={() => setTab('friends')} />}
    {tab === 'friends' && <Friends data={data} reload={reload} />}
    {tab === 'challenges' && <Challenges list={challenges} reload={loadChallenges} me={user} />}
    {tab === 'league' && <League ranking={ranking} reload={loadRanking} me={user} S={S} />}
  </div>
}

function Feed({ data, S, reload, goFriends }) {
  const me = useStore(s => s.user)
  const [card, setCard] = useState(null), [kind, setKind] = useState('text'), [weightFmt, setWeightFmt] = useState('percent')
  // Folded to one line ("How was your training?") until tapped: the feed is what the screen is for.
  const [writing, setWriting] = useState(false)
  const last = (S.workouts || []).at(-1)
  const weight = weightCard(S, weightFmt)
  const notes = data?.notifications?.filter(n => n.unread) || []
  if (!data) return <div className="muted small">{t('Loading…')}</div>
  const close = () => { setWriting(false); setKind('text'); setCard(null) }
  const chip = (k, icon, label, pick) => <button type="button" className={'social-chip' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={pick}><Icon name={icon} />{label}</button>
  return <>
    {notes.length > 0 && <div className="card social-notes">
      {notes.slice(0, 4).map(n => <div className="social-note" key={n.id}><Icon name="bell" /><span>{noteText(n)} <span className="social-ctime">{ago(n.at)}</span></span></div>)}
    </div>}
    {data.people.length === 0 && <div className="card">
      <b>{t('Bring your friends')}</b>
      <div className="muted small" style={{ margin: '4px 0 12px' }}>{t('Invite your friends to the app. Their posts show up here, and yours for them.')}</div>
      <Button variant="primary" size="sm" icon="person" onClick={goFriends}>{t('Invite friends')}</Button>
    </div>}
    {!writing ? <button type="button" className="card social-start" onClick={() => setWriting(true)}>
      <Avatar person={me} size={36} />
      <span className="social-start-t">{t('How was your training?')}</span>
      <Icon name="camera" className="social-start-i" />
    </button> : <div className="card social-write">
      <div className="social-quick">
        {chip('text', 'pencil', t('Text or photo'), () => { setKind('text'); setCard(null) })}
        {last && chip('workout', 'dumbbell', t('Last workout'), () => { setKind('workout'); setCard(workoutCard(last, S)) })}
        {weight && chip('weight', 'scale', t('Weight progress'), () => { setKind('weight'); setCard(weightCard(S, weightFmt)) })}
      </div>
      {kind === 'weight' && <div className="social-row">
        <MenuButton title={t('What to show')} value={weightFmt} onChange={v => { setWeightFmt(v); setCard(weightCard(S, v)) }} options={[
          { value: 'percent', label: t('Only the percentage') },
          { value: 'kg', label: t('Before and after weight') }
        ]} />
      </div>}
      <Composer kind={kind} card={card} onCancel={close} onDone={() => { close(); reload() }} />
    </div>}
    {!data.posts.length && <div className="muted small social-empty">{t('No posts yet. Share your first workout or invite a friend.')}</div>}
    {data.posts.map(p => <Post key={p.id} post={p} reload={reload} />)}
  </>
}

function Friends({ data, reload }) {
  const [search, setSearch] = useState(''), [found, setFound] = useState(null), [code, setCode] = useState(''), [myCode, setMyCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn, done) => { if (busy) return; setBusy(true); try { await fn(); if (done) toast(done); await reload() } catch (e) { toast(socialError(e)) } finally { setBusy(false) } }
  const invite = () => run(async () => {
    const { invite } = await socialApi.appInvite()
    const url = serverAddress() + '/?convite=' + encodeURIComponent(invite.code)
    await shareText(t('Train with me on Retake Gym! Create your account with this invite code: {0}', invite.code), url)
  })
  const doSearch = async e => {
    e?.preventDefault()
    const q = search.trim()
    if (q.replace(/^@/, '').length < 2) { setFound(null); return }
    try { setFound((await socialApi.get(q)).found) } catch (x) { toast(socialError(x)) }
  }
  if (!data) return <div className="muted small">{t('Loading…')}</div>
  const relationButton = p => p.relation === 'friend' ? <span className="small muted">{t('Friend')}</span>
    : p.relation === 'sent' ? <span className="small muted">{t('Request sent')}</span>
    : p.relation === 'received' ? <Button size="sm" variant="primary" onClick={() => run(() => socialApi.accept(p.id), t('Now you are friends'))}>{t('Accept')}</Button>
    : <Button size="sm" variant="tinted" onClick={() => run(async () => { await socialApi.friend(p.username); setFound(f => f?.map(x => x.id === p.id ? { ...x, relation: 'sent' } : x)) }, t('Request sent'))}>{t('Add')}</Button>
  const personRow = (p, right) => <div className="social-person" key={p.id}>
    <button type="button" className="social-who" onClick={() => p.username && nav('/social/u/' + encodeURIComponent(p.username))}>
      <Avatar person={p} size={40} />
      <span><b>{p.name}</b><span className="small muted"> {p.username ? '@' + p.username : ''}</span>
        {p.streak > 0 && <span className="small muted social-when">{t('{0} days in a row', p.streak)}</span>}</span>
    </button>
    {right}
  </div>
  return <>
    <div className="card social-invite">
      <b>{t('Invite a friend to the app')}</b>
      <div className="muted small" style={{ margin: '4px 0 12px' }}>{data.everyone ? t('Send a link with an invite code. Everyone on the app is friends with everyone, so your friend sees the whole group from the start.') : t('Send a link with an invite code. When your friend creates an account with it, you two are already friends.')}</div>
      <Button variant="primary" icon="share" disabled={busy} onClick={invite}>{t('Send invite')}</Button>
    </div>
    {data.incoming.length > 0 && <Section title={t('Friend requests')}>
      {data.incoming.map(p => personRow(p, <div className="row" style={{ gap: 6 }}>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => socialApi.accept(p.id), t('Now you are friends'))}>{t('Accept')}</Button>
        <Button size="sm" disabled={busy} onClick={() => run(() => socialApi.removeFriend(p.id))}>{t('Decline')}</Button>
      </div>))}
    </Section>}
    <Section title={t('Find people')}>
      <form className="social-row" onSubmit={doSearch}>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Name or @user name')} autoCapitalize="none" />
        <Button size="sm" disabled={busy}>{t('Search')}</Button>
      </form>
      {found && !found.length && <div className="small muted" style={{ marginTop: 8 }}>{t('Nobody found. A friend with a friends-only profile is found by the exact @user name.')}</div>}
      {found?.map(p => personRow(p, relationButton(p)))}
    </Section>
    <Section title={t('My friends') + (data.people.length ? ' · ' + data.people.length : '')}>
      {!data.people.length && <div className="small muted">{data.everyone ? t('Nobody else here yet. Send an invite.') : t('No friends yet. Send an invite or search by @user name.')}</div>}
      {data.people.map(p => personRow(p, <Button size="sm" disabled={busy} onClick={() => run(() => socialApi.poke(p.id), t('Poke sent'))}>👉 {t('Poke')}</Button>))}
    </Section>
    {data.outgoing.length > 0 && <Section title={t('Requests you sent')}>
      {data.outgoing.map(p => personRow(p, <Button size="sm" disabled={busy} onClick={() => run(() => socialApi.removeFriend(p.id))}>{t('Cancel')}</Button>))}
    </Section>}
    {!data.everyone && <Section title={t('Friend code')} footer={t('For a friend who already has an account: one of you makes a code, the other types it in. It lasts one day.')}>
      <div className="social-row">
        <Button size="sm" disabled={busy} onClick={() => run(async () => { const x = await socialApi.makeInvite(); setMyCode(x.code); copyText(x.code).catch(() => {}) })}>{t('Make a code')}</Button>
        {myCode && <code className="social-code">{myCode}</code>}
      </div>
      <form className="social-row" onSubmit={e => { e.preventDefault(); if (code.trim()) run(async () => { await socialApi.redeemInvite(code); setCode('') }, t('Now you are friends')) }}>
        <input className="input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder={t('Friend code')} />
        <Button size="sm" disabled={busy || !code.trim()}>{t('Use code')}</Button>
      </form>
    </Section>}
    <ProfileSettings me={data.me} reload={reload} />
  </>
}

function ProfileSettings({ me, reload }) {
  const user = useStore(s => s.user)
  const [bio, setBio] = useState(me?.bio || ''), [goal, setGoal] = useState(me?.goal || ''), [visibility, setVisibility] = useState(me?.visibility || 'friends')
  const [rank, setRank] = useState(me?.showInRankings !== false), [muted, setMuted] = useState(!!me?.mutedPokes), [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { await socialApi.profile({ bio, goal, visibility, showInRankings: rank, mutedPokes: muted }); toast(t('Profile saved')); await reload() }
    catch (e) { toast(socialError(e)) } finally { setBusy(false) }
  }
  return <Section title={t('My profile in the network')} footer={t('Your weight, calories and workouts are never shared on their own. Only what you post.')}>
    <div className="social-person" style={{ borderTop: 0 }}>
      <span className="social-who"><Avatar person={{ ...me, name: user?.name }} size={48} />
        <span><b>{user?.name}</b><span className="small muted"> @{user?.username || '?'}</span></span></span>
      <Button size="sm" onClick={() => nav('/settings')}>{t('Change photo')}</Button>
    </div>
    <label className="social-field">{t('About you')}<input className="input" maxLength={240} value={bio} onChange={e => setBio(e.target.value)} placeholder={t('A little about you')} /></label>
    <label className="social-field">{t('Goal')}<input className="input" maxLength={100} value={goal} onChange={e => setGoal(e.target.value)} placeholder={t('Lose 5 kg, run 10 km…')} /></label>
    <div className="social-field">{t('Who sees my profile and posts')}
      <MenuButton title={t('Who sees my profile and posts')} value={visibility} onChange={setVisibility} className="menu-btn-wide" options={[
        { value: 'friends', label: t('Only my friends') },
        { value: 'public', label: t('Everyone on the app') },
        { value: 'private', label: t('Nobody (I do not post)') }
      ]} /></div>
    <label className="social-check"><input type="checkbox" checked={rank} onChange={e => setRank(e.target.checked)} />{t('Show me in the friends league')}</label>
    <label className="social-check"><input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} />{t('Do not let friends poke me')}</label>
    <Button variant="primary" disabled={busy} onClick={save}>{t('Save profile')}</Button>
  </Section>
}

function Challenges({ list, reload, me }) {
  const [title, setTitle] = useState(''), [days, setDays] = useState(30), [busy, setBusy] = useState(false)
  const run = async (fn, done) => { if (busy) return; setBusy(true); try { await fn(); if (done) toast(done); await reload() } catch (e) { toast(socialError(e)) } finally { setBusy(false) } }
  if (!list) return <div className="muted small">{t('Loading…')}</div>
  return <>
    <Section title={t('New challenge')} footer={t('Your friends see it and can join. Each day you log a workout, check in. Whoever checks in on the most days wins.')}>
      <form className="social-row" onSubmit={e => { e.preventDefault(); if (title.trim()) run(async () => { await socialApi.createChallenge({ title, days }); setTitle('') }, t('Challenge created')) }}>
        <input className="input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('e.g. 30 days without skipping')} />
        <MenuButton title={t('Length')} value={days} onChange={setDays} className="social-scope" options={[7, 14, 21, 30].map(n => ({ value: n, label: t('{0} days', n) }))} />
      </form>
      <div style={{ height: 8 }} />
      <Button variant="primary" disabled={busy || !title.trim()} onClick={() => run(async () => { await socialApi.createChallenge({ title, days }); setTitle('') }, t('Challenge created'))}>{t('Create challenge')}</Button>
    </Section>
    {!list.length && <div className="muted small">{t('No challenges yet. Create one and call your friends.')}</div>}
    {list.map(c => {
      const mine = c.standings.find(s => s.id === me.id)
      const pct = Math.round((c.ended ? c.days : c.day) / c.days * 100)
      return <div className="card social-challenge" key={c.id}>
        <div className="row between"><b>{c.title}</b><span className="small muted">{c.ended ? t('Finished') : t('Day {0} of {1}', c.day, c.days)}</span></div>
        <div className="small muted">{t('By {0}', c.ownerName)} · {fmtDate(c.start)} → {fmtDate(c.end)}</div>
        <div className="social-bar"><span style={{ width: pct + '%' }} /></div>
        {c.ended && <div className="social-winner">🏆 {c.winners.length
          ? t('Winner: {0}', c.standings.filter(s => c.winners.includes(s.id)).map(s => s.name).join(', '))
          : t('Nobody checked in this time.')}</div>}
        <ol className="social-standings">
          {c.standings.map((s, i) => <li key={s.id} className={s.id === me.id ? 'me' : ''}>
            <span>{i + 1}. {s.name}{c.winners.includes(s.id) ? ' 🏆' : ''}{c.checkedToday?.[s.id] && !c.ended ? ' ✓' : ''}</span>
            <b>{t('{0} of {1} days', s.days, c.days)}</b>
          </li>)}
        </ol>
        {!c.ended && <div className="social-row">
          {c.joined ? <>
            <Button variant="primary" disabled={busy || c.checkedToday?.[me.id]} onClick={() => run(() => socialApi.checkinChallenge(c.id), t('Check-in done. Keep going!'))}>
              {c.checkedToday?.[me.id] ? t('Checked in today') : t('Check in today')}</Button>
            <Button disabled={busy} onClick={() => run(() => socialApi.leaveChallenge(c.id))}>{t('Leave')}</Button>
          </> : <Button variant="primary" disabled={busy} onClick={() => run(() => socialApi.joinChallenge(c.id), t('You joined the challenge'))}>{t('Join')}</Button>}
        </div>}
        {c.ended && mine && <div className="small muted">{t('You checked in on {0} of {1} days.', mine.days, c.days)}</div>}
      </div>
    })}
  </>
}

const LEAGUE = [
  { key: 'workouts', label: () => t('Training days') },
  { key: 'volumeKg', label: () => t('Volume') },
  { key: 'streak', label: () => t('Streak') },
  { key: 'goalProgress', label: () => t('Weight goal') }
]
function League({ ranking, reload, me, S }) {
  const [by, setBy] = useState('workouts'), [busy, setBusy] = useState(false)
  if (!ranking) return <div className="muted small">{t('Loading…')}</div>
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  const show = r => by === 'volumeKg' ? fmtNum(Math.round(unit === 'lb' ? r.volumeKg / 0.45359237 : r.volumeKg)) + ' ' + unit
    : by === 'goalProgress' ? r.goalProgress + '%'
    : by === 'streak' ? t('{0} days', r.streak) : t('{0} days', r.workouts)
  const rows = [...ranking.rows].sort((a, b) => (Number(b[by]) || 0) - (Number(a[by]) || 0))
  const poke = id => { if (busy) return; setBusy(true); socialApi.poke(id).then(() => toast(t('Poke sent'))).catch(e => toast(socialError(e))).finally(() => setBusy(false)) }
  return <>
    <Segmented value={by} onChange={setBy} options={LEAGUE.map(x => ({ value: x.key, label: x.label() }))} />
    <Section title={t('This week, since {0}', fmtDate(ranking.since))} footer={t('Only friends who chose to appear in the league. The week starts on Monday.')}>
      {rows.map((r, i) => <div className={'social-person' + (r.id === me.id ? ' me' : '')} key={r.id}>
        <span className="social-who"><span className="social-rank">{i === 0 && Number(r[by]) > 0 ? '🥇' : i === 1 && Number(r[by]) > 0 ? '🥈' : i === 2 && Number(r[by]) > 0 ? '🥉' : i + 1}</span>
          <Avatar person={r} size={36} /><span><b>{r.name}</b>{r.id === me.id && <span className="small muted"> ({t('you')})</span>}</span></span>
        <span className="row" style={{ gap: 8 }}><b>{show(r)}</b>{r.id !== me.id && <button type="button" className="iconbtn" aria-label={t('Poke')} disabled={busy} onClick={() => poke(r.id)}>👉</button>}</span>
      </div>)}
      {rows.length < 2 && <div className="small muted" style={{ marginTop: 8 }}>{t('Invite friends to compete with them here.')}</div>}
    </Section>
    <Button size="sm" onClick={reload}>{t('Refresh')}</Button>
  </>
}
