import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { auditCat, auditLabel, auditReason, auditLine, auditAct, fmtWhen } from './audit.js'

// Every event name and reason code the server can emit, read off api/server.js itself rather
// than kept as a second list here: the hand-kept copy silently missed the three pairing events
// for several releases, and the dashboard printed 'auth.pair.create' at the operator (QA C18).
// If a new one is added there without a label here, the first test fails rather than the
// dashboard quietly printing a dotted identifier at a person.
const SERVER = readFileSync(new URL('../../../api/server.js', import.meta.url), 'utf8')
// Every quoted auth./admin./media. name, not only `audit(req, '…'`: a name with a hyphen
// ('admin.first-user') or one picked by a ternary slipped past that pattern and reached the
// dashboard raw.
const EVENTS = [...new Set([...SERVER.matchAll(/['"`]((?:auth|admin|media)\.[a-z0-9.-]+)['"`]/g)].map(m => m[1]))]
const REASONS = [...new Set([...SERVER.matchAll(/msg: '([a-z-]+)'/g)].map(m => m[1]))]

describe('auditLabel', () => {
  it('has a sentence for every event the server emits', () => {
    expect(EVENTS).toContain('admin.first-user')
    for (const ev of EVENTS) {
      expect(auditLabel(ev), ev).not.toBe(ev)
      expect(auditLabel(ev)).toMatch(/^[A-Z]/)
    }
  })

  it('shows an unknown event raw instead of rendering undefined', () => {
    // A dashboard one version behind the server must still say something truthful.
    expect(auditLabel('auth.something.new')).toBe('auth.something.new')
    expect(auditLabel(undefined)).toBe('Evento desconhecido')
    expect(auditLabel('')).toBe('Evento desconhecido')
  })
})

describe('auditCat', () => {
  it('takes the filter category from the first segment', () => {
    expect(auditCat('auth.login.ok')).toBe('auth')
    expect(auditCat('admin.invite.create')).toBe('admin')
  })
  it('survives a missing event name', () => {
    expect(auditCat(undefined)).toBe('')
  })
  // `media` is the third: the photo and video clean-up and throttle. It has no chip of its own —
  // those rows show under All, and a throttle under Failed.
  it('puts every known event in auth, admin or media', () => {
    expect([...new Set(EVENTS.map(auditCat))].sort()).toEqual(['admin', 'auth', 'media'])
  })
})

describe('auditReason', () => {
  it('has plain English for every reason code', () => {
    for (const m of REASONS) {
      expect(auditReason(m), m).not.toBe(m)
      expect(auditReason(m).length).toBeGreaterThan(3)
    }
  })
  it('says what a throttle pause was for, including the kind the server passes in a variable', () => {
    expect(auditLine({ ev: 'auth.throttled', ok: false, msg: 'signup' }).sub).toMatch(/convites errados/)
    expect(auditLine({ ev: 'auth.throttled', ok: false, msg: 'password' }).sub).toMatch(/senhas ou códigos/)
    expect(auditLine({ ev: 'auth.throttled', ok: false, msg: 'link' }).sub).toMatch(/códigos de aparelho/)
    expect(auditLine({ ev: 'auth.throttled', ok: false, msg: 'email' }).sub).toMatch(/e-mails já em uso/)
  })
  it('falls back to the raw code and tolerates none at all', () => {
    expect(auditReason('brand-new-code')).toBe('brand-new-code')
    expect(auditReason(undefined)).toBe('')
  })
})

describe('auditLine', () => {
  it('reads the server lists off api/server.js, pairing events included', () => {
    // Guards the extraction itself: an empty match would make the two loops above vacuous.
    expect(EVENTS).toEqual(expect.arrayContaining(['auth.login.ok', 'auth.pair.create', 'auth.pair.ok', 'auth.pair.fail', 'admin.audit.clear']))
    expect(REASONS).toEqual(expect.arrayContaining(['challenge-expired', 'code-invalid', 'user-unavailable']))
    expect(auditLine({ ev: 'auth.pair.fail', ok: false, msg: 'code-invalid' })).toEqual({ title: 'Falha no pareamento', sub: 'desconhecido · código de pareamento errado ou vencido' })
    expect(auditLine({ ev: 'auth.pair.ok', ok: true, name: 'Verifier' })).toEqual({ title: 'Pareou um celular', sub: 'Verifier' })
  })

  it('reads the passkey and device-code events, including the refusals passed on from passkeys-store.js (#95)', () => {
    expect(EVENTS).toEqual(expect.arrayContaining(['auth.passkey.add', 'auth.passkey.remove', 'auth.link.create', 'auth.link.ok', 'auth.link.fail']))
    expect(auditLine({ ev: 'auth.link.fail', ok: false, msg: 'link-invalid' })).toEqual({ title: 'Falha ao adicionar aparelho com código', sub: 'desconhecido · código de aparelho errado, usado ou vencido' })
    expect(auditLine({ ev: 'auth.passkey.fail', ok: false, name: 'Ana', msg: 'passkey-limit' }).sub).toBe('Ana · o perfil já tem o máximo de passkeys')
    expect(auditLine({ ev: 'auth.passkey.add', ok: true, name: 'Ana', msg: 'password' })).toEqual({ title: 'Adicionou uma passkey', sub: 'Ana · password' })
    expect(auditLine({ ev: 'auth.passkey.fail', ok: false, name: 'Ana', msg: 'credential-exists' }).sub).not.toMatch(/credential-exists/)
  })

  it('reads the sign-in e-mail events, whose line carries only a masked address', () => {
    // set/change are picked by a ternary the extraction above cannot read, like password set/change.
    expect(EVENTS).toEqual(expect.arrayContaining(['auth.email.remove', 'auth.email.fail']))
    expect(SERVER).toContain("first ? 'auth.email.set' : 'auth.email.change'")
    expect(auditLabel('auth.email.change')).toBe('Trocou o e-mail de acesso')
    expect(auditLine({ ev: 'auth.email.set', ok: true, name: 'Ana', msg: 'passkey · a…@e…' })).toEqual({ title: 'Adicionou um e-mail de acesso', sub: 'Ana · passkey · a…@e…' })
    expect(auditLine({ ev: 'auth.email.fail', ok: false, name: 'Ana', msg: 'email-taken' }).sub).toBe('Ana · outro perfil já usa esse e-mail')
    expect(auditLine({ ev: 'auth.password.fail', ok: false, msg: 'unknown-email' }).sub).toBe('desconhecido · nenhum perfil com senha tem esse e-mail')
  })

  it('names the person who did it', () => {
    expect(auditLine({ ev: 'auth.login.ok', ok: true, uid: 'u1', name: 'Duarte' }))
      .toEqual({ title: 'Entrou', sub: 'Duarte' })
  })

  it('shows both sides of an admin action', () => {
    const l = auditLine({ ev: 'admin.user.disable', ok: true, uid: 'a', name: 'Duarte', tgt: 'b', tname: 'Ana' })
    expect(l.title).toBe('Desativou uma conta')
    expect(l.sub).toBe('Duarte · → Ana')
  })

  it('translates the reason on a failure but not the invite code on a success', () => {
    expect(auditLine({ ev: 'auth.login.fail', ok: false, msg: 'unknown-credential' }).sub)
      .toBe('desconhecido · passkey desconhecida')
    // admin.invite.* put the actual code in msg — that must not be run through auditReason.
    expect(auditLine({ ev: 'admin.invite.create', ok: true, name: 'Duarte', msg: 'A1B2C3D4' }).sub)
      .toBe('Duarte · A1B2C3D4')
  })

  it('says "unknown caller" only when a failure carries no identity', () => {
    expect(auditLine({ ev: 'auth.login.fail', ok: false }).sub).toBe('desconhecido')
    // A successful event without a name is not an anonymous attacker, so it stays blank.
    expect(auditLine({ ev: 'auth.logout', ok: true }).sub).toBe('')
  })

  it('falls back to the uid when the name was never recorded', () => {
    expect(auditLine({ ev: 'auth.login.fail', ok: false, uid: 'Xy1', msg: 'user-missing' }).sub)
      .toBe('Xy1 · a passkey é de um perfil que não existe mais')
  })

  it('appends the network when the operator opted into IPs', () => {
    expect(auditLine({ ev: 'auth.login.ok', ok: true, name: 'Duarte', ip: '203.0.113.0/24' }).sub)
      .toBe('Duarte · 203.0.113.0/24')
  })

  it('renders nothing rather than throwing on a missing record', () => {
    expect(auditLine(undefined)).toEqual({ title: '', sub: '' })
  })
})

describe('fmtWhen', () => {
  const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).getTime()
  const now = at(2026, 8, 23, 15, 0)   // Sunday

  it('says "today" for the same calendar day', () => {
    expect(fmtWhen(at(2026, 8, 23, 9, 5), now)).toMatch(/^hoje /)
    expect(fmtWhen(at(2026, 8, 23, 0, 1), now)).toMatch(/^hoje /)
  })

  it('uses the weekday inside the last six days', () => {
    const s = fmtWhen(at(2026, 8, 21, 18, 30), now)
    expect(s).not.toMatch(/^today/)
    expect(s).toMatch(/^[A-Za-zÀ-ÿ.]+ \d/)
  })

  it('falls back to a date once it is older', () => {
    expect(fmtWhen(at(2026, 8, 12, 14, 32), now)).toMatch(/\d/)
    expect(fmtWhen(at(2026, 8, 12, 14, 32), now)).not.toMatch(/^today/)
  })

  it('always carries a time of day — that is the whole point of not reusing fmtDate', () => {
    for (const ts of [at(2026, 8, 23, 9, 5), at(2026, 8, 21, 18, 30), at(2026, 8, 12, 14, 32)]) {
      expect(fmtWhen(ts, now)).toMatch(/\d{1,2}[:.]\d{2}/)
    }
  })

  it('does not call a future timestamp "3 days ago"', () => {
    // Clock skew between server and browser is real; a tomorrow must not read as a weekday.
    expect(fmtWhen(at(2026, 8, 30, 10, 0), now)).not.toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)
  })

  it('returns an empty string for a missing timestamp', () => {
    expect(fmtWhen(0)).toBe('')
    expect(fmtWhen(undefined)).toBe('')
  })
})

// QA 1.3.9: a wrong current password while changing the e-mail or adding a passkey was logged as
// "Falha ao entrar com senha · senha atual errada while changing it". A failed proof is its
// own event now and names the change it was guarding.
describe('a failed proof of ownership', () => {
  const ACTS = [...new Set([...SERVER.matchAll(/proveOwner\(req, res, user, body, '([a-z-]+)'\)/g)].map(m => m[1]))]
  it('names every change the server asks a proof for', () => {
    expect(ACTS.length).toBeGreaterThanOrEqual(7)
    for (const act of ACTS) expect(auditAct(act), act).not.toBe(act)
  })
  it('reads as the change, not as a sign-in', () => {
    expect(auditLine({ ev: 'auth.proof.fail', ok: false, name: 'Ana', act: 'email', msg: 'bad-current' }))
      .toEqual({ title: 'Falha ao confirmar uma mudança', sub: 'Ana · trocar o e-mail de acesso · senha atual errada' })
    expect(auditLine({ ev: 'auth.proof.fail', ok: false, name: 'Ana', act: 'passkey-remove', msg: 'step-up-failed' }).sub)
      .toBe('Ana · remover uma passkey · a passkey que confirmava a mudança foi recusada')
  })
})
