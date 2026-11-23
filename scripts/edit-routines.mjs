#!/usr/bin/env node
/* Retake Gym: adds and removes exercises in a profile's routines, on the server.
 *
 *   node scripts/edit-routines.mjs --data <DATA_DIR> --user "<nome, e-mail ou @usuário>" --changes mudancas.json [--dry-run]
 *
 * For the owner of the server only, run on the server itself with the api stopped (the
 * "Editar rotinas (VPS)" workflow does it). The changes file lists, per routine:
 *
 *   { "routines": [
 *     { "match": "peito",                 // routine whose name contains this (no accents, any case)
 *       "add": [{ "exercise": "0405", "sets": 3, "reps": 10,
 *                 "before": "triceps",    // optional: goes before the first exercise with this target
 *                 "unlessName": "press" }],// optional: skipped if the routine has an exercise whose
 *                                          //   name (catalogue, Portuguese or custom) matches this regex
 *       "dropLast": { "target": "triceps", "keep": 2 } } ] }   // optional: removes the last ones
 *                                                              //   with this target beyond `keep`
 *
 * Or a routine can be given in full, in order, with "set" (then "add" and "dropLast" are ignored):
 *
 *     { "match": "perna", "set": [
 *       { "exercise": "3281", "keep": "agachamento.*smith|smith squat",   // `keep`: a slot of the
 *         "sets": 3, "repsMin": 10, "reps": 12, "restSec": 90 },          //   routine whose name
 *       { "exercise": "2393", "sets": 3, "repsMin": 20, "reps": 24,       //   matches stays (its
 *         "restSec": 60, "side": true } ] }                               //   exercise, weight, note,
 *                                                                         //   warm-ups); else `exercise`
 *   Slots of the routine that nothing in the list keeps are removed. `side` is per side: reps are
 *   both sides' total (lib/history.js), so "10-12 each arm" is repsMin 20, reps 24.
 *
 * An exercise the routine already has is never added twice. A superset is never split: an
 * exercise is inserted after the group, and a group left with one exercise stops being one.
 * Logged workouts are not touched. Written the way PUT /api/data writes a document (as
 * scripts/set-routine-style.mjs does), after copying the state file to state-<id>.json.bak-<time>.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = { data: null, user: null, id: null, repo: null, changes: null, dry: false }
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--data') opt.data = args[++i]
  else if (a === '--user') opt.user = args[++i]
  else if (a === '--id') opt.id = args[++i]
  else if (a === '--repo') opt.repo = args[++i]
  else if (a === '--changes') opt.changes = args[++i]
  else if (a === '--dry-run') opt.dry = true
}
if (!opt.data || (!opt.user && !opt.id) || !opt.changes) {
  console.error('uso: node edit-routines.mjs --data <DATA_DIR> --user "<nome|e-mail|@usuário>" --changes mudancas.json [--dry-run] [--repo <checkout>]')
  process.exit(2)
}
const repo = path.resolve(opt.repo || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
const mod = p => import(pathToFileURL(path.join(repo, p)).href)
const { EXIDX } = await mod('frontend/src/lib/exercises.js')
const { stampPut } = await mod('api/sync-stamps.js')
const { atomicWrite } = await mod('api/durable.js')
const ptNames = {}
for (const f of ['pt.json', 'pt-BR.json']) {
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(repo, 'catalogue/i18n', f), 'utf8')))) if (v?.name) ptNames[k] = v.name } catch { /* optional */ }
}

