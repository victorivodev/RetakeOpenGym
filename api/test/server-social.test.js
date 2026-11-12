import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { boundPort } from './helpers.mjs'

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const localDay = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

async function start(t, { invites = [], env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-social-'))
  const secret = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(path.join(dir, 'secret'), secret)
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'a', name: 'Alice', username: 'alice' }, { id: 'b', name: 'Bob', username: 'bob' }, { id: 'c', name: 'Carol', username: 'carol' }], creds: [], subs: [], invites }))
  const child = spawn(process.execPath, ['server.js'], { cwd: API, env: { ...process.env, PORT: '0', DATA_DIR: dir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''; child.stdout.on('data', x => log += x); child.stderr.on('data', x => log += x)
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dir, { recursive: true, force: true }) })
  const port = await boundPort(child, () => log)
  const session = id => { const payload = `${id}:${Date.now() + 86400000}:0`; return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url') }
  const call = async (id, route, body, method = 'POST') => {
    const r = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { ...(id ? { Cookie: `gymsid=${session(id)}` } : {}), Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json() }
  }
  return { dir, call }
}

test('social: privacy, friends, photos in their own file, comments and notifications', async t => {
  const { dir, call } = await start(t)
  assert.equal((await call('b', '/api/social/profile', { visibility: 'private' }, 'PUT')).status, 200)
  assert.equal((await call('b', '/api/social/post', { kind: 'workout', text: 'private' })).status, 409)
  assert.equal((await call('b', '/api/social/profile', { visibility: 'friends' }, 'PUT')).status, 200)
  assert.equal((await call('a', '/api/social/profile', { bio: 'hello', visibility: 'public' }, 'PUT')).status, 200)
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  const posted = await call('a', '/api/social/post', { kind: 'meal', text: 'Lunch', scope: 'friends', photo })
  assert.equal(posted.status, 201)
  // The photo is not in the feed file, only a flag.
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'social.json'), 'utf8'))
  assert.equal(stored.posts[0].photo, true)
  assert.equal((await call('a', '/api/social/post', { text: '', photo: 'data:image/gif;base64,AAAA' })).status, 400)
  assert.equal((await call('c', '/api/social', null, 'GET')).body.posts.length, 0)
  assert.equal((await call('c', '/api/social/photo?id=' + posted.body.id, null, 'GET')).status, 404)
  // Search: a public profile by part of its name; a friends-only one only by exact @user name.
  assert.equal((await call('b', '/api/social?q=ali', null, 'GET')).body.found[0].username, 'alice')
  assert.equal((await call('c', '/api/social?q=bo', null, 'GET')).body.found.length, 0)
  assert.equal((await call('c', '/api/social?q=@bob', null, 'GET')).body.found[0].username, 'bob')
  assert.equal((await call('b', '/api/social/friend', { username: 'bad' })).status, 404)
  assert.equal((await call('b', '/api/social/friend', { username: '@alice' })).status, 200)
  assert.equal((await call('b', '/api/social/friend', { username: 'alice' })).status, 409)
  const aHome = (await call('a', '/api/social', null, 'GET')).body
  assert.equal(aHome.incoming[0].id, 'b'); assert.equal(aHome.unread, 1); assert.equal(aHome.notifications[0].kind, 'friend-request')
  assert.equal((await call('a', '/api/social/friend/accept', { id: 'b' })).status, 200)
  const feed = (await call('b', '/api/social', null, 'GET')).body
  assert.equal(feed.posts.length, 1); assert.equal(feed.posts[0].photo, true); assert.equal(feed.posts[0].author.username, 'alice')
  assert.equal((await call('b', '/api/social/photo?id=' + posted.body.id, null, 'GET')).body.photo, photo)
  assert.equal((await call('b', '/api/social/react', { id: posted.body.id, reaction: '🔥' })).status, 200)
  assert.equal((await call('b', '/api/social/comment', { id: posted.body.id, text: 'Boa!' })).status, 200)
  const mine = (await call('a', '/api/social', null, 'GET')).body
  assert.equal(mine.posts[0].reactions['🔥'], 1); assert.equal(mine.posts[0].comments[0].text, 'Boa!')
  assert.deepEqual(mine.notifications.slice(0, 2).map(n => n.kind), ['comment', 'reaction'])
  assert.equal((await call('a', '/api/social/seen', {})).status, 200)
  assert.equal((await call('a', '/api/social/unread', null, 'GET')).body.unread, 0)
  // A person's page.
  const page = (await call('b', '/api/social/person?username=alice', null, 'GET')).body
  assert.equal(page.profile.relation, 'friend'); assert.equal(page.profile.bio, 'hello'); assert.equal(page.posts.length, 1)
  assert.equal((await call('c', '/api/social/person?username=bob', null, 'GET')).body.profile.bio, undefined)
  // Deleting the post takes its photo along.
  assert.equal((await call('b', '/api/social/post/delete', { id: posted.body.id })).status, 404)
  assert.equal((await call('a', '/api/social/post/delete', { id: posted.body.id })).status, 200)
  assert.equal(fs.readdirSync(path.join(dir, 'social-photos')).length, 0)
  // Pokes: once a day, and the feed has it even without a push subscription.
  const poke = await call('a', '/api/social/poke', { id: 'b' })
  assert.equal(poke.status, 200); assert.equal(poke.body.pushed, false)
  assert.equal((await call('a', '/api/social/poke', { id: 'b' })).status, 429)
  assert.equal((await call('a', '/api/social/poke', { id: 'c' })).status, 403)
})

