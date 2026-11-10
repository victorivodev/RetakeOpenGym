// Rendering for the admin activity log (GET /api/admin/audit).
//
// The server stores reason codes, not sentences — `{ ev: 'auth.login.fail', msg: 'unknown-credential' }`
// rather than "someone tried a passkey we don't know". Turning those into words
// belongs here and not in Admin.jsx: it is the only part of the feature that can be wrong in a way
// a person sees, and as a plain module it is testable without mounting the dashboard.
//
// Like the rest of the admin screen, Retake Gym writes this in Brazilian Portuguese directly,
// outside the per-language string packs (see the header of views/Admin.jsx). Times still
// follow the UI language, the way numbers and dates already do.
import { dateLocale } from './i18n-core.js'

// The first segment of an event name is also the filter chip it belongs to.
export const auditCat = ev => String(ev || '').split('.')[0]

const LABELS = {
  'auth.login.ok': 'Entrou',
  'auth.login.fail': 'Falha ao entrar',
  'auth.register.ok': 'Criou um perfil',
  'auth.register.fail': 'Falha ao criar perfil',
  'auth.register.denied': 'Cadastro recusado',
  'auth.logout': 'Saiu',
  'auth.logout.all': 'Saiu de todos os aparelhos',
  // Settings → "Delete my account": the profile removed itself and everything of theirs.
  'auth.account.delete': 'Apagou a própria conta',
  // Device pairing (Settings → "Pair the mobile app"): the code is minted in a signed-in browser
  // tab and redeemed by the app, so "ok" is the phone coming online, not a sign-in.
  'auth.pair.create': 'Criou um código de pareamento',
  'auth.pair.ok': 'Pareou um celular',
  'auth.pair.fail': 'Falha no pareamento',
  'auth.watch.pair': 'Criou um código para relógio',
  'auth.watch.ok': 'Pareou um relógio Zepp OS',
  'auth.watch.fail': 'Falha ao parear relógio',
  'auth.watch.unlink': 'Desconectou um relógio',
  // Password sign-in (#118), where the instance offers it.
  'auth.password.ok': 'Entrou com senha',
  'auth.password.fail': 'Falha ao entrar com senha',
  'auth.password.locked': 'Entrada com senha pausada após várias falhas',
  'auth.password.set': 'Criou uma senha',
  'auth.password.change': 'Trocou a senha',
  'auth.password.remove': 'Removeu a senha',
  'auth.password.reset': 'Usou um código de redefinição',
  // The e-mail a profile may sign in with instead of its name. `msg` is the proof it was set with
  // and the address masked to two characters ("password · a…@e…") — never the address itself.
  'auth.email.set': 'Adicionou um e-mail de acesso',
  'auth.email.change': 'Trocou o e-mail de acesso',
  'auth.email.remove': 'Removeu o e-mail de acesso',
  'auth.email.fail': 'Falha ao trocar o e-mail de acesso',
  // More than one passkey, and one-time codes for another device (#95). `msg` on an addition or a
  // code is the proof it was made with (passkey, password); on a removal or a redemption, the
  // passkey's name.
  'auth.passkey.add': 'Adicionou uma passkey',
  'auth.passkey.fail': 'Falha ao adicionar passkey',
  'auth.passkey.remove': 'Removeu uma passkey',
  'auth.link.create': 'Criou um código para outro aparelho',
  'auth.link.ok': 'Adicionou um aparelho com código',
  'auth.link.fail': 'Falha ao adicionar aparelho com código',
  // Recovery codes (#584): made by an admin or by the server's own command, used on a new device.
  'auth.recovery.ok': 'Voltou a entrar com código de recuperação',
  'admin.recovery.create': 'Criou um código de recuperação',
  'server.recovery.create': 'Um código de recuperação foi criado no servidor',
  // The owner's proof (current password or a passkey) for one of the changes below was refused.
  'auth.proof.fail': 'Falha ao confirmar uma mudança',
  // The password throttle paused an address; `msg` says for what (password, signup).
  'auth.throttled': 'Muitas tentativas erradas do mesmo endereço',
  'admin.user.disable': 'Desativou uma conta',
  'admin.user.enable': 'Reativou uma conta',
  'admin.user.delete': 'Apagou uma conta',
  'admin.password.reset': 'Gerou um código de redefinição de senha',
  'admin.role.grant': 'Tornou alguém admin',
  'admin.role.revoke': 'Tirou alguém de admin',
  'admin.owner.transfer': 'Passou a posse do servidor',
  'admin.invite.create': 'Criou um código de convite',
  'admin.invite.revoke': 'Cancelou um código de convite',
  'admin.audit.clear': 'Limpou o registro de atividade',
  // FIRST_USER_ADMIN=1: the first profile on a fresh instance is made admin as it signs up.
  'admin.first-user': 'Virou admin como primeiro perfil',
  'admin.denied': 'Bloqueado numa ação de admin',
  // Photos and videos of custom exercises: "Reset everything" clearing a profile's files, and the
  // upload or clean-up throttle pausing a profile (`msg` says which).
  'media.sweep': 'Limpou fotos e vídeos sem uso',
  'media.throttled': 'Pedidos demais de fotos ou vídeos'
}
// An unknown event is shown raw rather than dropped or rendered as "undefined": a dashboard
// that is one version behind the server should still say *something* truthful.
export const auditLabel = ev => LABELS[ev] || String(ev || 'Evento desconhecido')

