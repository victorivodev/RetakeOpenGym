import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtDate, fmtNum, fmtVol, fmtDur } from '../lib/format.js'
import { auditCat, auditLine, fmtWhen } from '../lib/audit.js'
import { workoutVolume, setsDone } from '../lib/history.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import AdminCoach from './AdminCoach.jsx'
import '../admin.css'

// Admin-only operator dashboard (owner passkey + admin flag; guarded again server-side).
// Upstream keeps this English-only, outside the string packs; Retake Gym writes it in Brazilian
// Portuguese directly, since its admins are Portuguese speakers.
//
// One page of cards, each opening with a sentence that says what it is for. An operator who
// looks at this twice a year should not have to remember what "synced 3d ago" or an invite
// code means.

const rel = ts => {
  if (!ts) return 'nunca'
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min'
  if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h'
  return 'há ' + Math.floor(s / 86400) + ' d'
}
const dur = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min' }

// The one time the reset code is visible. Locked, so a tap beside the sheet cannot lose it
// before it has been copied or written down.
function ResetCodeSheet({ name, email, code, expires, close }) {
  const toast = useUI(s => s.toast)
  const copy = () => { navigator.clipboard?.writeText(code).catch(() => {}); toast('Copiado') }
  return <>
    <h3>Código de redefinição de {name}</h3>
    <div className="adm-lead">Passe este código para a pessoa. Ela escolhe “Entrar com senha” → “Tem um código do admin?”, digita o nome <b>{name}</b>{email && <> (ou o e-mail de acesso <b>{email}</b>)</>}, o código e uma senha nova. Funciona uma vez, até {new Date(expires).toLocaleString()}, e não aparece de novo.</div>
    <button className="adm-code" style={{ fontSize: 'var(--fs-title2)', width: '100%', padding: '14px 0' }} onClick={copy} aria-label="copiar código">{code}</button>
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={close}>Pronto</Button>
  </>
}

// The one time a recovery code (#584) is visible. Locked like the reset code's sheet.
function RecoveryCodeSheet({ name, code, expires, close }) {
  const toast = useUI(s => s.toast)
  const copy = () => { navigator.clipboard?.writeText(code).catch(() => {}); toast('Copiado') }
  return <>
    <h3>Código de recuperação de {name}</h3>
    <div className="adm-lead">Passe este código para a pessoa. Na tela de entrada ela toca em “Perdeu o acesso?” → “Tenho um código” e digita o código; o aparelho que ela usar ganha uma passkey nova para <b>{name}</b> e já entra. No app do celular, ela faz isso primeiro no navegador e depois conecta o app de novo. Funciona uma vez, até {new Date(expires).toLocaleString()}, e não aparece de novo.</div>
    <button className="adm-code" style={{ fontSize: 'var(--fs-title2)', width: '100%', padding: '14px 0' }} onClick={copy} aria-label="copiar código">{code}</button>
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={close}>Pronto</Button>
  </>
}