const WID_KEEP = 50 // server.js
const key = s => String(s || '').trim().toLowerCase().replace(/^@/, '')
const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const db = JSON.parse(fs.readFileSync(path.join(opt.data, 'db.json'), 'utf8'))
const users = db.users || []
const matches = opt.id ? users.filter(u => u.id === opt.id) : users.filter(u => [u.name, u.email, u.username].some(v => key(v) === key(opt.user)))
if (matches.length !== 1) {
  console.error(matches.length ? `Mais de um perfil chamado "${opt.user}"; use o id:` : `Nenhum perfil chamado "${opt.user || opt.id}". Perfis do servidor:`)
  for (const u of matches.length ? matches : users) console.error(`  --id ${u.id}   "${u.name}"${u.username ? ' @' + u.username : ''}${u.email ? ' ' + u.email : ''}`)
  process.exit(1)
}
const user = matches[0]
const file = path.join(opt.data, 'state-' + user.id.replace(/[^a-zA-Z0-9_-]/g, '') + '.json')
if (!fs.existsSync(file)) { console.error(`"${user.name}" ainda não tem dados no servidor.`); process.exit(1) }
const spec = JSON.parse(fs.readFileSync(opt.changes, 'utf8'))
const cur = JSON.parse(fs.readFileSync(file, 'utf8'))
const next = JSON.parse(JSON.stringify(cur))
const routines = (next.routines || []).filter(Boolean)
console.log(`Perfil: "${user.name}"${user.username ? ' @' + user.username : ''} (${user.id}), ${routines.length} rotina(s).`)

const custom = id => (next.customEx || []).find(c => c?.id === id)
const nameOf = id => custom(id)?.n || ptNames[id] || EXIDX[id]?.n || id
const namesOf = id => [custom(id)?.n, ptNames[id], EXIDX[id]?.n, ...[].concat((next.exAliases || {})[id] || [])].filter(x => typeof x === 'string' && x)
const targetOf = id => plain(custom(id)?.tg || EXIDX[id]?.tg || '')
const half = n => (n > 0 ? Math.round(n / 2) : n)
const repsTxt = e => {
  const lo = e.repsMin > 0 && e.repsMin < e.reps ? e.repsMin : null
  if (!e.side) return `${lo ? lo + '-' : ''}${e.reps ?? '?'}`
  return `${lo ? half(lo) + '-' : ''}${half(e.reps) ?? '?'} por lado`
}
const restTxt = e => (e.restOff ? ', sem descanso' : e.restSec > 0 ? `, descanso ${e.restSec}s` : '')
const setsOf = e => (e.mode === 'time' ? `${e.sets || 1}x${e.sec || 45}s` : `${e.sets || 1}x${repsTxt(e)}`)
const show = list => list.map((e, i) => `    ${i + 1}. ${nameOf(e.id)} ${setsOf(e)}${restTxt(e)}${e.weight ? ` @ ${e.weight}` : ''}`).join('\n')

// A superset tag left on one exercise is not a superset (session-routines.js groupIds).
const tidyGroups = list => {
  const count = {}
  for (const e of list) if (e.sg != null && e.sg !== '') count[e.sg] = (count[e.sg] || 0) + 1
  for (const e of list) if (e.sg != null && count[e.sg] < 2) delete e.sg
}

