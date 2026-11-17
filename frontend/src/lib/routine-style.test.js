import { describe, it, expect } from 'vitest'
import { styleOf, setStyle, styleFromReps, plannedReps, loggedReps, classifyRoutine, styleOfRoutines, styleFromLog } from './routine-style.js'

describe('routine style', () => {
  it('reads a routine without the field, or with an unknown one, as normal', () => {
    expect(styleOf({})).toBe('normal')
    expect(styleOf(null)).toBe('normal')
    expect(styleOf({ style: 'banana' })).toBe('normal')
    expect(styleOf({ style: 'load' })).toBe('load')
    expect(styleOf({ style: 'reps' })).toBe('reps')
  })

  it('stores only a style that is not normal', () => {
    const r = { id: 'a' }
    setStyle(r, 'reps')
    expect(r.style).toBe('reps')
    setStyle(r, 'normal')
    expect('style' in r).toBe(false)
    setStyle(r, 'load')
    setStyle(r, 'whatever')
    expect('style' in r).toBe(false)
  })
})

describe('styleFromReps', () => {
  it('12 reps is a "more reps" session, 8 to 10 a normal one', () => {
    expect(styleFromReps([12, 12, 12])).toBe('reps')
    expect(styleFromReps([15, 12])).toBe('reps')
    expect(styleFromReps([8, 10, 9])).toBe('normal')
    expect(styleFromReps([10])).toBe('normal')
  })
  it('leaves mixed or other counts undecided', () => {
    expect(styleFromReps([12, 10])).toBe(null)
    expect(styleFromReps([5, 5])).toBe(null)
    expect(styleFromReps([11])).toBe(null)
    expect(styleFromReps([])).toBe(null)
  })
})

describe('plannedReps and loggedReps', () => {
  it('reads both ends of a range and skips timed and cardio exercises', () => {
    const r = { ex: [
      { id: '0025', sets: 3, reps: 12 },
      { id: '0025', sets: 3, reps: 12, repsMin: 8 },
      { id: '0025', mode: 'time', sec: 45 },
      { id: '0025', mode: 'cardio', min: 20 },
    ] }
    expect(plannedReps(r)).toEqual([12, 8, 12])
  })
  it('leaves warm-up sets out of a logged workout', () => {
    const w = { entries: [{ sets: [{ r: 15, w: 20, warmup: true, phase: 'warmup' }, { r: 12, w: 40 }, { r: 10, w: 45 }] }] }
    expect(loggedReps(w)).toEqual([12, 10])
  })
})

describe('classifyRoutine', () => {
  const routine = reps => ({ id: 'r1', name: 'Peito', ex: reps.map(n => ({ id: '0025', sets: 3, reps: n })) })
  const done = (d, reps, id = 'r1') => ({ d, routineIds: [id], entries: [{ sets: reps.map(r => ({ r })) }] })
  it('decides from the plan when the routine was never trained', () => {
    expect(classifyRoutine(routine([12, 12]), []).style).toBe('reps')
    expect(classifyRoutine(routine([8, 10]), []).style).toBe('normal')
    expect(classifyRoutine(routine([8, 10]), []).from).toBe('plan')
    expect(classifyRoutine(routine([12, 10]), []).style).toBe(null)
  })
  it('goes by what the latest workout of the routine did, over its plan', () => {
    const workouts = [
      done('2026-11-01', [8, 8, 8]),
      done('2026-11-10', [12, 12, 10, 12, 12, 12]),
      done('2026-11-12', [5], 'other'),
    ]
    const c = classifyRoutine(routine([10]), workouts)
    expect(c.style).toBe('reps')
    expect(c.from).toBe('log')
    expect(c.logged).toEqual([12, 12, 10, 12, 12, 12])
    // Planned at 12, done at 10: a normal session.
    expect(classifyRoutine(routine([12]), [done('2026-11-10', [10, 10, 8, 10, 12, 9, 10, 10])]).style).toBe('normal')
  })
  it('leaves a session that mixed 12s and 10s undecided', () => {
    expect(classifyRoutine(routine([12, 10]), [done('2026-11-10', [12, 12, 12, 10, 10, 10])]).style).toBe(null)
    expect(classifyRoutine(routine([6]), [done('2026-11-10', [6, 6])]).style).toBe(null)
  })
})

describe('styleFromLog', () => {
  it('needs three quarters of the sets to agree', () => {
    expect(styleFromLog([12, 12, 12, 10])).toBe('reps')
    expect(styleFromLog([12, 12, 10, 10])).toBe(null)
    expect(styleFromLog([10, 10, 9, 12])).toBe('normal')
    expect(styleFromLog([])).toBe(null)
  })
})

describe('styleOfRoutines', () => {
  const routines = [{ id: 'a', style: 'reps' }, { id: 'b', style: 'reps' }, { id: 'c' }, { id: 'd', style: 'load' }]
  it('is the style every routine of the session shares', () => {
    expect(styleOfRoutines(routines, ['a'])).toBe('reps')
    expect(styleOfRoutines(routines, ['a', 'b'])).toBe('reps')
    expect(styleOfRoutines(routines, 'd')).toBe('load')
  })
  it('is normal for a free session, a deleted routine or routines that differ', () => {
    expect(styleOfRoutines(routines, [])).toBe('normal')
    expect(styleOfRoutines(routines, ['gone'])).toBe('normal')
    expect(styleOfRoutines(routines, ['a', 'd'])).toBe('normal')
    expect(styleOfRoutines(routines, ['a', 'c'])).toBe('normal')
  })
})
