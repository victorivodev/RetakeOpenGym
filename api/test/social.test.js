import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../social.js'

test('localToday takes the phone day when it is within a day of the server', () => {
  const now = Date.parse('2026-11-11T01:30:00Z')            // 22:30 on the 10th in Brazil
  assert.equal(S.localToday('2026-11-10', now), '2026-11-10')
  assert.equal(S.localToday('2026-11-12', now), '2026-11-12')
  assert.equal(S.localToday('2026-11-01', now), '2026-11-11') // too far: server day
  assert.equal(S.localToday('nonsense', now), '2026-11-11')
  assert.equal(S.localToday(undefined, now), '2026-11-11')
})

test('weekStart is the Monday of the week', () => {
  assert.equal(S.weekStart('2026-11-12'), '2026-11-09')     // Thursday
  assert.equal(S.weekStart('2026-11-09'), '2026-11-09')     // Monday
  assert.equal(S.weekStart('2026-11-15'), '2026-11-09')     // Sunday
})

test('streakDays counts back from today, or from yesterday on a rest day', () => {
  assert.equal(S.streakDays(['2026-11-10', '2026-11-11', '2026-11-12'], '2026-11-12'), 3)
  assert.equal(S.streakDays(['2026-11-10', '2026-11-11'], '2026-11-12'), 2)
  assert.equal(S.streakDays(['2026-11-09', '2026-11-11'], '2026-11-12'), 1)
  assert.equal(S.streakDays(['2026-11-01'], '2026-11-12'), 0)
  assert.equal(S.streakDays([], '2026-11-12'), 0)
})

test('who sees a post', () => {
  const social = S.normalizeSocial({
    profiles: { a: { visibility: 'friends' }, p: { visibility: 'public' }, x: { visibility: 'private' } },
    friends: { a: [{ id: 'b', status: 'accepted' }], b: [{ id: 'a', status: 'accepted' }, { id: 'x', status: 'accepted' }], x: [{ id: 'b', status: 'accepted' }] }
  })
  const post = (author, scope = 'friends') => ({ author, scope })
  assert.equal(S.canSeePost(social, 'b', post('a')), true)
  assert.equal(S.canSeePost(social, 'c', post('a')), false)
  assert.equal(S.canSeePost(social, 'c', post('a', 'public')), false)  // a is friends-only
  assert.equal(S.canSeePost(social, 'c', post('p', 'public')), true)
  assert.equal(S.canSeePost(social, 'c', post('p')), false)
  assert.equal(S.canSeePost(social, 'b', post('x')), false)            // private profile
  assert.equal(S.canSeePost(social, 'x', post('x')), true)
  assert.equal(S.canSeePost(social, 'c', post('n')), false)            // no profile: friends
})

test('relationOf', () => {
  const social = S.normalizeSocial({ friends: { a: [{ id: 'b', status: 'pending', direction: 'out' }, { id: 'c', status: 'pending', direction: 'in' }, { id: 'd', status: 'accepted' }] } })
  assert.equal(S.relationOf(social, 'a', 'a'), 'self')
  assert.equal(S.relationOf(social, 'a', 'b'), 'sent')
  assert.equal(S.relationOf(social, 'a', 'c'), 'received')
  assert.equal(S.relationOf(social, 'a', 'd'), 'friend')
  assert.equal(S.relationOf(social, 'a', 'e'), 'other')
})

test('a challenge in progress, then over with its winners', () => {
  const c = { id: '1', owner: 'a', title: 'T', days: 7, start: '2026-11-09', members: ['a', 'b', 'c'],
    checkins: { a: ['2026-11-09', '2026-11-10', '2026-11-11'], b: ['2026-11-09', '2026-11-10', '2026-11-12'], c: ['2026-11-09'] } }
  const names = { a: 'Ana', b: 'Bia', c: 'Caio' }
  const mid = S.challengeView(c, '2026-11-12', id => names[id])
  assert.equal(mid.day, 4); assert.equal(mid.daysLeft, 4); assert.equal(mid.ended, false); assert.deepEqual(mid.winners, [])
  assert.equal(mid.end, '2026-11-15')
  assert.deepEqual(mid.standings.map(s => s.id), ['a', 'b', 'c'])
  assert.equal(mid.checkedToday.b, true); assert.equal(mid.checkedToday.a, false)
  const last = S.challengeView(c, '2026-11-15', id => names[id])
  assert.equal(last.ended, false); assert.equal(last.daysLeft, 1)
  const over = S.challengeView(c, '2026-11-16', id => names[id])
  assert.equal(over.ended, true); assert.equal(over.daysLeft, 0); assert.deepEqual(over.winners, ['a', 'b'])
  const nobody = S.challengeView({ ...c, checkins: {} }, '2026-11-20')
  assert.deepEqual(nobody.winners, [])
})

test('photoOk takes one small picture', () => {
  assert.equal(S.photoOk('data:image/jpeg;base64,AAAA'), true)
  assert.equal(S.photoOk('data:image/gif;base64,AAAA'), false)
  assert.equal(S.photoOk('data:image/jpeg;base64,' + 'A'.repeat(S.PHOTO_MAX)), false)
  assert.equal(S.photoOk(null), false)
})

test('normalizeSocial fills what is missing', () => {
  const s = S.normalizeSocial({ posts: 'bad', profiles: { a: {} } })
  assert.deepEqual(s.posts, []); assert.deepEqual(s.profiles, { a: {} }); assert.deepEqual(s.seen, {})
  assert.equal(S.visibilityOf({}), 'friends'); assert.equal(S.visibilityOf({ visibility: 'private' }), 'private')
})
