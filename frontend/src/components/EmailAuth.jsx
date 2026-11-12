// Retake Gym: signing in, creating an account and resetting a forgotten password with an e-mail
// and a password, on a server with EMAIL_LOGIN (GET /api/config → `email_login`). The one form
// both apps use: in a browser it talks to its own server and gets the session cookie
// (lib/api.js passwordLogin, passwordRegister, passwordResetRedeem); on the phone, `server` names
// the server and the same answers come back as a token (store connectToServer → api.js appAuth).
// The rules are the server's (api/server.js "user name", api/password.js); this only words them.
import { useEffect, useRef, useState } from 'react'
import { useStore, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { passwordLogin, passwordRegister, passwordResetRedeem } from '../lib/api.js'
import { askAddDeviceData } from '../sheets.jsx'
import { Button } from './ui.jsx'
import { MIN_PASSWORD, looksLikeEmail, passwordError } from './PasswordAuth.jsx'

export const emailLoginOn = config => !!config?.email_login
// The server's rule (USERNAME_RE in api/server.js): 3 to 20 lower-case letters, digits, "." or
// "_", no dot at either end and no two in a row. The server still decides.
export const foldUsername = s => String(s || '').normalize('NFKC').trim().toLowerCase().replace(/^@/, '')
export const looksLikeUsername = s => /^(?![.])(?!.*[.]$)(?!.*[.]{2})[a-z0-9._]{3,20}$/.test(foldUsername(s))
// A first suggestion from the name typed above it: "Ana Souza" → "ana.souza".
export const suggestUsername = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9._]/g, '').replace(/[.]{2,}/g, '.').replace(/^[.]+|[.]+$/g, '').slice(0, 20)

// The answers this form can get that the password sheet's wording does not cover.
export function accountError(e) {
  switch (e?.data?.code || e?.code) {
    case 'bad-credentials': return t('Wrong e-mail, user name or password.')
    case 'email-missing': return t('Enter your e-mail.')
    case 'username-missing': return t('Choose a user name.')
    case 'username-invalid': return t('A user name has 3 to 20 letters, numbers, dots or underscores.')
    case 'username-taken': return t('That user name is taken. Try another one.')
  }
  return passwordError(e)
}

const field = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }
const errStyle = { color: 'var(--red)', marginTop: 10, lineHeight: 1.45 }
const codeStyle = { letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }
const len = s => [...String(s || '')].length
const gap = <div style={{ height: 10 }} />

/* `server`: the phone's server (absolute address). Without it this is the web app on its own
   server. `onDone` runs once signed in. `start`: which form opens first. */
// A friend's invite link (Social → Invite a friend) opens sign-up with its code filled in.
const linkInvite = () => {
  try { return (new URLSearchParams(location.search).get('convite') || '').trim().toUpperCase().slice(0, 40) } catch { return '' }
}

