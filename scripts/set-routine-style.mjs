#!/usr/bin/env node
/* Retake Gym: gives a profile's routines their workout type from their reps, on the server.
 *
 *   node scripts/set-routine-style.mjs --data <DATA_DIR> --user "<nome, e-mail ou @usuário>" [--dry-run]
 *
 * For the owner of the server only, run on the server itself with the api stopped (see
 * docs/DEPLOY_PT.md, "Classificar o tipo dos treinos"). A one-off: the app sets the type itself
 * from then on (the routine's "Workout type", frontend/src/lib/routine-style.js).
 *
 * Each routine that has no type yet is read by frontend/src/lib/routine-style.js classifyRoutine:
 * by what its latest logged workout did (three quarters of the sets at 12 reps or more is "More
 * reps, less weight", at 8 to 10 stays "Normal"), and by its plan only when it was never trained.
 * Any other routine (fewer than 8, or 12s and 10s mixed) stays Normal and is listed, to be set by
 * hand. A routine
 * that already has a type is left as it is.
 *
 * Written the way PUT /api/data writes a document (as scripts/add-workouts.mjs does): the
 * server's stamps, a new revision and write id, temp file then rename, so every device of the
 * profile takes the change at its next sync. Before writing, the state file is copied next to
 * itself as state-<id>.json.bak-<time>. Running it again changes nothing.
 *
 * `--repo` is the repository checkout the app's own code is read from (default: the one this
 * file is in).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = { data: null, user: null, id: null, repo: null, dry: false }
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--data') opt.data = args[++i]
  else if (a === '--user') opt.user = args[++i]
  else if (a === '--id') opt.id = args[++i]
  else if (a === '--repo') opt.repo = args[++i]
  else if (a === '--dry-run') opt.dry = true
}
if (!opt.data || (!opt.user && !opt.id)) {
  console.error('uso: node set-routine-style.mjs --data <DATA_DIR> --user "<nome|e-mail|@usuário>" [--dry-run] [--repo <checkout>]')
  process.exit(2)
}
const repo = path.resolve(opt.repo || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
const mod = p => import(pathToFileURL(path.join(repo, p)).href)
const { classifyRoutine, styleOf, setStyle } = await mod('frontend/src/lib/routine-style.js')
const { stampPut } = await mod('api/sync-stamps.js')
const { atomicWrite } = await mod('api/durable.js')

const WID_KEEP = 50 // server.js
const key = s => String(s || '').trim().toLowerCase().replace(/^@/, '')
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
const cur = JSON.parse(fs.readFileSync(file, 'utf8'))
const next = JSON.parse(JSON.stringify(cur))
const routines = (next.routines || []).filter(Boolean)
console.log(`Perfil: "${user.name}"${user.username ? ' @' + user.username : ''} (${user.id}), ${routines.length} rotina(s).`)

const NAME = { normal: 'Normal', load: 'Mais carga, menos repetição', reps: 'Mais repetição, menos carga' }
const list = a => (a.length ? a.join(', ') : '-')
let changed = 0
const loose = []
for (const r of routines) {
  if (r.style) { console.log(`= ${r.name}: já é "${NAME[styleOf(r)]}", fica como está`); continue }
  const c = classifyRoutine(r, next.workouts || [])
  const why = `plano: ${list([...new Set(c.planned)])} reps; último treino: ${list(c.logged)}`
  if (c.style === 'reps') {
    setStyle(r, 'reps')
    changed++
    console.log(`✓ ${r.name}: "${NAME.reps}" (pelo ${c.from === 'plan' ? 'plano' : 'último treino'}; ${why})`)
  } else if (c.style === 'normal') {
    console.log(`  ${r.name}: Normal (${why})`)
  } else {
    loose.push(r.name)
    console.log(`? ${r.name}: não se encaixa, fica Normal (${why})`)
  }
}
if (loose.length) console.log(`Ficaram Normal sem encaixe: ${loose.join(', ')}. Ajuste no app se quiser (Plano → rotina → Tipo de treino).`)
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
