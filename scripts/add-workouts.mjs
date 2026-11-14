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
 * --plan-from "<outro perfil>" first copies that profile's routines (and the custom exercises
 * they use) into this one, as importing a shared plan does, skipping a routine this profile
 * already has by name. Each workout is then filed under the copied routine that matches it (same
 * name, else the most exercises in common), and each exercise under that routine's exercise whose
 * name (the exercise's own, a custom one or a nickname) best matches its `label`; the routine's
 * target weight becomes the heaviest weight logged. An exercise with no match keeps its own
 * `exercise`. The dry run prints every match, to check before writing.
 *
 * `--repo` is the repository checkout the app's own code is read from (default: the one this
 * file is in). Times are read in TZ (set TZ=America/Sao_Paulo).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = { data: null, user: null, id: null, input: null, repo: null, dry: false, force: false, planFrom: null }
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--data') opt.data = args[++i]
  else if (a === '--user') opt.user = args[++i]
  else if (a === '--id') opt.id = args[++i]
  else if (a === '--input') opt.input = args[++i]
  else if (a === '--repo') opt.repo = args[++i]
  else if (a === '--dry-run') opt.dry = true
  else if (a === '--force') opt.force = true
  else if (a === '--plan-from') opt.planFrom = args[++i]
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
const { EXIDX } = await mod('frontend/src/lib/exercises.js')
const ptNames = {}
for (const f of ['pt.json', 'pt-BR.json']) {
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(repo, 'catalogue/i18n', f), 'utf8')))) if (v?.name) ptNames[k] = v.name } catch { /* optional */ }
}

const WID_KEEP = 50 // server.js
const key = s => String(s || '').trim().toLowerCase().replace(/^@/, '')

const db = JSON.parse(fs.readFileSync(path.join(opt.data, 'db.json'), 'utf8'))
const users = db.users || []
function findUser(who, byId) {
  const matches = byId ? users.filter(u => u.id === byId) : users.filter(u => [u.name, u.email, u.username].some(v => key(v) === key(who)))
  if (matches.length === 1) return matches[0]
  console.error(matches.length ? `Mais de um perfil chamado "${who}"; use o id:` : `Nenhum perfil chamado "${who || byId}". Perfis do servidor:`)
  for (const u of matches.length ? matches : users) console.error(`  --id ${u.id}   "${u.name}"${u.username ? ' @' + u.username : ''}${u.email ? ' ' + u.email : ''}`)
  process.exit(1)
}
const stateFile = u => path.join(opt.data, 'state-' + u.id.replace(/[^a-zA-Z0-9_-]/g, '') + '.json')
const user = findUser(opt.user, opt.id)
const file = stateFile(user)
const exists = fs.existsSync(file)
const cur = exists ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
console.log(`Perfil: "${user.name}"${user.username ? ' @' + user.username : ''} (${user.id}), ${(cur?.workouts || []).length} treinos no histórico.`)

const next = JSON.parse(JSON.stringify(cur || {}))
const inputs = JSON.parse(fs.readFileSync(opt.input, 'utf8'))
const now = Date.now()

// Words of an exercise name, without accents, filler words or plural s, for matching.
const STOP = new Set(['com', 'na', 'no', 'de', 'da', 'do', 'e', 'a', 'o', 'em', 'ao', 'v', '2', 'the', 'with', 'sentada', 'sentado', 'maquina', 'cabo', 'polia', 'aparelho'])
const SYN = { halteres: 'halter', dumbbell: 'halter', legpress: 'leg press', triangulo: 'barra v', pulley: 'triceps polia', abdutora: 'abducao', abdutor: 'abducao', flexora: 'flexora', extensora: 'extensora', invertido: 'inverso', reto: '', direta: 'direta' }
const words = n => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
  .split(/\s+/).flatMap(w => (SYN[w] ?? w).split(' ')).map(w => w.replace(/s$/, '')).filter(w => w && !STOP.has(w))
const namesOf = (S, id) => {
  const c = (S.customEx || []).find(x => x?.id === id)
  const al = S.exAliases && S.exAliases[id]
  return [c?.n, ptNames[id], EXIDX[id]?.n, ...(Array.isArray(al) ? al : al ? [al] : [])].filter(x => typeof x === 'string' && x)
}
const score = (label, S, id) => {
  const a = words(label)
  if (!a.length) return 0
  return Math.max(0, ...namesOf(S, id).map(n => { const b = new Set(words(n)); return a.filter(w => b.has(w)).length / a.length }))
}

