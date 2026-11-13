#!/usr/bin/env node
/* Retake Gym: files workouts someone did (and wrote down) into a profile's history, on the server.
 *
 *   node scripts/add-workouts.mjs --data <DATA_DIR> --user "<nome, e-mail ou @usuário>" --input treinos.json [--dry-run]
 *
 * For the owner of the server only, run on the server itself with the api stopped (see
 * docs/DEPLOY_PT.md, "Lançar treinos de alguém"). Each workout in the input is the MCP server's
 * log_workout description (frontend/src/lib/log-workout.js buildLoggedWorkout):
 *
 *   [{ "date": "2026-11-10", "name": "Perna", "exercises": [
 *       { "exercise": "0597", "sets": [{ "weight": 43, "reps": 12 }, ...] }, ... ] }, ...]
 *
 * It is built and filed exactly as log_workout files one (PR badges against the history around
 * it, custom exercises, sync stamps), then written the way PUT /api/data writes a document: the
 * server's stamps, a new revision and write id, temp file then rename. Every device of the
 * profile sees the revision move and reads the history again. A workout already there (same
 * request, or the same day with the same sets) is skipped, and so is a day that already has
 * another workout unless --force. Before writing, the state file is copied next to itself as
 * state-<id>.json.bak-<time>.
 *
 * `--repo` is the repository checkout the app's own code is read from (default: the one this
 * file is in). Times are read in TZ (set TZ=America/Sao_Paulo).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = { data: null, user: null, id: null, input: null, repo: null, dry: false, force: false }
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--data') opt.data = args[++i]
  else if (a === '--user') opt.user = args[++i]
  else if (a === '--id') opt.id = args[++i]
  else if (a === '--input') opt.input = args[++i]
  else if (a === '--repo') opt.repo = args[++i]
  else if (a === '--dry-run') opt.dry = true
  else if (a === '--force') opt.force = true
}
if (!opt.data || (!opt.user && !opt.id) || !opt.input) {
  console.error('uso: node add-workouts.mjs --data <DATA_DIR> --user "<nome|e-mail|@usuário>" --input treinos.json [--dry-run] [--force] [--repo <checkout>]')
  process.exit(2)
}
const repo = path.resolve(opt.repo || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
const mod = p => import(pathToFileURL(path.join(repo, p)).href)
const { buildLoggedWorkout, appendLoggedWorkout } = await mod('frontend/src/lib/log-workout.js')
const { stampPut } = await mod('api/sync-stamps.js')
const { atomicWrite } = await mod('api/durable.js')

const WID_KEEP = 50 // server.js
const key = s => String(s || '').trim().toLowerCase().replace(/^@/, '')

const db = JSON.parse(fs.readFileSync(path.join(opt.data, 'db.json'), 'utf8'))
const users = db.users || []
const matches = opt.id
  ? users.filter(u => u.id === opt.id)
  : users.filter(u => [u.name, u.email, u.username].some(v => key(v) === key(opt.user)))
if (matches.length !== 1) {
  console.error(matches.length ? 'Mais de um perfil com esse nome; use --id:' : `Nenhum perfil chamado "${opt.user || opt.id}". Perfis do servidor:`)
  for (const u of matches.length ? matches : users) console.error(`  --id ${u.id}   "${u.name}"${u.username ? ' @' + u.username : ''}${u.email ? ' ' + u.email : ''}`)
  process.exit(1)
}
const user = matches[0]
const file = path.join(opt.data, 'state-' + user.id.replace(/[^a-zA-Z0-9_-]/g, '') + '.json')
const exists = fs.existsSync(file)
const cur = exists ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
console.log(`Perfil: "${user.name}"${user.username ? ' @' + user.username : ''} (${user.id}), ${(cur?.workouts || []).length} treinos no histórico.`)

const next = JSON.parse(JSON.stringify(cur || {}))
const inputs = JSON.parse(fs.readFileSync(opt.input, 'utf8'))
const now = Date.now()
const unit = next.unit === 'lb' ? 'lb' : 'kg'
let added = 0, failed = false
for (const input of inputs) {
  const label = `${input.date} ${input.name || ''}`.trim()
  const built = buildLoggedWorkout(next, input, { now, unit: 'kg' })
  if (built.problems) {
    failed = true
    console.error(`✗ ${label}: não deu para montar`)
    for (const p of built.problems) console.error('   ', JSON.stringify(p))
    continue
  }
  const sameDay = (next.workouts || []).filter(w => w && w.d === input.date)
  const res = sameDay.length && !opt.force ? null : appendLoggedWorkout(next, built, { now })
  if (!res) {
    const dup = sameDay.find(w => w.id === built.workout.id)
    console.log(`- ${label}: pulado, ${dup ? 'já está no histórico' : `o dia já tem ${sameDay.map(w => `"${w.name}"`).join(', ')} (use --force para lançar mesmo assim)`}`)
    continue
  }
  if (!res.added) { console.log(`- ${label}: pulado, já está no histórico`); continue }
  added++
  console.log(`✓ ${label}${res.workout.prs?.length ? `, ${res.workout.prs.length} recorde(s)` : ''}`)
  for (const r of built.resolved) {
    const e = res.workout.entries.find(x => x.id === r.id)
    console.log(`    ${r.name}${r.created ? ' (novo exercício)' : ''}: ${e.sets.map(s => `${s.w}×${s.r}`).join('  ')}`)
  }
}
if (failed) { console.error('Nada foi gravado: corrija o arquivo de entrada.'); process.exit(1) }
if (!added) { console.log('Nada novo para gravar.'); process.exit(0) }
if (unit !== 'kg') console.log('Aviso: o perfil usa lb; as cargas foram convertidas de kg.')
if (opt.dry) { console.log(`--dry-run: ${added} treino(s) seriam gravados. Nada foi mudado.`); process.exit(0) }

// As PUT /api/data does for a write over the revision it read (server.js routes['PUT /api/data']).
const report = {}
stampPut(cur, next, { overRead: true, stamped: false, report })
const curRev = cur?._rev || 0
next._rev = curRev + (report.changed ? 2 : 1)
next._wids = [...(Array.isArray(cur?._wids) ? cur._wids : []), ...(cur?._wid ? [cur._wid] : [])].filter(x => typeof x === 'string').slice(-WID_KEEP)
next._wid = crypto.randomBytes(8).toString('hex')
if (exists) {
  const bak = `${file}.bak-${new Date(now).toISOString().replace(/[:.]/g, '-')}`
  fs.copyFileSync(file, bak)
  console.log(`Cópia de segurança: ${bak}`)
}
atomicWrite(file, JSON.stringify(next))
console.log(`Gravado: ${added} treino(s), revisão ${curRev} → ${next._rev}. Os aparelhos do perfil recebem na próxima sincronização.`)
