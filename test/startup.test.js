'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { WebSocket } = require('ws');
const { fixture } = require('./fixtures');

async function sandbox(t, raw) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlbb-startup-'));
  const source = path.join(__dirname, '..');
  await fs.copyFile(path.join(source, 'server.js'), path.join(dir, 'server.js'));
  await fs.cp(path.join(source, 'lib'), path.join(dir, 'lib'), { recursive: true });
  await fs.mkdir(path.join(dir, 'public/script'), { recursive: true });
  for (const script of ['match-state.js', 'roster-themes.js']) {
    await fs.copyFile(path.join(source, 'public/script', script), path.join(dir, 'public/script', script));
  }
  await fs.mkdir(path.join(dir, 'public/database'), { recursive: true });
  const file = path.join(dir, 'public/database/matchdatateam.json');
  await fs.writeFile(file, raw);
  const child = spawn(process.execPath, ['server.js'], { cwd: dir,
    env: { ...process.env, PORT: '0', NODE_PATH: path.join(source, 'node_modules') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(); await new Promise(resolve => child.once('exit', resolve));
    }
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { child, file, dir, output: () => output };
}
async function waitUntil(predicate) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw Error('Timed out waiting for server');
}

test('real server loads saved match before accepting traffic and preserves event/POST compatibility', { timeout: 15000 }, async t => {
  const data = fixture(); data.game_duration = '17:42';
  const env = await sandbox(t, JSON.stringify(data));
  await waitUntil(() => /Local:\s+http:\/\/localhost:\d+/.test(env.output()));
  const port = env.output().match(/Local:\s+http:\/\/localhost:(\d+)/)[1];
  const url = `http://127.0.0.1:${port}/api/matchdata`;
  assert.deepEqual(await (await fetch(url)).json(), data);
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  t.after(() => socket.terminate());
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const messages = [];
  socket.on('message', body => messages.push(JSON.parse(body)));
  data.teamdata.redteam.score = '2';
  const saved = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal(saved.status, 200);
  await waitUntil(() => messages.some(m => m.type === 'update'));
  assert.deepEqual(messages.find(m => m.type === 'matchdata_update').data, data);
  assert.deepEqual(messages.find(m => m.type === 'update').data.matchdata, data);
  assert.deepEqual(JSON.parse(await fs.readFile(env.file, 'utf8')), data);
  const themeUrl = `http://127.0.0.1:${port}/api/roster-theme`;
  const theme = await (await fetch(themeUrl)).json();
  const chosen = await fetch(themeUrl, { method:'PUT', headers:{'Content-Type':'application/json','If-Match':theme.revision}, body:JSON.stringify({themeId:'arena'}) });
  assert.equal(chosen.status,200);
  const storedTheme = JSON.parse(await fs.readFile(path.join(env.dir,'runtime/roster-theme.json'),'utf8'));
  assert.equal(storedTheme.themeId,'arena');
  assert.deepEqual(await (await fetch(url)).json(),data);
});

test('corrupt saved match stops startup without replacing the original file', { timeout: 15000 }, async t => {
  const raw = '{ corrupt saved match';
  const env = await sandbox(t, raw);
  await waitUntil(() => env.child.exitCode !== null);
  assert.equal(env.child.exitCode, 1);
  assert.match(env.output(), /Cannot load match data safely/);
  assert.doesNotMatch(env.output(), /SERVER STARTED/);
  assert.equal(await fs.readFile(env.file, 'utf8'), raw);
});
