/* Retake Gym: EMAIL_LOGIN. Sign-up asks for an e-mail and a unique user name, sign-in takes the
   e-mail or the user name (never the display name), the phone app gets the same through /api/app/*
   with a token in the body and no cookie, and the profile's name, user name and photo can be
   changed. Same harness shape as server-email.test.js. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../password.js';
import { boundPort } from './helpers.mjs';
import { askAdminSocket } from '../admin-socket.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';
const GOOD = 'correct horse battery staple';
let pwHash;
before(async () => { pwHash ??= await hashPassword(GOOD); });

const mintSession = (uid, sv = 0) => {
  const payload = `${uid}:${Date.now() + 86400000}:${sv}`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

async function startServer(t, { env = {}, users = [] } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-el-'));
  const sockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-el-sock-'));
  fs.chmodSync(sockDir, 0o700);
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites: [] }));
  const envAll = {
    ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', ADMIN_SOCKET_DIR: sockDir,
    EMAIL_LOGIN: '1', PASSWORD_LOGIN: '', TRUST_PROXY: '1', INVITE_ONLY: '', ADMIN_UIDS: '', AUDIT_LOG: '1', ...env
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: API, stdio: ['ignore', 'pipe', 'pipe'], env: envAll });
  const h = { log: '', dataDir, env: envAll };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(sockDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.req = async (method, p, { body, cookie, bearer, ip = '198.51.100.1', headers = {} } = {}) => {
    const r = await fetch(`${h.api}${p}`, {
      method,
      headers: {
        'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'X-Forwarded-For': ip,
        ...(cookie ? { Cookie: cookie } : {}), ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = r.headers.getSetCookie().find(c => c.startsWith('gymsid=') && !c.startsWith('gymsid=;'));
    return { status: r.status, body: await r.json(), cookie: setCookie ? setCookie.split(';')[0] : null };
  };
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  h.admin = msg => askAdminSocket(msg, { env: envAll });
  return h;
}
const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const withPassword = (id, name, extra = {}) => user(id, name, { pw: { h: pwHash, set: new Date().toISOString() }, ...extra });
// The phone app's WebView: another origin, as a browser would label it.
const APP = { headers: { Origin: 'https://localhost', 'Sec-Fetch-Site': 'cross-site' } };

test('config says email_login, and password sign-in is on with it', async t => {
  const h = await startServer(t);
  const c = await h.req('GET', '/api/config');
  assert.equal(c.body.email_login, true);
  assert.equal(c.body.password_login, true);
});

test('sign-up needs an e-mail and a valid, unique user name; the name is only for display', async t => {
  const h = await startServer(t, { users: [withPassword('u1', 'Ana', { email: 'ana@example.com', username: 'ana' })] });
  const reg = body => h.req('POST', '/api/register/password', { body });
  assert.equal((await reg({ name: 'Bia', username: 'bia', password: GOOD })).body.code, 'email-missing');
  assert.equal((await reg({ name: 'Bia', email: 'bia@example.com', password: GOOD })).body.code, 'username-missing');
  assert.equal((await reg({ name: 'Bia', email: 'bia@example.com', username: 'b!', password: GOOD })).body.code, 'username-invalid');
  assert.equal((await reg({ name: 'Bia', email: 'bia@example.com', username: '@ANA', password: GOOD })).body.code, 'username-taken');
  assert.equal((await reg({ name: 'Bia', email: 'bia@example.com', username: 'admin', password: GOOD })).body.code, 'username-taken');
  assert.equal((await reg({ name: 'Bia', email: 'ANA@example.com', username: 'bia', password: GOOD })).body.code, 'email-taken');
  // The display name of another profile is fine here.
  const ok = await reg({ name: 'Ana', email: 'Bia@Example.com', username: '@Bia_2', password: GOOD });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.username, 'bia_2');
  assert.ok(ok.cookie);
  const row = h.db().users.find(u => u.username === 'bia_2');
  assert.equal(row.email, 'bia@example.com');
  assert.equal(row.name, 'Ana');
});

test('signs in with the e-mail or the user name, never the display name', async t => {
  const h = await startServer(t, { users: [withPassword('u1', 'Ana Paula', { email: 'ana@example.com', username: 'anap' })] });
  const signIn = identifier => h.req('POST', '/api/login/password', { body: { identifier, password: GOOD } });
  assert.equal((await signIn('ANA@example.com')).status, 200);
  assert.equal((await signIn('anap')).status, 200);
  assert.equal((await signIn('@AnaP')).status, 200);
  assert.equal((await signIn('Ana Paula')).status, 401);
});

test('the phone app signs up and in from its own origin and gets a token, never a cookie', async t => {
  const h = await startServer(t);
  // The browser's cookie route still refuses a cross-site caller (login CSRF).
  const cross = await h.req('POST', '/api/login/password', { body: { identifier: 'x@example.com', password: GOOD }, ...APP });
  assert.equal(cross.status, 403);
  const reg = await h.req('POST', '/api/app/register', { body: { name: 'Caio', email: 'caio@example.com', username: 'caio', password: GOOD }, ...APP });
  assert.equal(reg.status, 200);
  assert.ok(reg.body.token);
  assert.equal(reg.cookie, null);
  const me = await h.req('GET', '/api/me', { bearer: reg.body.token, ...APP });
  assert.equal(me.body.user.username, 'caio');
  const login = await h.req('POST', '/api/app/login', { body: { identifier: 'caio', password: GOOD }, ...APP });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  assert.equal(login.cookie, null);
  assert.equal((await h.req('POST', '/api/app/login', { body: { identifier: 'caio', password: 'wrong wrong wrong' }, ...APP })).status, 401);
});

test('without PASSWORD_LOGIN or EMAIL_LOGIN the app routes do not exist', async t => {
  const h = await startServer(t, { env: { EMAIL_LOGIN: '' } });
  assert.equal((await h.req('POST', '/api/app/login', { body: { identifier: 'a', password: GOOD }, ...APP })).status, 404);
  assert.equal((await h.req('GET', '/api/config')).body.email_login, undefined);
});

test('name and user name can be changed; a taken user name is refused', async t => {
  const h = await startServer(t, { users: [withPassword('u1', 'Ana', { email: 'ana@example.com', username: 'ana' }), withPassword('u2', 'Bia', { email: 'bia@example.com', username: 'bia' })] });
  const cookie = `gymsid=${mintSession('u1')}`;
  assert.equal((await h.req('POST', '/api/account/profile', { body: { username: 'bia' }, cookie })).body.code, 'username-taken');
  assert.equal((await h.req('POST', '/api/account/profile', { body: { username: '' }, cookie })).body.code, 'username-missing');
  const r = await h.req('POST', '/api/account/profile', { body: { name: 'Ana Souza', username: 'ana.souza' }, cookie });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'Ana Souza');
  assert.equal(r.body.user.username, 'ana.souza');
  assert.equal((await h.req('POST', '/api/account/profile', { body: { name: 'x' } })).status, 401);
});

test('a photo is stored beside db.json, readable by signed-in profiles, and removable', async t => {
  const h = await startServer(t, { users: [withPassword('u1', 'Ana', { username: 'ana' }), withPassword('u2', 'Bia', { username: 'bia' })] });
  const cookie = `gymsid=${mintSession('u1')}`;
  const pic = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg bytes').toString('base64');
  assert.equal((await h.req('POST', '/api/account/avatar', { body: { avatar: 'data:text/html;base64,PGI+' }, cookie })).body.code, 'avatar-invalid');
  const set = await h.req('POST', '/api/account/avatar', { body: { avatar: pic }, cookie });
  assert.equal(set.status, 200);
  assert.ok(set.body.user.avatar);
  assert.equal(JSON.stringify(h.db()).includes('fake'), false);
  const other = await h.req('GET', '/api/account/avatar?id=u1', { cookie: `gymsid=${mintSession('u2')}` });
  assert.equal(other.body.avatar, pic);
  assert.equal((await h.req('GET', '/api/account/avatar?id=u1')).status, 401);
  const gone = await h.req('POST', '/api/account/avatar', { body: { avatar: null }, cookie });
  assert.equal(gone.body.user.avatar, undefined);
  assert.equal((await h.req('GET', '/api/account/avatar', { cookie })).body.avatar, null);
});

test('set-login gives a passkey profile an e-mail, a user name and a password', async t => {
  const h = await startServer(t, { users: [user('u1', 'Victor', { admin: true, owner: true })] });
  const bad = await h.admin({ cmd: 'set-login', name: 'Victor', email: 'x', password: GOOD });
  assert.match(bad.error, /e-mail/);
  const weak = await h.admin({ cmd: 'set-login', name: 'Victor', password: 'short' });
  assert.match(weak.error, /10 characters/);
  const r = await h.admin({ cmd: 'set-login', name: 'victor', email: 'Victor@Example.com', username: 'victor', password: GOOD });
  assert.equal(r.ok, true);
  assert.equal(r.email, 'victor@example.com');
  const login = await h.req('POST', '/api/login/password', { body: { identifier: 'victor@example.com', password: GOOD } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, 'u1');
});

test('with INVITE_ONLY the e-mail sign-up still needs a valid invite, from the app too', async t => {
  const h = await startServer(t, { env: { INVITE_ONLY: '1' }, users: [withPassword('u0', 'Victor', { username: 'victor', email: 'v@example.com' })] });
  assert.equal((await h.req('GET', '/api/config')).body.invite_only, true);
  const body = { name: 'Ana', username: 'ana', email: 'ana@example.com', password: GOOD };
  assert.equal((await h.req('POST', '/api/app/register', { body, ...APP })).body.code, 'invite');
  assert.equal((await h.req('POST', '/api/app/register', { body: { ...body, code: 'NOPE' }, ...APP })).body.code, 'invite');
});