export function EmailAuth({ server = null, onDone, start = 'signin' }) {
  const config = useStore(s => s.config)
  const [fromLink] = useState(linkInvite)
  const [mode, setMode] = useState(fromLink ? 'register' : start)   // 'signin' | 'register' | 'reset'
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [userTouched, setUserTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [invite, setInvite] = useState(fromLink)
  const [needInvite, setNeedInvite] = useState(!!fromLink || (!server && !!config?.invite_only))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  // The phone has no config of its server before it signs in: ask it whether sign-up needs an
  // invite, so the field is there from the start rather than after a refusal.
  useEffect(() => {
    if (!server) return
    let live = true
    fetch(server.replace(/\/$/, '') + '/api/config').then(r => r.json()).then(c => { if (live && c?.invite_only) setNeedInvite(true) }).catch(() => {})
    return () => { live = false }
  }, [server])
  const first = useRef(null)
  useEffect(() => { setErr(null); const tm = setTimeout(() => first.current?.focus?.(), 200); return () => clearTimeout(tm) }, [mode])

  const welcome = (u, created) => useUI.getState().toast(created ? t('Welcome, {0}', u.name) : t('Welcome back, {0}', u.name))

  // Web: the session cookie is set; the same steps as Login.jsx and PasswordAuth.jsx take.
  async function webDone(u, created) {
    const st = useStore.getState()
    if (created) {
      st.setUser(u)
      if (hasData(useStore.getState().S)) await st.pushState(); else await st.pullState()
    } else {
      st.setUser(u, { adopt: true })
      await st.adoptProfile(askAddDeviceData)
    }
    welcome(u, created)
  }
  // Phone: the token is kept with the server's address and the account adopted (store).
  async function phoneDone(kind, body) {
    await useStore.getState().connectToServer(server, { kind, body }, askAddDeviceData)
    const u = useStore.getState().user
    if (u) welcome(u, kind === 'register')
  }

  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    const reg = mode === 'register', reset = mode === 'reset'
    const mail = email.trim()
    const handle = foldUsername(username)
    const bad = reg
      ? (!name.trim() ? t('Enter your name.')
        : !looksLikeUsername(handle) ? t('A user name has 3 to 20 letters, numbers, dots or underscores.')
        : !looksLikeEmail(mail) ? t('That is not an e-mail address.')
        : needInvite && !invite.trim() ? t('An invite code is required')
        : len(pw) < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
        : pw !== again ? t('The two passwords are not the same.') : null)
      : reset
        ? (!id.trim() ? t('Enter your e-mail or user name.')
          : !code.trim() ? t('Enter the reset code.')
          : len(pw) < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
          : pw !== again ? t('The two passwords are not the same.') : null)
        : (!id.trim() ? t('Enter your e-mail or user name.') : !pw ? t('Enter your password.') : null)
    if (bad) { setErr(bad); return }
    setBusy(true); setErr(null)
    try {
      if (reg) {
        const body = { name: name.trim(), username: handle, email: mail, password: pw, code: invite.trim() }
        if (server) await phoneDone('register', body)
        else await webDone(await passwordRegister(body.name, pw, body.code, mail, handle), true)
      } else if (reset) {
        if (server) await phoneDone('password-reset', { identifier: id.trim(), code: code.trim(), next: pw })
        else await webDone(await passwordResetRedeem(id.trim(), code.trim(), pw), false)
      } else {
        if (server) await phoneDone('login', { identifier: id.trim(), password: pw })
        else await webDone(await passwordLogin(id.trim(), pw), false)
      }
      onDone?.()
    } catch (e) {
      if (e?.data?.code === 'invite') setNeedInvite(true)
      setErr(accountError(e))
    } finally { setBusy(false) }
  }

  const go = m => { setPw(''); setAgain(''); setMode(m) }
  const pwFields = (placeholder, autoComplete) => <>
    <input className="input" type="password" name="new-password" autoComplete={autoComplete} placeholder={placeholder}
      value={pw} onChange={e => setPw(e.target.value)} />
    {gap}
    <input className="input" type="password" name="new-password-again" autoComplete="new-password" placeholder={t('Repeat the password')}
      value={again} onChange={e => setAgain(e.target.value)} />
    <div className="dim small" style={{ marginTop: 6, textAlign: 'start' }}>{t('At least {0} characters. A few unrelated words make a good one.', MIN_PASSWORD)}</div>
  </>

  return <div style={{ textAlign: 'start' }}>
    {mode === 'signin' && <form onSubmit={submit} noValidate>
      <input ref={first} className="input" name="username" autoComplete="username" inputMode="email" placeholder={t('E-mail or user name')} maxLength={254}
        value={id} onChange={e => setId(e.target.value)} {...field} />
      {gap}
      <input className="input" type="password" name="password" autoComplete="current-password" placeholder={t('Password')}
        value={pw} onChange={e => setPw(e.target.value)} />
      {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{busy ? t('Signing in…') : t('Sign in')}</Button>
      <div style={{ height: 8 }} />
      <Button type="button" icon="plusCircle" onClick={() => go('register')} disabled={busy}>{t('Create account')}</Button>
      <Button type="button" variant="ghost" className="dim" onClick={() => go('reset')} disabled={busy}>{t('Forgot your password?')}</Button>
    </form>}

    {mode === 'register' && <form onSubmit={submit} noValidate>
      <h3 style={{ marginTop: 0 }}>{t('Create your account')}</h3>
      <input ref={first} className="input" name="name" autoComplete="name" placeholder={t('Your name')} maxLength={40}
        value={name} onChange={e => { setName(e.target.value); if (!userTouched) setUsername(suggestUsername(e.target.value)) }} />
      {gap}
      <div style={{ position: 'relative' }}>
        <span className="dim" style={{ position: 'absolute', insetInlineStart: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>@</span>
        <input className="input" name="nickname" autoComplete="nickname" placeholder={t('user name')} maxLength={21}
          value={username} onChange={e => { setUserTouched(true); setUsername(e.target.value.toLowerCase()) }} {...field} style={{ paddingInlineStart: 30 }} />
      </div>
      <div className="dim small" style={{ marginTop: 6 }}>{t('Unique. Your friends will find you by it.')}</div>
      {gap}
      <input className="input" type="email" name="email" autoComplete="email" inputMode="email" placeholder={t('E-mail')} maxLength={254}
        value={email} onChange={e => setEmail(e.target.value)} {...field} />
      {gap}
      {pwFields(t('Password'), 'new-password')}
      {needInvite && <>
        {gap}
        <input className="input" placeholder={t('Invite code')} maxLength={40} value={invite}
          onChange={e => setInvite(e.target.value.toUpperCase())} style={codeStyle} {...field} />
        <div className="dim small" style={{ marginTop: 6 }}>{t('This app is invite-only. Enter the code you were given.')}</div>
      </>}
      {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{busy ? t('Creating…') : t('Create account')}</Button>
      <div style={{ height: 8 }} />
      <Button type="button" variant="ghost" className="dim" onClick={() => go('signin')} disabled={busy}>{t('I already have an account')}</Button>
    </form>}

    {mode === 'reset' && <form onSubmit={submit} noValidate>
      <h3 style={{ marginTop: 0 }}>{t('Reset your password')}</h3>
      <div className="muted small" style={{ marginBottom: 14, lineHeight: 1.5 }}>
        {t('Ask the app’s admin for a reset code. Then enter it here with a new password. It signs you out everywhere else.')}
      </div>
      <input ref={first} className="input" name="username" autoComplete="username" inputMode="email" placeholder={t('E-mail or user name')} maxLength={254}
        value={id} onChange={e => setId(e.target.value)} {...field} />
      {gap}
      <input className="input" name="reset-code" autoComplete="one-time-code" placeholder={t('Reset code')} maxLength={20}
        value={code} onChange={e => setCode(e.target.value.toUpperCase())} {...field} style={codeStyle} />
      {gap}
      {pwFields(t('New password'), 'new-password')}
      {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{t('Set password & sign in')}</Button>
      <div style={{ height: 8 }} />
      <Button type="button" variant="ghost" className="dim" onClick={() => go('signin')} disabled={busy}>{t('Back to sign-in')}</Button>
    </form>}
  </div>
}