function UserDetail({ id, viewerOwner, onChanged, close }) {
  const me = useStore(s => s.user)
  const [d, setD] = useState(null)
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  useEffect(() => { api('/api/admin/user?id=' + encodeURIComponent(id)).then(setD).catch(e => toast(e.message)) }, [id])
  if (!d) return <div className="muted small">Carregando…</div>
  const u = d.user
  // The document comes straight off the user's state file. PUT /api/data drops null and
  // shapeless entries now, but a file written before it did still answers with them, and this
  // sheet renders outside the route's ErrorBoundary: one throw here blanked the whole app and
  // left exactly this account un-disableable. setsDone/workoutVolume walk entries and sets, so
  // an entry that lacks either has nothing to show and is skipped rather than drawn.
  const workouts = (d.workouts || []).filter(w => w && Array.isArray(w.entries) && w.entries.every(e => e && Array.isArray(e.sets)))
  // Their whole record as the admin API already returns it — the export the delete sheet offers.
  const exportUser = () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `opengym-${u.name.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}-${u.id}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const doDelete = () => {
    api('/api/admin/user/delete', { method: 'POST', body: JSON.stringify({ id: u.id }) })
      .then(() => { toast('Conta apagada'); onChanged(); close() })
      .catch(e => toast(e.message))
  }
  const setDisabled = disabled => {
    api('/api/admin/user/disable', { method: 'POST', body: JSON.stringify({ id: u.id, disabled }) })
      .then(() => { toast(disabled ? 'Usuário desativado' : 'Usuário reativado'); onChanged(); close() })
      .catch(e => toast(e.message))
  }
  // One owner, any number of admins: only the owner appoints, removes or hands the role on.
  const setRole = admin => api('/api/admin/user/role', { method: 'POST', body: JSON.stringify({ id: u.id, admin }) })
    .then(() => { toast(admin ? u.name + ' agora é admin' : u.name + ' não é mais admin'); onChanged(); close() })
    .catch(e => toast(e.message))
  const makeOwner = () => confirmSheet({
    title: 'Tornar ' + u.name + ' o dono?',
    message: 'A pessoa passa a poder fazer tudo o que você faz aqui, inclusive remover admins e limpar o registro de atividade. Você continua admin, mas só ela pode mudar isso.',
    confirmText: 'Passar a posse', danger: true,
    onConfirm: () => api('/api/admin/owner', { method: 'POST', body: JSON.stringify({ id: u.id }) })
      .then(() => { toast(u.name + ' agora é o dono do servidor'); onChanged(); close() })
      .catch(e => toast(e.message)),
  })
  // Password sign-in (#118): the server only sends `password` when the instance offers it. The
  // code comes back once, is shown once, and is never stored anywhere but as a hash.
  const pwInstance = typeof u.password === 'boolean'
  const resetPassword = () => confirmSheet({
    title: 'Redefinir a senha de ' + u.name + '?',
    message: 'Você recebe um código de uso único para passar à pessoa. A senha atual para de funcionar agora e ela sai de todos os aparelhos; as passkeys continuam valendo. Ela cria a senha nova com o código em “Entrar com senha”. O código aparece uma vez só e vale por 24 horas.',
    confirmText: 'Criar código',
    danger: true,
    onConfirm: () => api('/api/admin/user/password-reset', { method: 'POST', body: JSON.stringify({ id: u.id }) })
      .then(r => { onChanged(); close(); openSheet(done => <ResetCodeSheet name={r.name} email={u.email} code={r.code} expires={r.expires} close={done} />, { locked: true }) })
      .catch(e => toast(e.message)),
  })
  // A recovery code (#584): any admin for a profile that is not an admin, the owner for an admin;
  // the owner's own comes from the server command (recover.js). Not for oneself.
  const canRecover = !u.owner && !u.disabled && u.id !== me?.id && (!u.admin || viewerOwner)
  const makeRecovery = () => confirmSheet({
    title: 'Código de recuperação para ' + u.name + '?',
    message: 'Para quem perdeu todas as formas de entrar: sem aparelho, sem passkey e sem senha. Você recebe um código de uso único para passar à pessoa; o aparelho em que ela digitar o código ganha uma passkey nova. Ela sai de todos os aparelhos agora. As passkeys e a senha que já existem continuam. O código aparece uma vez só e vale por 24 horas.',
    confirmText: 'Criar código de recuperação',
    danger: true,
    onConfirm: () => api('/api/admin/user/recovery', { method: 'POST', body: JSON.stringify({ id: u.id }) })
      .then(r => { onChanged(); close(); openSheet(done => <RecoveryCodeSheet name={r.name} code={r.code} expires={r.expires} close={done} />, { locked: true }) })
      .catch(e => toast(e.message)),
  })
  return <>
    <h3 className="capitalize">{u.name}</h3>
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
      {u.owner ? <span className="adm-pill acc">dono</span> : u.admin && <span className="adm-pill acc">admin</span>}
      {u.disabled && <span className="adm-pill bad">desativado</span>}
      {u.invitedBy && <span className="adm-pill">convite {u.invitedBy}</span>}
      {u.password && <span className="adm-pill">senha</span>}
      {/* The sign-in e-mail (password instances only): shown to admins and nobody else. */}
      {u.email && <span className="adm-pill" title="e-mail de acesso">{u.email}</span>}
      {u.resetUntil && <span className="adm-pill acc">código de senha até {new Date(u.resetUntil).toLocaleString()}</span>}
      {u.recoveryUntil && <span className="adm-pill acc">código de recuperação até {new Date(u.recoveryUntil).toLocaleString()}</span>}
      <span className="adm-pill">entrou em {u.created ? fmtDate(u.created.slice(0, 10)) : '–'}</span>
    </div>
    <div className="tiles" style={{ textAlign: 'start' }}>
      <div className="tile"><div className="l">Treinos</div><div className="v v-sm">{workouts.length}</div></div>
      <div className="tile"><div className="l">Pesagens</div><div className="v v-sm">{d.bodyweight.length}</div></div>
      <div className="tile"><div className="l">Medidas</div><div className="v v-sm">{(d.measurements || []).length}</div></div>
      <div className="tile"><div className="l">Rotinas</div><div className="v v-sm">{d.routines.length}</div></div>
      <div className="tile"><div className="l">Última sincronização</div><div className="v" style={{ fontSize: 'var(--fs-subhead)' }}>{rel(d.lastSync)}</div></div>
    </div>
    {viewerOwner && !u.owner && !u.disabled && <>
      <button className="btn" style={{ margin: '12px 0 4px' }}
        onClick={() => u.admin
          ? confirmSheet({ title: 'Tirar ' + u.name + ' de admin?', message: 'A pessoa mantém a conta e os dados, mas perde acesso a esta página.', confirmText: 'Tirar de admin', danger: true, onConfirm: () => setRole(false) })
          : confirmSheet({ title: 'Tornar ' + u.name + ' admin?', message: 'A pessoa poderá ver todos os perfis deste servidor, desativar contas, gerar convites e configurar o Coach. Só você pode adicionar ou remover admins.', confirmText: 'Tornar admin', onConfirm: () => setRole(true) })}>
        {u.admin ? 'Tirar de admin' : 'Tornar admin'}</button>
      <div className="adm-hint">{u.admin ? 'Admins cuidam do servidor junto com você. Tire a função para poder apagar ou desativar a conta.' : 'Admins ajudam a cuidar do servidor. Você continua sendo o dono.'}</div>
      {u.admin && <>
        <button className="btn" style={{ margin: '14px 0 4px' }} onClick={makeOwner}>Tornar dono</button>
        <div className="adm-hint">Só existe um dono. Ao passar a posse, você vira um admin comum.</div>
      </>}
    </>}
    {!u.admin && <>
      <button className={'btn ' + (u.disabled ? 'primary' : 'danger')} style={{ margin: '12px 0 4px' }}
        onClick={() => u.disabled ? setDisabled(false)
          : confirmSheet({ title: 'Desativar ' + u.name + '?', message: 'A pessoa sai de todos os aparelhos e não consegue mais entrar nem sincronizar até ser reativada. Os dados ficam guardados.', confirmText: 'Desativar', danger: true, onConfirm: () => setDisabled(true) })}>
        {u.disabled ? 'Reativar conta' : 'Desativar conta'}</button>
      <div className="adm-hint">{u.disabled ? 'Reativar deixa a pessoa entrar e sincronizar de novo.' : 'Desativar tira a pessoa de todos os aparelhos e bloqueia a entrada. Nada é apagado.'}</div>
      {/* The one destructive action in the app (issue #107), so it asks twice and offers the
          export first — that history is theirs. The second step names the account again, because
          the first sheet can be dismissed by anyone who was not reading. */}
      <button className="btn danger" style={{ margin: '14px 0 4px' }}
        onClick={() => confirmSheet({
          title: 'Apagar ' + u.name + '?',
          message: 'Vai tudo embora: treinos, pesagens, rotinas, passkeys e notificações. Não dá para desfazer, e o convite que a pessoa usou continua gasto. Baixe os dados antes, se ela puder querer.',
          confirmText: 'Continuar',
          danger: true,
          onConfirm: () => confirmSheet({
            title: 'Apagar ' + u.name + ' de vez?',
            message: 'Última chance. Não tem como desfazer e o servidor não guarda cópia.',
            confirmText: 'Apagar conta',
            danger: true,
            onConfirm: doDelete,
          }),
        })}>Apagar conta</button>
      <button className="btn" style={{ marginBottom: 4 }} onClick={exportUser}>Baixar os dados da pessoa</button>
      <div className="adm-hint">Apagar remove a conta e todo o histórico de treinos dela deste servidor.</div>
      {pwInstance && <>
        <button className="btn" style={{ margin: '14px 0 4px' }} onClick={resetPassword}>Redefinir senha</button>
        <div className="adm-hint">{u.password
          ? 'Para senha esquecida: um código de uso único deixa a pessoa escolher uma nova. A senha atual para de funcionar na hora.'
          : 'Ainda sem senha. Um código de uso único deixa a pessoa criar uma. É o caminho de volta para quem perdeu a única passkey.'}</div>
      </>}
    </>}
    {canRecover && <>
      <button className="btn" style={{ margin: '14px 0 4px' }} onClick={makeRecovery}>Código de recuperação</button>
      <div className="adm-hint">Perdeu todos os aparelhos e a passkey? Um código de uso único dá a um aparelho novo uma passkey para este perfil. Funciona com ou sem senha.</div>
    </>}
    {u.owner && u.id !== me?.id && <div className="adm-hint" style={{ marginTop: 14 }}>Se o dono ficar sem acesso, o código de recuperação sai do próprio servidor: <code>docker compose exec api node recover.js "{u.name}"</code></div>}
    <h4 className="sec">Histórico de treinos</h4>
    {workouts.length ? <div className="list" style={{ gap: 0 }}>
      {workouts.slice(0, 60).map(w => <div key={w.id} className="row between" style={{ padding: '9px 2px', borderBottom: '1px solid var(--sep)' }}>
        <div><div className="small" style={{ fontWeight: 600 }}>{w.name}</div>
          <div className="dim" style={{ fontSize: 'var(--fs-caption2)' }}>{fmtDate(w.d, true)} · {fmtDur((w.end || w.start) - w.start)} · {setsDone(w)} séries{w.prs?.length ? ' · ' + w.prs.length + ' recorde' + (w.prs.length > 1 ? 's' : '') : ''}</div></div>
        <span className="small muted">{fmtVol(w.vol ?? workoutVolume(w), d.unit)}</span>
      </div>)}
    </div> : <div className="adm-empty">Nenhum treino registrado.</div>}
  </>
}

function InvitesCard({ invites, reload, inviteOnly }) {
  const toast = useUI(s => s.toast)
  const gen = () => api('/api/admin/invites/new', { method: 'POST', body: '{}' })
    .then(({ invite }) => { navigator.clipboard?.writeText(invite.code).catch(() => {}); toast('Código ' + invite.code + ' criado e copiado'); reload() })
    .catch(e => toast(e.message))
  const revoke = code => confirmSheet({
    title: 'Cancelar o código ' + code + '?', message: 'Quem tiver o código não consegue mais usar. Quem já criou perfil com ele não é afetado.',
    confirmText: 'Cancelar código', danger: true,
    onConfirm: () => api('/api/admin/invites/revoke', { method: 'POST', body: JSON.stringify({ code }) })
      .then(() => { toast('Código cancelado'); reload() }).catch(e => toast(e.message))
  })
  const copy = code => { navigator.clipboard?.writeText(code).catch(() => {}); toast('Copiado: ' + code) }
  const open = (invites || []).filter(i => !i.usedBy)
  const used = (invites || []).filter(i => i.usedBy)
  return <div className="card">
    <div className="row between"><h2 style={{ margin: 0 }}>Códigos de convite</h2>
      <Button variant="primary" size="sm" onClick={gen} icon="plus">Novo código</Button></div>
    <div className="adm-lead">
      {inviteOnly
        ? 'Cadastro só com convite: a pessoa precisa de um destes códigos para criar o perfil. Cada código funciona uma vez.'
        : 'O cadastro está aberto, então os códigos são opcionais. Eles só registram quem convidou quem.'}
    </div>
    {open.length ? <>
      <div className="adm-group-t">Não usados · toque para copiar</div>
      {open.map(i => <div key={i.code} className="row between" style={{ padding: '6px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
        <button className="adm-code" onClick={() => copy(i.code)} aria-label={'copiar ' + i.code}>{i.code}</button>
        <div className="row" style={{ gap: 4 }}>
          <button className="iconbtn adm-iconbtn" onClick={() => copy(i.code)} aria-label="copiar"><Icon name="copy" /></button>
          <button className="iconbtn adm-iconbtn" style={{ color: 'var(--red)' }} onClick={() => revoke(i.code)} aria-label="cancelar"><Icon name="trash" /></button>
        </div>
      </div>)}
    </> : null}
    {used.length ? <>
      <div className="adm-group-t" style={{ marginTop: open.length ? 12 : 0 }}>Já usados</div>
      {used.map(i => <div key={i.code} className="row between dim" style={{ padding: '6px 0', fontSize: 'var(--fs-footnote)' }}>
        <span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', letterSpacing: '.06em' }}>{i.code}</span><span>→ {i.usedByName || 'usado'}</span>
      </div>)}
    </> : null}
    {!open.length && !used.length && <div className="adm-empty">Nenhum código ainda. "Novo código" cria um e já copia.</div>}
  </div>
}

// Who signed in, who tried and failed, what an admin changed. A card rather than its own route:
// the dashboard is deliberately one page of cards, and the 95 % use of this is a glance at the
// last twenty events. Paging follows Library.jsx's house style — "Show more", not page numbers.
function AuditCard({ tick, owner }) {
  const toast = useUI(s => s.toast)
  const [meta, setMeta] = useState(null)      // last response minus the rows: total, retention, …
  const [rows, setRows] = useState([])
  const [cat, setCat] = useState('')

  const load = (c, before) => api('/api/admin/audit?limit=50&cat=' + c + (before ? '&before=' + before : ''))
    .then(r => { setMeta(r); setRows(x => (before ? x.concat(r.events) : r.events)) })
    .catch(e => toast(e.message))
  const pick = c => { setCat(c); setRows([]); setMeta(null); load(c) }
  // Reloads on mount and whenever the header's ↻ bumps the tick. Deliberately not on the 15s
  // poll that drives "training now": this is history, not presence.
  useEffect(() => { load(cat) }, [tick])

  const clear = () => confirmSheet({
    title: 'Limpar o registro de atividade?',
    message: 'Todos os eventos registrados são apagados. A limpeza em si fica registrada, para o buraco continuar visível.',
    confirmText: 'Limpar', danger: true,
    onConfirm: () => api('/api/admin/audit/clear', { method: 'POST', body: '{}' })
      .then(() => { toast('Registro de atividade limpo'); pick(cat) }).catch(e => toast(e.message))
  })

  if (meta && !meta.enabled) return null      // AUDIT_LOG=0 — the card isn't there at all

  return <div className="card">
    <div className="row between"><h2 style={{ margin: 0 }}>Registro de atividade</h2>
      {/* Clearing is the owner's alone: an admin could otherwise erase what they did. */}
      {owner && <button className="iconbtn adm-iconbtn" style={{ color: 'var(--red)' }} onClick={clear} aria-label="limpar registro"><Icon name="trash" /></button>}</div>
    <div className="adm-lead">
      Quem entrou, o que falhou e o que um admin mudou.
      {meta ? ' ' + fmtNum(meta.total) + ' eventos'
        + (meta.retention.days ? ', guardados por ' + meta.retention.days + ' dias' : '')
        + (meta.ip_mode === 'off' ? ', sem endereços IP' : '') + '.' : ''}
    </div>
    <div className="chips" style={{ marginBottom: 10 }}>
      {[['', 'Tudo'], ['auth', 'Entradas'], ['admin', 'Admin'], ['fail', 'Falhas']].map(([v, l]) =>
        <button key={v} className={'chip' + (cat === v ? ' on' : '')} onClick={() => pick(v)}>{l}</button>)}
    </div>
    {rows.map(e => {
      const line = auditLine(e)
      return <div key={e.id} className="row between" style={{ padding: '8px 2px', borderBottom: 'var(--hair) solid var(--sep)' }}>
        <div className="grow">
          <div className="small" style={{ fontWeight: 600 }}>{line.title}
            {/* a red pill, not a red row: twenty fumbled Face IDs in a row shouldn't read as an incident */}
            {!e.ok && <span className="adm-pill bad" style={{ marginInlineStart: 6 }}>falhou</span>}
            {auditCat(e.ev) === 'admin' && <span className="adm-pill acc" style={{ marginInlineStart: 6 }}>admin</span>}</div>
          {line.sub && <div className="dim" style={{ fontSize: 'var(--fs-caption2)' }}>{line.sub}</div>}
        </div>
        <span className="small muted" style={{ flex: 'none', marginInlineStart: 8 }}>{fmtWhen(e.ts, meta?.now)}</span>
      </div>
    })}
    {meta && !rows.length && <div className="adm-empty">Nada registrado ainda.</div>}
    {meta?.nextBefore && <div style={{ marginTop: 10 }}>
      <Button size="sm" onClick={() => load(cat, meta.nextBefore)}>Mostrar mais</Button></div>}
  </div>
}

export default function Admin() {
  const nav = useNavigate()
  // Opened from Settings → AI Coach (the hosted app's way to the Coach, which is the server's):
  // straight to the Coach card rather than the top of the page.
  const toCoach = useLocation().state?.section === 'coach'
  const coachRef = useRef(null)
  useEffect(() => {
    if (!toCoach) return
    const tm = setTimeout(() => coachRef.current?.scrollIntoView({ block: 'start' }), 50)
    return () => clearTimeout(tm)
  }, [toCoach])
  const user = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  const [users, setUsers] = useState(null)
  const [usersErr, setUsersErr] = useState(null)   // why the last load failed, until one succeeds
  const [invites, setInvites] = useState(null)
  const [inviteOnly, setInviteOnly] = useState(false)
  const [tick, setTick] = useState(0)          // the ↻ button; the activity log listens to it

  // A failed load, or an answer without a list, used to leave the page on "Loading…" for good —
  // with a toast every 15 seconds from the poll, or with nothing at all when the answer was
  // someone else's page. It says so where the list would be instead, and the poll (or ↻) keeps
  // trying; a list that did load stays up, marked as the last one that came through.
  const loadUsers = () => api('/api/admin/users')
    .then(d => {
      if (!Array.isArray(d?.users)) throw new Error('O servidor respondeu sem a lista de usuários.')
      setUsers(d.users); setInviteOnly(!!d.invite_only); setUsersErr(null)
    })
    .catch(e => setUsersErr(e.message || 'Não deu para carregar'))
  const loadInvites = () => api('/api/admin/invites').then(d => setInvites(d.invites)).catch(() => {})
  // poll every 15s so the "training now" section stays live without a manual refresh
  useEffect(() => { if (!user?.admin) return; loadUsers(); loadInvites(); const iv = setInterval(loadUsers, 15000); return () => clearInterval(iv) }, [])
  if (!user?.admin) return null

  // From the list rather than the stored session, which may predate a handover.
  const viewerOwner = !!(users || []).find(u => u.id === user.id)?.owner
  const openUser = id => openSheet(close => <UserDetail id={id} viewerOwner={viewerOwner} onChanged={loadUsers} close={close} />)
  const liveUsers = (users || []).filter(u => u.live)
  const activeCount = (users || []).filter(u => u.lastSync && Date.now() - u.lastSync < 7 * 86400000).length
  const disabledCount = (users || []).filter(u => u.disabled).length

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" data-back="/settings/account" onClick={() => nav('/settings/account')} aria-label="Voltar"><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ margin: 0 }}>Administração</h1>
        <div className="sub">{users ? users.length + ' usuários · ' + activeCount + ' ativos esta semana' : usersErr ? 'Não deu para carregar' : 'Carregando…'}</div></div>
      <button className="iconbtn" onClick={() => { loadUsers(); loadInvites(); setTick(n => n + 1) }} aria-label="atualizar">↻</button>
    </div>
    <div className="adm-intro">
      Tudo para cuidar deste servidor: quem usa, como as pessoas entram, o Coach de IA e o que aconteceu por aqui. Nada aqui mostra os treinos de ninguém além de contagens.
    </div>

    {usersErr && <div className="card" role="alert" style={{ borderColor: 'var(--red)' }}>
      <div className="row between"><h2 style={{ margin: 0 }}>{users ? 'A última atualização falhou' : 'Não deu para carregar os usuários'}</h2>
        <Button size="sm" icon="reset" onClick={loadUsers}>Tentar de novo</Button></div>
      <div className="adm-lead" style={{ marginBottom: 0 }}>
        {usersErr} {users ? 'A lista abaixo é a última que carregou.' : 'Tenta de novo a cada 15 segundos.'}
      </div>
    </div>}

    <div className="tiles" style={{ marginBottom: 12 }}>
      <div className="tile"><div className="l">Usuários</div><div className="v">{users ? users.length : '–'}</div></div>
      <div className="tile"><div className="l">Treinando agora</div><div className="v" style={{ color: liveUsers.length ? 'var(--acc)' : undefined }}>{users ? liveUsers.length : '–'}</div></div>
      <div className="tile"><div className="l">Ativos em 7 dias</div><div className="v">{users ? activeCount : '–'}</div></div>
      <div className="tile"><div className="l">Desativados</div><div className="v">{users ? disabledCount : '–'}</div></div>
    </div>

    {liveUsers.length > 0 && <div className="card" style={{ borderColor: 'var(--acc)' }}>
      <h2 className="row" style={{ margin: '0 0 2px', gap: 6 }}><Icon name="dot" style={{ fontSize: 10, color: 'var(--green)' }} />Treinando agora</h2>
      <div className="adm-lead">Treinos acontecendo agora. Toque num nome para ver detalhes.</div>
      {liveUsers.map(u => <div key={u.id} className="row between" style={{ padding: '8px 2px', borderBottom: 'var(--hair) solid var(--sep)' }} onClick={() => openUser(u.id)}>
        <div><div className="small" style={{ fontWeight: 600 }}>{u.name}</div>
          <div className="dim" style={{ fontSize: 'var(--fs-caption2)' }}>{u.live.name} · exercício {u.live.exIdx} de {u.live.exTotal} · {u.live.setsDone}/{u.live.setsTotal} séries</div></div>
        <span className="adm-pill acc">{dur(Date.now() - u.live.startedAt)}</span>
      </div>)}
    </div>}

    {/* The Coach setup. Renders nothing at all unless the instance offers the Coach, so an admin
        page on a box that never enabled it is byte-for-byte the page it was before. */}
    <div ref={coachRef} className="adm-coach-anchor"><AdminCoach /></div>

    <InvitesCard invites={invites} reload={loadInvites} inviteOnly={inviteOnly} />

    <div className="card">
      <h2 style={{ margin: 0 }}>Usuários</h2>
      <div className="adm-lead">Todo mundo que tem perfil neste servidor. Toque num nome para ver a atividade, desativar a conta (nada é apagado) ou apagar de vez com todos os dados.</div>
      <div className="list">
        {(users || []).map(u => <div key={u.id} className="item" onClick={() => openUser(u.id)} style={u.disabled ? { opacity: .55 } : null}>
          <div className="grow"><div className="tt">{u.live && <Icon name="dot" style={{ fontSize: 9, color: 'var(--green)', display: 'inline-block', marginInlineEnd: 5 }} />}{u.name} {u.admin && <span className="adm-pill acc" style={{ marginInlineStart: 4 }}>{u.owner ? 'dono' : 'admin'}</span>}{u.disabled && <span className="adm-pill bad" style={{ marginInlineStart: 4 }}>desativado</span>}</div>
            <div className="ss">{u.live ? 'treinando agora · ' + u.live.name : u.workouts + ' treinos' + (u.lastWorkout ? ' · último em ' + fmtDate(u.lastWorkout) : '') + ' · sincronizou ' + rel(u.lastSync)}</div>
            {u.email && <div className="ss" title="e-mail de acesso">{u.email}</div>}</div>
          {u.hasPush && <Icon name="bell" title="notificações ligadas" style={{ fontSize: 'var(--fs-subhead)', color: 'var(--label-3)' }} />}<Icon name="chevronRight" className="chev" />
        </div>)}
        {users && !users.length && <div className="adm-empty">Nenhum usuário ainda.</div>}
      </div>
    </div>

    <div style={{ marginTop: 14 }}><AuditCard tick={tick} owner={viewerOwner} /></div>
  </div>
}