if (opt.planFrom) {
  const from = findUser(opt.planFrom)
  const src = JSON.parse(fs.readFileSync(stateFile(from), 'utf8'))
  const have = new Set((next.routines || []).map(r => key(r.name)))
  const sub = { ...src, routines: (src.routines || []).filter(r => !have.has(key(r.name))) }
  next.routines = Array.isArray(next.routines) ? next.routines : []
  next.week = next.week && typeof next.week === 'object' ? next.week : {}
  if (sub.routines.length) {
    // As importing a shared plan does (plan-share.js mergePlan, which is not loadable outside the
    // app): the custom exercises the routines use, matched by name or copied under a new id, then
    // the routines under new ids, then the week when this profile has none of its own.
    const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex')
    next.customEx = Array.isArray(next.customEx) ? next.customEx : []
    const used = new Set(sub.routines.flatMap(r => (r.ex || []).map(e => e.id)))
    const exMap = {}
    for (const c of (src.customEx || []).filter(c => c && used.has(c.id))) {
      const same = next.customEx.find(x => key(x.n) === key(c.n) && x.bp === c.bp)
      if (same) { exMap[c.id] = same.id; continue }
      const { media, photo, video, ...rest } = c
      exMap[c.id] = newId()
      next.customEx.push({ ...rest, id: exMap[c.id], custom: true })
    }
    const ridMap = {}
    for (const r of sub.routines) {
      ridMap[r.id] = newId()
      next.routines.push({ ...JSON.parse(JSON.stringify(r)), id: ridMap[r.id], ex: (r.ex || []).map(e => ({ ...JSON.parse(JSON.stringify(e)), id: exMap[e.id] || e.id })) })
    }
    const schedule = !Object.keys(next.week).length
    if (schedule) for (const [d, v] of Object.entries(src.week || {})) {
      const ids = [].concat(v).map(x => ridMap[x]).filter(Boolean)
      if (ids.length) next.week[d] = ids
    }
    console.log(`Plano de "${from.name}": ${sub.routines.length} rotina(s) copiada(s)${schedule ? ', com a semana' : ''}: ${sub.routines.map(x => x.name).join(', ')}`)
  } else console.log(`Plano de "${from.name}": ${user.name} já tem todas as rotinas dele.`)
  // The source's search nicknames help the matching; they are not copied.
  const look = { ...next, exAliases: { ...(src.exAliases || {}), ...(next.exAliases || {}) } }
  for (const input of inputs) {
    const routines = next.routines.filter(Boolean)
    const pick = routines.find(r => key(r.name) === key(input.name))
      || routines.map(r => ({ r, s: input.exercises.reduce((t, ex) => t + Math.max(0, ...(r.ex || []).map(e => score(ex.label, look, e.id))), 0) }))
        .sort((x, y) => y.s - x.s).find(x => x.s > 0)?.r
    if (!pick) { console.log(`  ${input.date} ${input.name}: nenhuma rotina do plano combina; vai sem rotina`); continue }
    input._routine = pick
    console.log(`  ${input.date} ${input.name} → rotina "${pick.name}"`)
    const used = new Set()
    for (const ex of input.exercises) {
      const best = (pick.ex || []).map((e, i) => ({ e, i, s: score(ex.label, look, e.id) }))
        .filter(x => !used.has(x.i)).sort((x, y) => y.s - x.s)[0]
      if (best && best.s >= 0.5) {
        used.add(best.i)
        ex.exercise = best.e.id
        ex._slot = best.e
        console.log(`     ${ex.label} → ${namesOf(next, best.e.id)[0]}`)
      } else console.log(`     ${ex.label} → (não está na rotina) ${namesOf(next, ex.exercise)[0] || ex.exercise}`)
    }
  }
}
const unit = next.unit === 'lb' ? 'lb' : 'kg'
let added = 0, failed = false
for (const input of inputs) {
  const label = `${input.date} ${input.name || ''}`.trim()
  const clean = { ...input, exercises: input.exercises.map(({ _slot, label, ...ex }) => ex) }
  delete clean._routine
  const built = buildLoggedWorkout(next, clean, { now, unit: 'kg' })
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
  if (input._routine) {
    const w = next.workouts.find(x => x.id === res.workout.id)
    w.routineIds = [input._routine.id]; w.routineId = input._routine.id
    for (const ex of input.exercises) {
      if (!ex._slot) continue
      const top = Math.max(0, ...ex.sets.map(x => Number(x.weight) || 0))
      if (top > 0) { ex._slot.weight = top; delete ex._slot.pyramidWeight }
    }
  }
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
