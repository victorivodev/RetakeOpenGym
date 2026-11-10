// Retake Gym — diet maths. Pure helpers, no React, no store: the diet screens and the AI meal
// review read and write plain objects and call these to turn them into numbers.
//
// Units: body weight in kg, height in cm, energy in kcal, macros in grams.
//
// A meal is { id, date: 'YYYY-MM-DD', slot, items: [item], source: 'ai-photo'|'ai-text'|'barcode'|'manual' }
// An item is { name, grams, kcal, protein, carbs, fat, fiber?, confidence? } where the numbers are
// for the portion as eaten (not per 100 g). scaleItem() re-derives them when a portion changes.

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner', 'supper']

export const ACTIVITY = {
  sedentary: 1.2,   // desk job, little exercise
  light: 1.375,     // 1-3 sessions a week
  moderate: 1.55,   // 3-5 sessions a week
  active: 1.725,    // 6-7 sessions a week
  athlete: 1.9      // hard training twice a day or a physical job
}

export const GOALS = ['lose', 'maintain', 'gain', 'recomp']

// Energy in one kg of body-weight change, the usual working figure.
export const KCAL_PER_KG = 7700
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 }

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const r1 = v => Math.round(v * 10) / 10

/** Basal metabolic rate, Mifflin-St Jeor. sex: 'male' | 'female'. Returns kcal/day or null. */
export function bmr({ sex, weightKg, heightCm, ageYears } = {}) {
  if (!(weightKg > 0 && heightCm > 0 && ageYears > 0)) return null
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  return Math.round(base + (sex === 'female' ? -161 : 5))
}

/** Total daily energy expenditure from BMR and an ACTIVITY key. */
export function tdee(bmrKcal, activity = 'moderate') {
  if (!(bmrKcal > 0)) return null
  return Math.round(bmrKcal * (ACTIVITY[activity] || ACTIVITY.moderate))
}

/**
 * Daily calorie and macro targets for a goal.
 *  - lose: deficit from the weekly rate (default 0.5 kg/week), capped at 25% of TDEE and never
 *    below BMR, so a fast rate cannot push intake to crash-diet levels;
 *  - gain: surplus from the weekly rate (default 0.25 kg/week), capped at 15% of TDEE;
 *  - recomp: a small 10% deficit with high protein;
 *  - maintain: TDEE.
 * Protein per kg: 2.0 losing / recomp, 1.8 gaining, 1.6 maintaining. Fat 25% of energy (at least
 * 0.6 g/kg). Carbs take what is left.
 */
export function dailyTargets({ sex, weightKg, heightCm, ageYears, activity = 'moderate', goal = 'maintain', ratePerWeekKg } = {}) {
  const b = bmr({ sex, weightKg, heightCm, ageYears })
  const t = tdee(b, activity)
  if (!t) return null
  let kcal = t
  if (goal === 'lose') {
    const rate = Math.abs(ratePerWeekKg ?? 0.5)
    const deficit = Math.min((rate * KCAL_PER_KG) / 7, t * 0.25)
    kcal = Math.max(t - deficit, b)
  } else if (goal === 'gain') {
    const rate = Math.abs(ratePerWeekKg ?? 0.25)
    kcal = t + Math.min((rate * KCAL_PER_KG) / 7, t * 0.15)
  } else if (goal === 'recomp') {
    kcal = t * 0.9
  }
  kcal = Math.round(kcal / 10) * 10
  const proteinPerKg = { lose: 2.0, recomp: 2.0, gain: 1.8 }[goal] ?? 1.6
  const protein = Math.round(proteinPerKg * weightKg)
  const fat = Math.round(Math.max((kcal * 0.25) / KCAL_PER_G.fat, 0.6 * weightKg))
  const carbs = Math.max(0, Math.round((kcal - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs))
  return { bmr: b, tdee: t, kcal, protein, carbs, fat, fiber: Math.round((kcal / 1000) * 14) }
}

/** Sum of the macros of a list of items (or meals, whose items are flattened). */
export function sumMacros(list = []) {
  const out = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  for (const x of list) {
    if (x && Array.isArray(x.items)) {
      const s = sumMacros(x.items)
      for (const k in out) out[k] += s[k]
      continue
    }
    for (const k in out) out[k] += num(x?.[k])
  }
  for (const k in out) out[k] = r1(out[k])
  return out
}

/** Totals for one day, plus a per-slot breakdown. */
export function dayTotals(meals = [], date) {
  const today = meals.filter(m => m?.date === date)
  const bySlot = {}
  for (const slot of MEAL_SLOTS) bySlot[slot] = sumMacros(today.filter(m => m.slot === slot))
  return { total: sumMacros(today), bySlot, count: today.length }
}

/** What is left of each target today (negative when over). */
export function remaining(targets, totals) {
  if (!targets) return null
  const out = {}
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) out[k] = r1(num(targets[k]) - num(totals?.[k]))
  return out
}

