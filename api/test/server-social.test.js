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
test('social privacy, photos, friendships and workout-backed challenge check-ins', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-social-'))
  const secret = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(path.join(dir, 'secret'), secret)
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: [{ id: 'a', name: 'Alice', username: 'alice' }, { id: 'b', name: 'Bob', username: 'bob' }, { id: 'c', name: 'Carol', username: 'carol' }], creds: [], subs: [], invites: [] }))
  const child = spawn(process.execPath, ['server.js'], { cwd: API, env: { ...process.env, PORT: '0', DATA_DIR: dir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' }, stdio: ['ignore','pipe','pipe'] })
  let log = ''; child.stdout.on('data', x => log += x); child.stderr.on('data', x => log += x)
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dir, { recursive: true, force: true }) })
  const port = await boundPort(child, () => log)
  const session = id => { const payload = `${id}:${Date.now()+86400000}:0`; return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url') }
  const call = async (id, route, body, method = 'POST') => { const r = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { Cookie: `gymsid=${session(id)}`, Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() } }
  assert.equal((await call('b','/api/social/post',{ kind:'workout', text:'private' })).status, 409)
  assert.equal((await call('a','/api/social/profile',{ bio: 'hello', visibility: 'public', showInRankings: true },'PUT')).status, 200)
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
  assert.equal((await call('a','/api/social/post',{ kind:'meal', text:'Lunch', scope:'friends', photo })).status, 201)
  assert.equal((await call('c','/api/social',null,'GET')).body.posts.length, 0)
  assert.equal((await call('b','/api/social?q=ali',null,'GET')).body.found[0].username, 'alice')
  assert.equal((await call('b','/api/social/friend',{ username:'bad' })).status, 404)
  assert.equal((await call('b','/api/social/friend',{ username:'alice' })).status, 200)
  assert.equal((await call('a','/api/social/friend/accept',{ id:'b' })).status, 200)
  assert.equal((await call('b','/api/social',null,'GET')).body.posts.length, 1)
  const challenge = (await call('a','/api/social/challenges',{ title:'30 days', days:30 })).body.challenge
  assert.equal((await call('b','/api/social/challenges',null,'GET')).body.challenges.length, 1)
  assert.equal((await call('b','/api/social/challenges/join',{ id:challenge.id })).status, 200)
  assert.equal((await call('b','/api/social/challenges/checkin',{ id:challenge.id })).status, 409)
  fs.writeFileSync(path.join(dir,'state-b.json'), JSON.stringify({ workouts:[{ d:new Date().toISOString().slice(0,10) }] }))
  assert.equal((await call('b','/api/social/challenges/checkin',{ id:challenge.id })).status, 200)
})
