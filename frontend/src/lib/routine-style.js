// Retake Gym: a routine's style, the kind of session it is meant to be.
//
//   'load'  "More weight, fewer reps"
//   'reps'  "More reps, less weight"
//   (none)  "Normal", the default: a routine without the field is a normal one.
//
// Stored on the routine as `style`, and only when it is not normal, so a routine nobody touched
// keeps the shape it had (the same way `excludeFromProgression` is left out when off). It is a
// label for the person: it changes nothing the progression engine decides.
import { t } from './i18n-core.js'
import { modeOf } from './history.js'
import { isPyramid } from './pyramid.js'
import { isWarmupRow } from './workout-model.js'

export const ROUTINE_STYLES = ['normal', 'load', 'reps']

const NAME = { normal: 'Normal', load: 'More weight, fewer reps', reps: 'More reps, less weight' }
const SHORT = { normal: 'Normal', load: 'More weight', reps: 'More reps' }

/** The routine's style, 'normal' when it has none (or one this version does not know). */
export const styleOf = r => (r && (r.style === 'load' || r.style === 'reps') ? r.style : 'normal')
export const styleName = s => t(NAME[s] || NAME.normal)
/** Short form for a list row or a chip ("More reps"). */
export const styleShort = s => t(SHORT[s] || SHORT.normal)
/** Sets the style in place: 'normal' (or anything unknown) removes the field. */
export function setStyle(r, s) {
  if (!r) return
  if (s === 'load' || s === 'reps') r.style = s
  else delete r.style
}

// The one-off classification of routines already there (scripts/set-routine-style.mjs). Rep
// counts 12 and up read as a "more reps" session, 8 to 10 as a normal one; anything else (fewer
// than 8, 11, or 12s mixed with 8 to 10) is not decided here and is left normal by the caller.
/** 'reps', 'normal', or null when the counts do not settle it. */
export function styleFromReps(list) {
  const reps = (list || []).map(Number).filter(n => Number.isFinite(n) && n > 0)
  if (!reps.length) return null
  if (reps.every(n => n >= 12)) return 'reps'
  if (reps.every(n => n >= 8 && n <= 10)) return 'normal'
  return null
}

/** The planned rep targets of a routine's rep exercises (a range counts both ends). */
export function plannedReps(r) {
  const out = []
  for (const e of (r?.ex || [])) {
    if (!e || modeOf(e) !== 'reps') continue
    if (isPyramid(e)) { for (const v of e.pyramid) if (typeof v === 'number') out.push(v); continue }
    if (e.repsMin > 0 && e.repsMin < e.reps) out.push(e.repsMin)
    if (e.reps > 0) out.push(e.reps)
  }
  return out
}

/** The reps of a logged workout's working sets (warm-ups and timed sets left out). */
export function loggedReps(w) {
  const out = []
  for (const e of (w?.entries || [])) for (const s of (e?.sets || [])) {
    if (!s || isWarmupRow(s)) continue
    if (Number(s.r) > 0) out.push(Number(s.r))
  }
  return out
}

// A logged session reads as one kind when at least this share of its working sets is: a last
// set or two that fell short (12, 12, 10) still makes a 12-rep session.
const MOSTLY = 0.75

/** What a logged session was from its sets' reps: 'reps' when mostly 12 or more, 'normal' when
 *  mostly 8 to 10, null when it was a mix (some exercises at 12, others at 10) or something else. */
export function styleFromLog(list) {
  const reps = (list || []).map(Number).filter(n => Number.isFinite(n) && n > 0)
  if (!reps.length) return null
  const share = f => reps.filter(f).length / reps.length
  if (share(n => n >= 12) >= MOSTLY) return 'reps'
  if (share(n => n >= 8 && n <= 10) >= MOSTLY) return 'normal'
  return null
}

/**
 * How a routine reads from its reps: from what was done in its latest logged workout first (the
 * plan can say 12 while the sets were 10), and from its plan only when it was never trained.
 * Returns { style: 'reps' | 'normal' | null, from: 'log' | 'plan' | null, planned, logged }.
 */
export function classifyRoutine(r, workouts) {
  const planned = plannedReps(r)
  const last = (workouts || []).filter(w => w && [].concat(w.routineIds || w.routineId || []).includes(r?.id))
    .sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')) || (Number(b.start) || 0) - (Number(a.start) || 0))[0]
  const logged = last ? loggedReps(last) : []
  if (logged.length) {
    const byLog = styleFromLog(logged)
    return { style: byLog, from: byLog ? 'log' : null, planned, logged }
  }
  const byPlan = styleFromReps(planned)
  return { style: byPlan, from: byPlan ? 'plan' : null, planned, logged }
}

/** The style a session (or a logged workout) has from its routines: the one they all share,
 *  or 'normal' when there is none or they differ. */
export function styleOfRoutines(routines, ids) {
  const list = [].concat(ids || []).map(id => (routines || []).find(r => r && r.id === id)).filter(Boolean)
  if (!list.length) return 'normal'
  const s = styleOf(list[0])
  return list.every(r => styleOf(r) === s) ? s : 'normal'
}
