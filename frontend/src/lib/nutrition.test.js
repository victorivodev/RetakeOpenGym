import { describe, it, expect } from 'vitest'
import { bmr, tdee, dailyTargets, sumMacros, dayTotals, remaining, scaleItem, cleanItem, kcalFromMacros, adaptiveTdee } from './nutrition.js'

const victor = { sex: 'male', weightKg: 80, heightCm: 180, ageYears: 30 }

describe('bmr / tdee', () => {
  it('follows Mifflin-St Jeor', () => {
    expect(bmr(victor)).toBe(1780)
    expect(bmr({ ...victor, sex: 'female' })).toBe(1614)
  })
  it('is null for missing data', () => {
    expect(bmr({ weightKg: 80 })).toBeNull()
    expect(tdee(null)).toBeNull()
  })
  it('scales by activity', () => {
    expect(tdee(1780, 'sedentary')).toBe(2136)
    expect(tdee(1780, 'unknown')).toBe(Math.round(1780 * 1.55))
  })
})

describe('dailyTargets', () => {
  it('maintain equals TDEE', () => {
    const t = dailyTargets({ ...victor, goal: 'maintain' })
    expect(t.kcal).toBe(Math.round(t.tdee / 10) * 10)
    expect(t.protein).toBe(128)
  })
  it('lose takes a deficit but never goes under BMR', () => {
    const t = dailyTargets({ ...victor, goal: 'lose', ratePerWeekKg: 0.5 })
    expect(t.kcal).toBe(Math.round((t.tdee - 550) / 10) * 10)
    const fast = dailyTargets({ ...victor, activity: 'sedentary', goal: 'lose', ratePerWeekKg: 2 })
    expect(fast.kcal).toBeGreaterThanOrEqual(fast.bmr - 10)
  })
  it('gain adds a capped surplus', () => {
    const t = dailyTargets({ ...victor, goal: 'gain', ratePerWeekKg: 5 })
    expect(t.kcal).toBeLessThanOrEqual(Math.round(t.tdee * 1.15 / 10) * 10)
    expect(t.kcal).toBeGreaterThan(t.tdee)
  })
  it('macros add back up to the calories', () => {
    for (const goal of ['lose', 'maintain', 'gain', 'recomp']) {
      const t = dailyTargets({ ...victor, goal })
      expect(Math.abs(kcalFromMacros(t) - t.kcal)).toBeLessThan(15)
    }
  })
})

describe('totals', () => {
  const meals = [
    { date: '2026-11-10', slot: 'breakfast', items: [{ kcal: 300, protein: 20, carbs: 30, fat: 10 }] },
    { date: '2026-11-10', slot: 'lunch', items: [{ kcal: 700, protein: 40, carbs: 80, fat: 20, fiber: 8 }] },
    { date: '2026-11-09', slot: 'lunch', items: [{ kcal: 999 }] }
  ]
  it('sums one day by slot', () => {
    const d = dayTotals(meals, '2026-11-10')
    expect(d.total).toEqual({ kcal: 1000, protein: 60, carbs: 110, fat: 30, fiber: 8 })
    expect(d.bySlot.lunch.kcal).toBe(700)
    expect(d.count).toBe(2)
  })
  it('remaining goes negative when over', () => {
    expect(remaining({ kcal: 900, protein: 100 }, { kcal: 1000, protein: 60 })).toMatchObject({ kcal: -100, protein: 40 })
  })
  it('ignores junk values', () => {
    expect(sumMacros([{ kcal: 'x' }, null, { kcal: NaN }]).kcal).toBe(0)
  })
})

describe('items', () => {
  it('scales a portion', () => {
    expect(scaleItem({ name: 'Arroz', grams: 100, kcal: 128, carbs: 28.1, protein: 2.5 }, 150))
      .toEqual({ name: 'Arroz', grams: 150, kcal: 192, carbs: 42.2, protein: 3.8 })
  })
  it('cleans AI output', () => {
    expect(cleanItem({ name: '  ', kcal: 10 })).toBeNull()
    const it1 = cleanItem({ name: 'Feijão', grams: '80', kcal: 1000, protein: 4, carbs: 11, fat: 0.4, confidence: 3 })
    expect(it1.kcal).toBe(kcalFromMacros(it1))
    expect(it1.grams).toBe(80)
    expect(it1.confidence).toBe(1)
  })
})

describe('adaptiveTdee', () => {
  const day = i => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)
  it('needs enough data', () => {
    expect(adaptiveTdee([{ date: day(0), kcal: 2000 }], [{ date: day(0), kg: 80 }])).toBeNull()
  })
  it('reads a deficit from a falling weight', () => {
    const intakes = Array.from({ length: 21 }, (_, i) => ({ date: day(i), kcal: 2000 }))
    // -0.5 kg/week = -0.0714 kg/day -> 550 kcal/day deficit -> TDEE 2550
    const weights = Array.from({ length: 21 }, (_, i) => ({ date: day(i), kg: 80 - (0.5 / 7) * i }))
    const r = adaptiveTdee(intakes, weights)
    expect(r.tdee).toBe(2550)
    expect(r.trendKgPerWeek).toBe(-0.5)
  })
})
