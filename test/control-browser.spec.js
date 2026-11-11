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
const state = require('../public/script/match-state');
const { fixture } = require('./fixtures');

for (const variant of ['control.html', 'controlban6.html']) {
  test(`${variant}: shared field saves, debounce, postgame concurrency, score failure, draft mirror and reconnect`, { timeout: 60000 }, async t => {
    let failWrites = false, statsCalls = 0, matchPosts = 0;
    const initial = fixture();
    initial.matchInfo = { stage: 'Group Stage', group: 'A', match: 'Match 1', game: 'Game 1', text: 'Match 1 Game 1' };
    initial.matchFormat = 3; initial.title = 'Original title';
    const app = express(), server = http.createServer(app), wss = new WebSocketServer({ server });
    const broadcast = message => { for (const socket of wss.clients) socket.send(JSON.stringify(message)); };
    const store = createMatchStore({ initial, persist: async () => { if (failWrites) throw Error('test storage failure'); },
      onCommit: result => broadcast({ type: 'matchdata_update', ...result }) });
    let draft = { draftdata: { timer: '50', timer_running: false, current_phase: 0,
      blueside: { pick: Array.from({length:5}, () => ({})), ban: Array.from({length:5}, () => ({})) },
      redside: { pick: Array.from({length:5}, () => ({})), ban: Array.from({length:5}, () => ({})) } } };
    app.use(express.json({limit:'5mb'}));
    app.use((req,res,next) => { if (req.method === 'POST' && req.path === '/api/matchdata') matchPosts++; next(); });
    installMatchRoutes(app, () => store);
    app.get('/api/players', (req,res) => res.json([]));
    app.get('/api/items', (req,res) => res.json(['oracle']));
    app.get('/api/mvp', (req,res) => res.json({mvp:null}));
    app.get('/api/matchdraft', (req,res) => res.json(draft));
    app.post('/api/matchdraft', (req,res) => { draft = req.body; broadcast({type:'draftdata_update',data:draft.draftdata}); res.json({message:'saved'}); });
    app.post('/api/record-hero-stats', (req,res) => { statsCalls++; res.json({resolvedCount:0,unresolvedCount:0}); });
    app.use(express.static(path.join(__dirname,'../public')));
    server.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
    const browser = await chromium.launch({executablePath:process.env.MLBB_TEST_BROWSER || undefined});
    t.after(async () => { await browser.close(); for(const socket of wss.clients) socket.terminate(); await new Promise(resolve=>wss.close(resolve)); await new Promise(resolve=>server.close(resolve)); });
    const context = await browser.newContext();
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='127.0.0.1')return route.abort();
      if(/\/Assets\//i.test(url.pathname))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=','base64')});
      return route.continue();
    });
    const a=await context.newPage(), b=await context.newPage(), errors=[];
    for(const page of [a,b])page.on('pageerror',error=>errors.push(error.message));
    const base=`http://127.0.0.1:${server.address().port}`;
    await Promise.all([a.goto(base+'/'+variant),b.goto(base+'/postgamecontrol.html')]);
    await a.waitForFunction(()=>window.ControlMatch?.get() && !document.querySelector('.content-wrapper').inert && currentDraftData);
    await b.waitForFunction(()=>Boolean(matchData.teamdata));
    const idle=()=>a.waitForFunction(()=>!ControlMatch.status().pending && !ControlMatch.status().timers);
    // Both teams' debounced edits must survive; no shared timeout cancels the other side.
    await a.locator('#name-input-1').fill('Team North');
    await a.locator('#name-input-8').fill('Team South');
    await a.locator('h1').click(); await idle();
    assert.equal(store.snapshot().data.teamdata.blueteam.teamname,'Team North');
    assert.equal(store.snapshot().data.teamdata.redteam.teamname,'Team South');
    // Typing a player name is independent of postgame gold and does not replace its document.
    await a.locator('#name-input-3').fill('New Player');
    await b.locator('#blue-table tbody tr').first().locator('input[type="number"]').nth(1).fill('1234');
    await b.locator('h1').click(); await b.waitForFunction(()=>pendingSaves===0);
    await a.locator('h1').click(); await idle();
    assert.equal(store.snapshot().data.teamdata.blueteam.playerlist[0].name,'New Player');
    assert.equal(store.snapshot().data.teamdata.blueteam.playerlist[0].gold,'1234');
    // Hold an unsaved title while another panel updates an unrelated field.
    await a.locator('#lowerthird-title-input').fill('Finals tonight');
    const before=store.snapshot().data;
    await store.patch([{path:['teamdata','redteam','lord'],previous:state.at(before,['teamdata','redteam','lord']),value:2}]);
    await a.waitForTimeout(100);
    assert.equal(await a.locator('#lowerthird-title-input').inputValue(),'Finals tonight');
    await a.locator('[onclick="updateLowerThirdTitle()"]').click(); await idle();
    assert.equal(store.snapshot().data.title,'Finals tonight');
    assert.equal(store.snapshot().data.teamdata.redteam.lord,2);
    // Numeric score increment and per-side isolation, including string scores loaded from disk.
    await a.locator('[onclick="addWinQueued(\'blue\')"]').click(); await idle();
    assert.equal(store.snapshot().data.teamdata.blueteam.score,1);
    await a.waitForTimeout(50);
    assert.equal(statsCalls,variant==='control.html'?1:0);
    // A rejected score write must neither count statistics nor report success.
    failWrites=true;
    await a.locator('[onclick="addWinQueued(\'blue\')"]').click();
    await a.waitForFunction(()=>ControlMatch.status().blocked && !ControlMatch.status().pending);
    assert.equal(store.snapshot().data.teamdata.blueteam.score,1);
    assert.equal(statsCalls,variant==='control.html'?1:0);
    assert.match(await a.locator('#control-save-status').innerText(),/failed/i);
    failWrites=false; a.once('dialog',dialog=>dialog.accept()); await a.locator('#control-reload').click();
    await a.waitForFunction(()=>!ControlMatch.status().blocked);
    // Team nickname switch carries its existing identity fields together, retaining game stats.
    await a.locator('[onclick="safeSwitchNames()"]').click(); await idle();
    assert.equal(store.snapshot().data.teamdata.blueteam.teamname,'Team South');
    assert.equal(store.snapshot().data.teamdata.redteam.teamname,'Team North');
    assert.equal(store.snapshot().data.teamdata.blueteam.playerlist[0].gold,'1234');
    // Format reset is one targeted batch, and logo operations do not rewrite player stats.
    await a.locator('[onclick="setFormat(5)"]').click(); await idle();
    assert.equal(store.snapshot().data.matchFormat,5);
    assert.equal(store.snapshot().data.teamdata.blueteam.score,0);
    assert.equal(store.snapshot().data.teamdata.redteam.score,0);
    await a.locator('#file1').setInputFiles({name:'logo.png',mimeType:'image/png',
      buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=','base64')});
    await a.waitForFunction(()=>ControlMatch.get().teamdata.blueteam.logo?.startsWith('data:image/png'));
    await idle();
    assert.ok(store.snapshot().data.teamdata.blueteam.logo.startsWith('data:image/png'));
    await a.locator('[onclick="safeSwitchImages()"]').click(); await idle();
    assert.ok(store.snapshot().data.teamdata.redteam.logo.startsWith('data:image/png'));
    await a.locator('[onclick="safeResetImages()"]').click(); await idle();
    assert.equal(store.snapshot().data.teamdata.redteam.logo,'');
    assert.equal(store.snapshot().data.teamdata.blueteam.playerlist[0].gold,'1234');
    // Successful first ban still follows this variant's existing phase order.
    await a.locator('#search-11').fill('Alpha');
    await a.locator('#dropdown-items-11 div').filter({hasText:/^Alpha$/}).click();
    await a.waitForFunction(()=>currentDraftData.current_phase===1); await idle();
    assert.equal(store.snapshot().data.teamdata.blueteam.playerlist[0].banhero,'Alpha');
    assert.equal(draft.draftdata.current_phase,1);
    // A failed mirror cannot mutate draft slots or advance the draft.
    await a.evaluate(()=>toggleCorrectionMode());
    const draftBefore=JSON.stringify(draft);
    failWrites=true;
    await a.locator('#search-16').fill('Balmond');
    await a.locator('#dropdown-items-16 div').filter({hasText:/^Balmond$/}).click();
    await a.waitForFunction(()=>ControlMatch.status().blocked && !ControlMatch.status().pending);
    assert.equal(JSON.stringify(draft),draftBefore);
    failWrites=false; a.once('dialog',dialog=>dialog.accept()); await a.locator('#control-reload').click();
    await a.waitForFunction(()=>!ControlMatch.status().blocked);
    // Reconnect rehydrates the current server match, with no stale browser-state replay.
    for(const socket of wss.clients)socket.close();
    const latest=store.snapshot().data;
    await store.patch([{path:['title'],previous:state.at(latest,['title']),value:'Reconnected title'}]);
    await a.waitForFunction(()=>ControlMatch.get().title==='Reconnected title');
    // Freeze the displayed name while another writer changes that same field.
    await a.locator('#name-input-1').fill('Local stale name');
    const conflictBase=store.snapshot().data;
    await store.patch(['teamname','name'].map(field=>({path:['teamdata','blueteam',field],
      previous:state.at(conflictBase,['teamdata','blueteam',field]),value:'Remote name'})));
    await a.waitForFunction(()=>ControlMatch.status().blocked && !ControlMatch.status().pending && !ControlMatch.status().timers);
    assert.match(await a.locator('#control-save-status').innerText(),/another panel/i);
    assert.equal(store.snapshot().data.teamdata.blueteam.teamname,'Remote name');
    a.once('dialog',dialog=>dialog.accept()); await a.locator('#control-reload').click();
    await a.waitForFunction(()=>!ControlMatch.status().blocked);
    assert.equal(await a.locator('#name-input-1').inputValue(),'Remote name');
    // An explicit reset must finish after staged input saves, never be undone by a late debounce.
    await a.locator('#name-input-1').fill('Unsent name');
    await a.locator('[onclick="safeResetNames()"]').click(); await idle();
    assert.equal(store.snapshot().data.teamdata.blueteam.teamname,'');
    assert.equal(store.snapshot().data.teamdata.redteam.teamname,'');
    assert.equal(store.snapshot().data.teamdata.blueteam.playerlist[0].name,'');
    // Initial server outage remains recoverable without leaving the panel permanently inert.
    const recovery = await context.newPage();
    recovery.on('pageerror', error => errors.push(error.message));
    let firstRead = true;
    await recovery.route('**/api/matchdata', route => {
      if (firstRead && route.request().method() === 'GET') {
        firstRead = false;
        return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary outage'})});
      }
      return route.continue();
    });
    await recovery.goto(base+'/'+variant);
    await recovery.waitForFunction(()=>ControlMatch.status().blocked);
    recovery.once('dialog',dialog=>dialog.accept());
    await recovery.locator('#control-reload').click();
    await recovery.waitForFunction(()=>!ControlMatch.status().blocked && !document.querySelector('.content-wrapper').inert);
    if (variant === 'control.html') await recovery.waitForFunction(()=>playerListLoaded);
    await recovery.locator('#name-input-1').fill('Recovered');
    await recovery.locator('h1').click();
    await recovery.waitForFunction(()=>!ControlMatch.status().pending && !ControlMatch.status().timers);
    assert.equal(store.snapshot().data.teamdata.blueteam.teamname,'Recovered');
    assert.equal(matchPosts,0);
    assert.deepEqual(errors,[]);
  });
}
