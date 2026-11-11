'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');
const { createMatchStore } = require('../lib/match-store');
const { installMatchRoutes } = require('../lib/match-routes');
const { fixture } = require('./fixtures');

test('postgame browser: concurrent panels, focused edits, conflict recovery, reconnect and failed save', { timeout: 60000 }, async t => {
  let failWrites = false;
  const app = express(); const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const store = createMatchStore({ initial: fixture(), persist: async () => { if (failWrites) throw Error('test disk failure'); },
    onCommit: result => { for (const client of wss.clients) client.send(JSON.stringify({ type: 'matchdata_update', ...result })); } });
  app.use(express.json());
  installMatchRoutes(app, () => store);
  app.get('/api/items', (req, res) => res.json(['oracle']));
  app.get('/api/mvp', (req, res) => res.json({ mvp: null }));
  app.use(express.static(path.join(__dirname, '../public')));
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.MLBB_TEST_BROWSER || undefined });
  t.after(async () => {
    await browser.close();
    for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  });
  const context = await browser.newContext();
  // Assets are not needed for state correctness; avoid dependence on production art and external fonts.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (/\/Assets\//i.test(url.pathname)) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=', 'base64') });
    return route.continue();
  });
  const a = await context.newPage(), b = await context.newPage();
  const errors = [];
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await Promise.all([a.goto(base + '/postgamecontrol.html'), b.goto(base + '/postgamecontrol.html')]);
  for (const page of [a, b]) await page.waitForFunction(() => document.querySelector('#blue-table tbody tr') && !document.querySelector('.container').inert);
  async function edit(page, selector, value) {
    await page.locator(selector).fill(value);
    await page.locator(selector).press('Tab');
    await page.waitForFunction(() => pendingSaves === 0);
  }
  // A is typing a turret change while B saves a different field from its own snapshot.
  await a.locator('#blue-turret').fill('4');
  await edit(b, '#blue-lord', '2');
  assert.equal(await a.locator('#blue-turret').inputValue(), '4');
  await a.locator('#blue-turret').press('Tab');
  await a.waitForFunction(() => pendingSaves === 0);
  assert.equal(store.snapshot().data.teamdata.blueteam.turret, '4');
  assert.equal(store.snapshot().data.teamdata.blueteam.lord, '2');
  // Allow a fresh snapshot before beginning the conflict scenario.
  await a.locator('h1').click(); await b.locator('h1').click();
  await b.waitForFunction(() => matchData.teamdata.blueteam.turret === '4');
  await a.locator('#blue-turret').fill('6');
  await edit(b, '#blue-turret', '5');
  await a.locator('#blue-turret').press('Tab');
  await a.waitForFunction(() => saveBlocked && pendingSaves === 0);
  assert.match(await a.locator('#save-status').innerText(), /not saved/i);
  assert.equal(store.snapshot().data.teamdata.blueteam.turret, '5');
  a.once('dialog', dialog => dialog.accept());
  await a.locator('#reload-match').click();
  await a.waitForFunction(() => !saveBlocked && matchData.teamdata.blueteam.turret === '5');
  // Reconnect must hydrate current server state without a page refresh.
  for (const socket of wss.clients) socket.close();
  const current = store.snapshot().data;
  await store.patch([{ path: ['game_duration'], previous: { exists: true, value: current.game_duration }, value: '08:42' }]);
  await a.waitForFunction(() => matchData.game_duration === '08:42');
  await a.waitForFunction(() => document.getElementById('match-connection').textContent === 'Live sync connected');
  failWrites = true;
  await edit(a, '#blue-lord', '9');
  await a.waitForFunction(() => saveBlocked);
  assert.match(await a.locator('#save-status').innerText(), /save failed/i);
  assert.equal(store.snapshot().data.teamdata.blueteam.lord, '2');
  assert.deepEqual(errors, []);
});
