import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { socialApi, setAvatar, getAvatar } from '../lib/api.js'
import { Button, Section } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import './Social.css'
import { mealsList, sumMacros } from '../lib/nutrition.js'

const kinds = ['workout', 'meal', 'weight', 'record']
function compactPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 640 / Math.max(image.width, image.height)), canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      let result = ''
      for (const quality of [.72, .55, .4]) { result = canvas.toDataURL('image/jpeg', quality); if (result.length <= 100000) break }
      result.length <= 100000 ? resolve(result) : reject(new Error('Choose a smaller photo.'))
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open photo.')) }
    image.src = url
  })
}
export default function Social() {
  const user = useStore(s => s.user)
  const S = useStore(s => s.S)
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [avatar, setAvatarView] = useState(null)
  const [search, setSearch] = useState(''), [selectedPerson, setSelectedPerson] = useState(null), [postPhoto, setPostPhoto] = useState(null)
  const [weightCard, setWeightCard] = useState(null)
  const [username, setUsername] = useState(''), [inviteCode, setInviteCode] = useState(''), [myInvite, setMyInvite] = useState(''), [bio, setBio] = useState(''), [goal, setGoal] = useState(''), [visibility, setVisibility] = useState('private'), [showInRankings, setShowInRankings] = useState(false), [mutedPokes, setMutedPokes] = useState(false)
  const [kind, setKind] = useState('workout'), [text, setText] = useState(''), [scope, setScope] = useState('friends')
  const [ranking, setRanking] = useState([]), [rankBy, setRankBy] = useState('workouts'), [challenges, setChallenges] = useState([]), [challengeTitle, setChallengeTitle] = useState(''), [challengeDays, setChallengeDays] = useState(30), [showCalories, setShowCalories] = useState(false), [weightFormat, setWeightFormat] = useState('percent')
  const reload = () => socialApi.get().then(d => { setData(d); setBio(d.me.bio); setGoal(d.me.goal); setVisibility(d.me.visibility); setShowInRankings(d.me.showInRankings); setMutedPokes(d.me.mutedPokes) }).catch(e => setError(e.message))
  useEffect(() => { reload(); socialApi.ranking().then(x => setRanking(x.rows || [])).catch(() => {}); socialApi.challenges().then(x => setChallenges(x.challenges || [])).catch(() => {}) }, [])
  useEffect(() => { const timer = setInterval(() => socialApi.get().then(setData).catch(() => {}), 30000); return () => clearInterval(timer) }, [])
  useEffect(() => { if (user?.id) getAvatar(user.id).then(x => setAvatarView(x.avatar)).catch(() => {}) }, [user?.id])
  const run = async fn => { setBusy(true); setError(''); try { await fn(); await reload() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const publishWorkout = () => {
    const last = S.workouts?.at(-1)
    if (!last) return
    const title = last.name || 'Workout completed'
    setKind('workout'); setText(`${title} · ${last.d || ''}`)
  }
  const publishMeal = meal => {
    const macros = sumMacros(meal.items)
    setKind('meal'); setText(`${meal.slot || 'Meal'} · ${meal.date}${showCalories ? ` · ${macros.kcal} kcal` : ''}`)
  }
  const shareWeightChange = () => {
    const points = [...(S.bodyweight || [])].filter(x => Number.isFinite(Number(x.w))).sort((a,b) => String(a.d).localeCompare(String(b.d)))
    if (points.length < 2) return
    const first = points[0].w, last = points.at(-1).w, diff = last - first, pct = first ? Math.round(diff / first * 1000) / 10 : 0
    setWeightCard({ from: points[0].d, to: points.at(-1).d, change: weightFormat === 'kg' ? `${diff > 0 ? '+' : ''}${Math.round(diff * 10) / 10} ${S.unit || 'kg'}` : `${pct > 0 ? '+' : ''}${pct}%` })
    setKind('weight'); setText(weightFormat === 'kg'
      ? `Weight change: ${diff > 0 ? '+' : ''}${Math.round(diff * 10) / 10} ${S.unit || 'kg'}`
      : `Weight change: ${pct > 0 ? '+' : ''}${pct}%`)
  }
  return <main className="page social-page">
    <header className="page-head"><span className="eyebrow">Retake Gym</span><h1>Community</h1><p>Train together, share only what you choose.</p></header>
    {error && <p role="alert" className="social-error">{error}</p>}
    <Section title="Your social profile">
      <div className="social-profile"><div className="social-avatar">{avatar ? <img src={avatar} alt="" /> : user?.name?.slice(0,1) || '?'}</div><div><strong>{user?.name}</strong><div>@{user?.username || 'username not set'}</div></div><label className="social-photo">Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (!file || file.size > 280000) { setError('Choose a photo under 280 KB.'); return } const reader = new FileReader(); reader.onload = async () => { try { await setAvatar(reader.result); setAvatarView(reader.result) } catch (x) { setError(x.message) } }; reader.readAsDataURL(file) }} /></label></div>
      <div className="social-muted">Training streak: {data?.me?.streak || 0} days</div>
      <label>Bio<input maxLength={240} value={bio} onChange={e => setBio(e.target.value)} placeholder="A little about you" /></label>
      <label>Training goal<input maxLength={100} value={goal} onChange={e => setGoal(e.target.value)} placeholder="Your goal" /></label>
      <label>Who can see your profile<select value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">Private</option><option value="friends">Friends</option><option value="public">Public</option></select></label>
      <label className="social-check"><input type="checkbox" checked={showInRankings} onChange={e => setShowInRankings(e.target.checked)} />Include my results in friends rankings</label>
      <label className="social-check"><input type="checkbox" checked={mutedPokes} onChange={e => setMutedPokes(e.target.checked)} />Mute workout pokes</label>
      <p className="social-muted">Your weight, calories and workout details are never shared automatically.</p>
      <Button disabled={busy} onClick={() => run(() => socialApi.profile({ bio, goal, visibility, showInRankings, mutedPokes }))}>Save profile</Button>
    </Section>
    <Section title="Find friends">
      <form className="social-row" onSubmit={e => { e.preventDefault(); socialApi.get(search).then(setData).catch(e => setError(e.message)) }}><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search public profiles"/><Button>Search</Button></form>
      {data?.found?.map(p => <button className="social-person" key={p.id} onClick={() => setSelectedPerson(p)}>@{p.username} · {p.name}</button>)}
      {selectedPerson && <div className="social-post"><strong>{selectedPerson.name}</strong> @{selectedPerson.username}<p>{selectedPerson.bio}</p><p>{selectedPerson.goal}</p><small>{selectedPerson.streak} training days</small>{selectedPerson.relation === 'other' && <Button onClick={() => run(() => socialApi.friend(selectedPerson.username))}>Invite</Button>}</div>}
      <form className="social-row" onSubmit={e => { e.preventDefault(); run(() => socialApi.friend(username)).then(() => setUsername('')) }}><input value={username} onChange={e => setUsername(e.target.value)} placeholder="@username" /><Button disabled={busy || !username.trim()}>Invite</Button></form>
      <div className="social-row"><Button onClick={() => socialApi.makeInvite().then(x => { setMyInvite(x.code); navigator.clipboard?.writeText(x.code).catch(() => {}) }).catch(e => setError(e.message))}>Create friend code</Button>{myInvite && <code>{myInvite}</code>}</div>
      <form className="social-row" onSubmit={e => { e.preventDefault(); run(() => socialApi.redeemInvite(inviteCode)).then(() => setInviteCode('')) }}><input value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="Friend code"/><Button disabled={busy || !inviteCode.trim()}>Redeem</Button></form>
      {data?.incoming?.map(p => <div className="social-person" key={p.id}><span>@{p.username} · {p.name}</span><Button onClick={() => run(() => socialApi.accept(p.id))}>Accept</Button></div>)}
      {data?.people?.filter(p => p.relation === 'friend').map(p => <div className="social-person" key={p.id}><span>@{p.username} · {p.name}</span><button onClick={() => run(() => socialApi.removeFriend(p.id))}>Remove</button></div>)}
    </Section>
    <Section title="Share an update">
      {S.workouts?.length > 0 && <button className="social-suggest" onClick={publishWorkout}>Use my latest workout</button>}
      <div className="social-row"><select aria-label="Meal" onChange={e => { const m = mealsList(S.meals).find(x => x.id === e.target.value); if (m) publishMeal(m) }} value=""><option value="">Share a logged meal…</option>{mealsList(S.meals).slice(-15).reverse().map(m => <option key={m.id} value={m.id}>{m.date} · {m.slot}</option>)}</select><label className="social-check"><input type="checkbox" checked={showCalories} onChange={e => setShowCalories(e.target.checked)} />Show calories</label></div>
      {(S.bodyweight || []).length > 1 && <div className="social-row"><select aria-label="Weight progress format" value={weightFormat} onChange={e => setWeightFormat(e.target.value)}><option value="percent">Share percentage only</option><option value="kg">Share weight change</option></select><button className="social-suggest" onClick={shareWeightChange}>Prepare weight progress card</button></div>}
      {weightCard && kind === 'weight' && <div className="social-weight-card"><small>Weight progress</small><strong>{weightCard.change}</strong><span>{weightCard.from} → {weightCard.to}</span></div>}
      <div className="social-row"><select value={kind} onChange={e => setKind(e.target.value)}>{kinds.map(k => <option key={k} value={k}>{k}</option>)}</select><select value={scope} onChange={e => setScope(e.target.value)}><option value="friends">Friends</option><option value="public">Public</option></select></div>
      <textarea maxLength={500} value={text} onChange={e => setText(e.target.value)} placeholder="What would you like to share?" />
      <label>Photo<input type="file" accept="image/*" onChange={async e => { try { setPostPhoto(await compactPhoto(e.target.files[0])) } catch (x) { setError(x.message) } }} /></label>
      {postPhoto && <img className="social-preview" src={postPhoto} alt="Post preview" />}
      <Button disabled={busy || !text.trim()} onClick={() => run(async () => { await socialApi.publish({ kind, text, scope, photo: postPhoto }); setText(''); setPostPhoto(null) })}>Publish</Button>
    </Section>
    <Section title="Weekly friends league">
      <select value={rankBy} onChange={e => { const k = e.target.value; setRankBy(k); socialApi.ranking(k).then(x => setRanking(x.rows || [])) }}><option value="workouts">Workouts</option><option value="volume">Lifted volume</option><option value="streak">Training streak</option><option value="goalProgress">Weight goal progress %</option></select>
      <p className="social-muted">This week · friends opt in from their profile</p>
      {[...ranking].sort((a,b) => (Number(b[rankBy])||0)-(Number(a[rankBy])||0)).map((p,i) => <div className="social-person" key={p.id}><span>{i+1}. {p.name}{p.id === user?.id ? ' (you)' : ''}</span><b>{p[rankBy]}{rankBy === 'goalProgress' ? '%' : rankBy === 'workouts' ? ' workouts' : rankBy === 'volume' ? ` ${S.unit}` : ' days'}</b>{p.id !== user?.id && <button onClick={() => run(() => socialApi.poke(p.id))}>Poke</button>}</div>)}
    </Section>
    <Section title="Challenges">
      <form className="social-row" onSubmit={e => { e.preventDefault(); run(async () => { await socialApi.createChallenge({ title: challengeTitle, days: challengeDays }); setChallengeTitle(''); const x = await socialApi.challenges(); setChallenges(x.challenges || []) }) }}><input value={challengeTitle} onChange={e => setChallengeTitle(e.target.value)} placeholder="Challenge name"/><select value={challengeDays} onChange={e => setChallengeDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option></select><Button disabled={busy || !challengeTitle.trim()}>Create</Button></form>
      {challenges.map(c => { const ended = Date.now() >= new Date(c.start + 'T00:00:00Z').getTime() + c.days * 86400000; return <div className="social-person" key={c.id}><span><b>{c.title}</b><small> · {c.days} days · {c.members.length} members · {c.progress?.[user?.id]?.days || 0} check-ins{c.progress?.[user?.id]?.badge ? ` · ${c.progress[user.id].badge} badge` : ''}{ended ? ' · Ended' : ''}</small></span>{!ended && (c.members.includes(user?.id) ? <Button onClick={() => run(async () => { await socialApi.checkinChallenge(c.id); setChallenges((await socialApi.challenges()).challenges || []) })}>Check in</Button> : <Button onClick={() => run(async () => { await socialApi.joinChallenge(c.id); setChallenges((await socialApi.challenges()).challenges || []) })}>Join</Button>)}</div> })}
    </Section>
    <Section title="Friends feed">
      {data?.notifications?.map(n => <p className="social-post" key={n.id}>{n.name} te cutucou: bora treinar!</p>)}
      {!data?.posts?.length && <p className="social-muted">No posts yet. Share your first update or invite a friend.</p>}
      {data?.posts?.map(p => <article className="social-post" key={p.id}><div className="social-post-head"><strong>{p.author?.name || 'Member'}</strong><small>{new Date(p.at).toLocaleString()}</small></div><span className="social-tag">{p.kind}</span>{p.kind === 'weight' ? <div className="social-weight-card"><small>Weight progress</small><strong>{p.text.replace(/^Weight change:\s*/, '')}</strong></div> : <p>{p.text}</p>}{p.photo && <img className="social-preview" src={p.photo} alt="Shared training or meal" />}<div className="social-actions">{['💪','🔥','👏'].map(r => <button key={r} onClick={() => run(() => socialApi.react(p.id, r))}>{r} {Object.values(p.reactions || {}).filter(x => x === r).length || ''}</button>)}</div><div className="social-comments">{p.comments?.slice(-5).map(c => <p key={c.id}><b>{c.name}</b> {c.text}</p>)}</div><form className="social-row" onSubmit={e => { e.preventDefault(); const f = e.currentTarget; const v = new FormData(f).get('comment'); if (v) run(async () => { await socialApi.comment(p.id, v); f.reset() }) }}><input name="comment" maxLength={300} placeholder="Add a comment" /><button aria-label="Comment"><Icon name="chevronRight" /></button></form></article>)}
    </Section>
  </main>
}