/** An item rescaled to a new portion in grams, keeping its per-gram density. */
export function scaleItem(item, grams) {
  if (!item || !(item.grams > 0) || !(grams >= 0)) return item
  const f = grams / item.grams
  const out = { ...item, grams: Math.round(grams) }
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) if (k in item) out[k] = r1(num(item[k]) * f)
  return out
}

/** Calories implied by the macros, to sanity-check an AI or a label (alcohol not counted). */
export const kcalFromMacros = ({ protein, carbs, fat } = {}) =>
  Math.round(num(protein) * 4 + num(carbs) * 4 + num(fat) * 9)

/**
 * An item from an AI or a database made safe to store: numbers clamped to sane ranges, a name
 * trimmed, and kcal recomputed from the macros when the two disagree by more than 25%.
 */
export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = String(raw.name || '').trim().slice(0, 80)
  if (!name) return null
  const clamp = (v, max) => Math.min(max, Math.max(0, r1(num(Number(v)))))
  const it = {
    name,
    grams: clamp(raw.grams, 5000),
    kcal: clamp(raw.kcal, 10000),
    protein: clamp(raw.protein, 1000),
    carbs: clamp(raw.carbs, 1000),
    fat: clamp(raw.fat, 1000),
    fiber: clamp(raw.fiber, 300)
  }
  if (raw.confidence != null) it.confidence = Math.min(1, Math.max(0, num(Number(raw.confidence))))
  const est = kcalFromMacros(it)
  if (est > 0 && Math.abs(it.kcal - est) / est > 0.25) it.kcal = est
  return it
}

/**
 * Real TDEE estimated from what was eaten and how the weight moved, over the window given
 * (at least 14 days with intake logged on 70% of them and two weigh-ins far enough apart).
 *   intakes: [{ date, kcal }] (one per logged day), weights: [{ date, kg }]
 * Returns { tdee, days, trendKgPerWeek } or null when the data cannot carry an estimate.
 */
export function adaptiveTdee(intakes = [], weights = []) {
  const days = intakes.filter(d => d && d.kcal > 0)
  const ws = weights.filter(w => w && w.kg > 0).slice().sort((a, b) => (a.date < b.date ? -1 : 1))
  if (days.length < 10 || ws.length < 2) return null
  const t0 = Date.parse(ws[0].date), t1 = Date.parse(ws[ws.length - 1].date)
  const spanDays = (t1 - t0) / 86400000
  if (!(spanDays >= 14) || days.length < spanDays * 0.7) return null
  // Least-squares slope of weight against time, so one salty day does not swing the answer.
  const xs = ws.map(w => (Date.parse(w.date) - t0) / 86400000)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ws.reduce((a, w) => a + w.kg, 0) / ws.length
  let sxy = 0, sxx = 0
  ws.forEach((w, i) => { sxy += (xs[i] - mx) * (w.kg - my); sxx += (xs[i] - mx) ** 2 })
  const slopePerDay = sxx ? sxy / sxx : 0
  const avgIntake = days.reduce((a, d) => a + d.kcal, 0) / days.length
  return {
    tdee: Math.round(avgIntake - slopePerDay * KCAL_PER_KG),
    days: days.length,
    trendKgPerWeek: r1(slopePerDay * 7 * 10) / 10
  }
}
