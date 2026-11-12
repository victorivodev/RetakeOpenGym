import { describe, it, expect } from 'vitest'
import { workoutCard, weightCard, cardText, socialError, ago } from './social.js'

describe('weightCard', () => {
  const S = { unit: 'kg', bodyweight: [{ d: '2026-11-01', w: 90 }, { d: '2026-09-01', w: 92 }, { d: '2026-11-10', w: 87.4 }] }
  it('shows only the percentage by default', () => {
    const c = weightCard(S)
    expect(c).toMatchObject({ type: 'weight', from: '2026-09-01', to: '2026-11-10', before: '', after: '' })
    expect(c.change).toBe("-5%")
  })
  it('shows before, after and the change in kg when asked', () => {
    const c = weightCard(S, 'kg')
    expect(c.before).toBe('92 kg'); expect(c.after).toMatch(/^87[.,]4 kg$/); expect(c.change).toMatch(/^-4[.,]6 kg$/)
  })
  it('needs two weigh-ins', () => {
    expect(weightCard({ bodyweight: [{ d: '2026-11-01', w: 90 }] })).toBe(null)
    expect(weightCard({})).toBe(null)
  })
  it('a gain has a plus sign', () => {
    expect(weightCard({ unit: 'kg', bodyweight: [{ d: '2026-01-01', w: 60 }, { d: '2026-02-01', w: 63 }] }, 'kg').change).toBe('+3 kg')
  })
})

describe('workoutCard', () => {
  it('counts the done sets and the minutes', () => {
    const w = { name: 'Treino A', start: 0, end: 50 * 60000, entries: [
      { id: 'nope', sets: [{ w: 50, r: 10, done: true }, { w: 50, r: 10, done: false }] },
      { id: 'nope2', sets: [{ w: 20, r: 12, done: true }] }] }
    const c = workoutCard(w, { unit: 'kg' })
    expect(c).toMatchObject({ type: 'workout', name: 'Treino A', sets: 2, minutes: 50 })
    expect(c.volume).toMatch(/kg$/)
    expect(cardText(c)).toContain('Treino A')
  })
  it('nothing without a workout', () => { expect(workoutCard(null)).toBe(null) })
})

describe('socialError and ago', () => {
  it('names the private-profile refusal', () => {
    expect(socialError({ data: { code: 'private' }, message: 'x' })).toMatch(/private/i)
    expect(socialError({ message: 'boom' })).toBe('boom')
  })
  it('ago', () => {
    const now = Date.parse('2026-11-12T12:00:00Z')
    expect(ago(now - 30000, now)).toBe('now')
    expect(ago(now - 5 * 60000, now)).toBe('5 min')
    expect(ago(now - 3 * 3600000, now)).toBe('3 h')
    expect(ago(now - 2 * 86400000, now)).toBe('2 d')
  })
})

import { freshNotes, noteText } from './social-notify.js'
describe('social notes on the phone', () => {
  it('only the new ones, oldest first', () => {
    const latest = [{ at: 30, kind: 'poke', name: 'Ana' }, { at: 20, kind: 'comment', name: 'Bia', text: 'boa' }, { at: 10, kind: 'poke', name: 'C' }]
    expect(freshNotes(latest, 15).map(n => n.at)).toEqual([20, 30])
    expect(freshNotes(null, 0)).toEqual([])
    expect(noteText(latest[0])).toContain('Ana')
    expect(noteText(latest[1])).toContain('boa')
  })
})
