#!/usr/bin/env node
/* Retake Gym: gives a profile its sign-in e-mail, user name and password, from the server itself.
 *
 *   docker compose -f deploy/docker-compose.yml exec api node set-login.js "Victor" --email voce@exemplo.com --username victor
 *   docker compose -f deploy/docker-compose.yml exec api node set-login.js "Victor"            (só troca a senha)
 *   ... node set-login.js --id <profile id> ...                                           (vários com o mesmo nome)
 *
 * The password is asked for on the terminal (twice, not shown), or read from standard input with
 * --password-stdin. --no-password changes only the e-mail and/or the user name.
 *
 * It is how a profile made with a passkey moves to e-mail sign-in, and how the owner, whom no
 * admin can reset, replaces a forgotten password. Like recover.js it asks the running server over
 * its local admin socket (admin-socket.js) instead of editing db.json behind its back. A new
 * password signs the profile out on every device.
 */
import readline from 'node:readline';
import { askAdminSocket, socketPath } from './admin-socket.js';

const args = process.argv.slice(2);
let id = null, email = null, username = null, stdin = false, noPassword = false, help = false;
const words = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--id') id = args[++i] || null;
  else if (a === '--email') email = args[++i] || '';
  else if (a === '--username') username = args[++i] || '';
  else if (a === '--password-stdin') stdin = true;
  else if (a === '--no-password') noPassword = true;
  else if (a === '--help' || a === '-h') help = true;
  else if (!a.startsWith('-')) words.push(a);
}
const name = words.join(' ').trim();

if (help || (!name && !id)) {
  console.log('uso: node set-login.js "<nome, e-mail ou usuário do perfil>" [--email E] [--username U] [--no-password | --password-stdin]');
  console.log('     node set-login.js --id <id do perfil> ...');
  process.exit(help ? 0 : 2);
}

function ask(question, hidden) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}
async function readAll() {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return s.replace(/\r?\n$/, '');
}

let password = null;
if (!noPassword) {
  if (stdin) password = await readAll();
  else if (process.stdin.isTTY) {
    password = await ask('Nova senha (mínimo 10 caracteres): ', true);
    const again = await ask('Repita a senha: ', true);
    if (password !== again) { console.error('As duas senhas não são iguais. Nada foi mudado.'); process.exit(1); }
  } else {
    console.error('Sem terminal para perguntar a senha: use --password-stdin, ou --no-password.');
    process.exit(2);
  }
}

try {
  const r = await askAdminSocket({ cmd: 'set-login', ...(id ? { id } : { name }), ...(email != null ? { email } : {}), ...(username != null ? { username } : {}), ...(password ? { password } : {}) });
  if (r.ok) {
    console.log(`Pronto: "${r.name}" (${r.id})`);
    if (r.email) console.log(`  e-mail:  ${r.email}`);
    if (r.username) console.log(`  usuário: @${r.username}`);
    if (r.password) console.log('  senha:   trocada. O perfil foi desconectado em todos os aparelhos; entre de novo com o e-mail e a senha.');
    if (!r.emailLogin) console.log('  Aviso: EMAIL_LOGIN não está ligado no .env, então o app ainda não mostra o login por e-mail.');
    process.exit(0);
  }
  console.error(r.error || 'o servidor não fez a mudança');
  for (const m of r.matches || []) console.error(`  --id ${m.id}   "${m.name}"${m.email ? ' ' + m.email : ''}, criado em ${m.created || '?'}`);
  process.exit(1);
} catch (e) {
  if (e.code === 'ENOENT' || e.code === 'ECONNREFUSED') {
    console.error(`O servidor não está rodando aqui (sem ${socketPath()}). Suba ele primeiro e rode isto de novo dentro dele.`);
  } else {
    console.error('Não consegui falar com o servidor:', e.message);
  }
  process.exit(1);
}