test('social: challenges use the phone day and name the winners', async t => {
  const { dir, call } = await start(t)
  await call('b', '/api/social/friend', { username: 'alice' }); await call('a', '/api/social/friend/accept', { id: 'b' })
  const today = localDay()
  const challenge = (await call('a', '/api/social/challenges', { title: '7 dias', days: 7, today })).body.challenge
  assert.equal(challenge.start, today); assert.equal(challenge.day, 1)
  assert.equal((await call('c', '/api/social/challenges/join', { id: challenge.id, today })).status, 403)
  assert.equal((await call('b', '/api/social/challenges', null, 'GET')).body.challenges.length, 1)
  assert.equal((await call('b', '/api/social/challenges/join', { id: challenge.id, today })).status, 200)
  assert.equal((await call('b', '/api/social/challenges/checkin', { id: challenge.id, today })).status, 409)
  fs.writeFileSync(path.join(dir, 'state-b.json'), JSON.stringify({ workouts: [{ d: today }] }))
  assert.equal((await call('b', '/api/social/challenges/checkin', { id: challenge.id, today })).status, 200)
  const list = (await call('a', '/api/social/challenges?today=' + today, null, 'GET')).body.challenges
  assert.equal(list[0].standings[0].id, 'b'); assert.equal(list[0].standings[0].days, 1); assert.equal(list[0].ended, false)
  const rank = (await call('a', '/api/social/ranking?today=' + today, null, 'GET')).body.rows
  assert.equal(rank.find(r => r.id === 'b').workouts, 1)
  assert.equal((await call('b', '/api/social/challenges/leave', { id: challenge.id })).status, 200)
})

test('social: a friend invite signs a new profile up as a friend', async t => {
  const { call } = await start(t, { env: { INVITE_ONLY: '1', EMAIL_LOGIN: '1' } })
  const invite = (await call('a', '/api/social/app-invite', {})).body.invite
  assert.match(invite.code, /^[0-9A-F]{16}$/)
  const r = await call(null, '/api/register/password', { name: 'Dani', username: 'dani', email: 'dani@example.com', password: 'a long enough password 123', code: invite.code })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  const home = (await call('a', '/api/social', null, 'GET')).body
  assert.equal(home.people[0].username, 'dani')
  assert.equal(home.notifications[0].kind, 'friend-joined')
})