let changed = 0
for (const rule of spec.routines || []) {
  const r = routines.find(x => plain(x.name).includes(plain(rule.match)))
  if (!r) { console.log(`\n? Nenhuma rotina com "${rule.match}" no nome; pulada.`); continue }
  r.ex = Array.isArray(r.ex) ? r.ex : []
  const before = r.ex.map(e => ({ ...e }))
  const notes = []
  if (Array.isArray(rule.set)) {
    const left = r.ex.slice()
    const out = []
    for (const a of rule.set) {
      let slot = null
      if (a.keep) {
        const re = new RegExp(a.keep, 'i')
        const at = left.findIndex(e => e.id === a.exercise || namesOf(e.id).some(n => re.test(plain(n))))
        if (at >= 0) slot = left.splice(at, 1)[0]
      } else {
        const at = left.findIndex(e => e.id === a.exercise)
        if (at >= 0) slot = left.splice(at, 1)[0]
      }
      if (!slot && !EXIDX[a.exercise]) { notes.push(`? ${a.exercise} não está no catálogo; pulado`); continue }
      const cfg = slot ? { ...slot } : { id: a.exercise, weight: 0, mode: 'reps' }
      cfg.mode = 'reps'
      cfg.sets = a.sets || 3
      cfg.reps = a.reps || 10
      if (a.repsMin > 0 && a.repsMin < cfg.reps) cfg.repsMin = a.repsMin
      else delete cfg.repsMin
      if (a.side) cfg.side = true
      else delete cfg.side
      if (a.restSec > 0) { cfg.restSec = a.restSec; delete cfg.restOff }
      delete cfg.sg
      out.push(cfg)
      notes.push(slot ? `~ mantém ${nameOf(cfg.id)}: ${setsOf(cfg)}${restTxt(cfg)}` : `+ põe ${nameOf(cfg.id)} ${setsOf(cfg)}${restTxt(cfg)}`)
    }
    for (const e of left) notes.push(`- tira ${nameOf(e.id)}`)
    r.ex.splice(0, r.ex.length, ...out)
  } else if (rule.dropLast) {
    const t = plain(rule.dropLast.target)
    const idx = r.ex.map((e, i) => (targetOf(e.id) === t ? i : -1)).filter(i => i >= 0)
    const drop = idx.slice(Math.max(0, rule.dropLast.keep ?? idx.length))
    for (const i of drop.reverse()) { notes.push(`- tira ${nameOf(r.ex[i].id)}`); r.ex.splice(i, 1) }
    tidyGroups(r.ex)
  }
  for (const a of Array.isArray(rule.set) ? [] : rule.add || []) {
    if (!EXIDX[a.exercise]) { notes.push(`? ${a.exercise} não está no catálogo; pulado`); continue }
    if (r.ex.some(e => e.id === a.exercise)) { notes.push(`= ${nameOf(a.exercise)} já está na rotina`); continue }
    if (a.unlessName) {
      const re = new RegExp(a.unlessName, 'i')
      const has = r.ex.find(e => namesOf(e.id).some(n => re.test(plain(n))))
      if (has) { notes.push(`= ${nameOf(a.exercise)} pulado: a rotina já tem ${nameOf(has.id)}`); continue }
    }
    const cfg = { id: a.exercise, sets: a.sets || 3, reps: a.reps || 10, weight: 0, mode: 'reps' }
    if (a.repsMin > 0 && a.repsMin < cfg.reps) cfg.repsMin = a.repsMin
    let at = a.before ? r.ex.findIndex(e => targetOf(e.id) === plain(a.before)) : -1
    if (at < 0) at = r.ex.length
    while (at > 0 && at < r.ex.length && r.ex[at].sg != null && r.ex[at].sg === r.ex[at - 1].sg) at++
    r.ex.splice(at, 0, cfg)
    notes.push(`+ põe ${nameOf(a.exercise)} ${setsOf(cfg)}`)
  }
  const same = JSON.stringify(before) === JSON.stringify(r.ex)
  if (!same) changed++
  console.log(`\n${same ? '=' : '✓'} ${r.name}\n  Antes:\n${show(before)}\n  ${notes.join('\n  ')}${same ? '' : `\n  Depois:\n${show(r.ex)}`}`)
}

const rot = next.rotation
if (rot && Array.isArray(rot.sequence)) {
  const label = id => (id === 'rest' ? 'descanso' : routines.find(x => x.id === id)?.name || id)
  console.log(`\nRodízio (${next.scheduleMode || 'semana'}): ${rot.sequence.map(label).join(' → ')}`)
} else if (next.week) console.log(`\nSemana: ${JSON.stringify(next.week)}`)

console.log('')
if (!changed) { console.log('Nada para gravar.'); process.exit(0) }
if (opt.dry) { console.log(`--dry-run: ${changed} rotina(s) mudariam. Nada foi gravado.`); process.exit(0) }

// As PUT /api/data does for a write over the revision it read (server.js routes['PUT /api/data']).
const now = Date.now()
const report = {}
stampPut(cur, next, { overRead: true, stamped: false, report })
const curRev = cur._rev || 0
next._rev = curRev + (report.changed ? 2 : 1)
next._wids = [...(Array.isArray(cur._wids) ? cur._wids : []), ...(cur._wid ? [cur._wid] : [])].filter(x => typeof x === 'string').slice(-WID_KEEP)
next._wid = crypto.randomBytes(8).toString('hex')
const bak = `${file}.bak-${new Date(now).toISOString().replace(/[:.]/g, '-')}`
fs.copyFileSync(file, bak)
console.log(`Cópia de segurança: ${bak}`)
atomicWrite(file, JSON.stringify(next))
console.log(`Gravado: ${changed} rotina(s), revisão ${curRev} → ${next._rev}. Os aparelhos do perfil recebem na próxima sincronização.`)