const REASONS = {
  'challenge-expired': 'a entrada demorou demais e expirou',
  'unknown-credential': 'passkey desconhecida',
  'verify-error': 'não deu para verificar a passkey',
  'not-verified': 'a passkey foi recusada',
  'user-missing': 'a passkey é de um perfil que não existe mais',
  'account-disabled': 'a conta está desativada',
  'credential-exists': 'essa passkey já pertence a um perfil',
  'invite-invalid': 'o convite foi usado ou cancelado nesse meio-tempo',
  'invite-rejected': 'convite errado ou já usado',
  'code-invalid': 'código de pareamento errado ou vencido',
  'user-unavailable': 'o perfil do código está desativado ou não existe',
  'bad-password': 'senha errada',
  'bad-current': 'senha atual errada',
  'unknown-name': 'nenhum perfil com senha tem esse nome',
  'unknown-email': 'nenhum perfil com senha tem esse e-mail',
  'email-taken': 'outro perfil já usa esse e-mail',
  'step-up-failed': 'a passkey que confirmava a mudança foi recusada',
  'reset-invalid': 'código de redefinição errado ou vencido',
  'link-invalid': 'código de aparelho errado, usado ou vencido',
  'passkey-limit': 'o perfil já tem o máximo de passkeys',
  // An `admin.denied` for a recovery code: only the owner makes one for an admin (#584).
  'recovery': 'código de recuperação para admin, que só o dono pode criar',
  // What an `auth.throttled` pause was for.
  'password': 'senhas ou códigos de redefinição errados',
  'signup': 'convites errados no cadastro com senha',
  'link': 'códigos de aparelho errados',
  'email': 'e-mails já em uso',
  // What a `media.throttled` pause was for.
  'upload': 'envio de fotos e vídeos',
  'sweep': 'limpeza de fotos e vídeos sem uso'
}
export const auditReason = msg => REASONS[msg] || (msg ? String(msg) : '')

// What an `auth.proof.fail` was confirming (the server's `act`).
const ACTS = {
  'email': 'trocar o e-mail de acesso',
  'email-remove': 'remover o e-mail de acesso',
  'password': 'criar ou trocar a senha',
  'password-remove': 'remover a senha',
  'passkey-add': 'adicionar uma passkey',
  'passkey-remove': 'remover uma passkey',
  'device-link': 'criar um código para outro aparelho',
  'pair': 'criar um código para parear o app do celular',
  'account-delete': 'apagar a própria conta'
}
export const auditAct = act => ACTS[act] || (act ? String(act) : '')

// → { title, sub }. `sub` is the house "a · b · c" metadata line used by every list row.
export function auditLine(e) {
  if (!e) return { title: '', sub: '' }
  const parts = []
  if (e.name) parts.push(e.name)
  else if (e.uid) parts.push(e.uid)
  else if (!e.ok) parts.push('desconhecido')
  if (e.tname) parts.push('→ ' + e.tname)
  if (e.act) parts.push(auditAct(e.act))
  // The reason codes and the invite codes share the msg field; only failures read as a reason.
  if (e.msg) parts.push(e.ok ? e.msg : auditReason(e.msg))
  if (e.ip) parts.push(e.ip)
  return { title: auditLabel(e.ev), sub: parts.join(' · ') }
}

// The activity log is the one place in the app that needs a clock, and fmtDate() renders none —
// it is used by every other view and is not worth changing for this.
export function fmtWhen(ts, now = Date.now()) {
  if (!ts) return ''
  const d = new Date(ts)
  const time = d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  const n = new Date(now)
  const sameDay = d.toDateString() === n.toDateString()
  if (sameDay) return 'hoje ' + time
  if (now - ts < 6 * 86400000 && ts <= now) return d.toLocaleDateString(dateLocale(), { weekday: 'short' }) + ' ' + time
  return d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) + ' ' + time
}
