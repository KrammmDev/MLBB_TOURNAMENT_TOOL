/* Shared match controls. Draft ordering, graphics and external APIs remain in their existing modules. */
(function (root) {
  'use strict';
  const session = root.ControlMatch;
  const byId = id => document.getElementById(id);
  const sideKey = side => side === 'blue' ? 'blueteam' : 'redteam';
  const manualIds = ['match-stage', 'match-group', 'match-number', 'game-number-text', 'lowerthird-title-input'];
  const inputValue = id => byId(id)?.value || '';
  function setValue(id, value) {
    const el = byId(id);
    if (el && document.activeElement !== el && !el.dataset.matchDirty) el.value = value ?? '';
  }
  function setText(id, value) { const el = byId(id); if (el) el.textContent = value; }
  function render(data) {
    for (const side of ['blue', 'red']) {
      const team = data.teamdata[sideKey(side)];
      setText(`${side}-score-control`, team.score || 0);
      setText(`${side}-turtle-ctrl`, team.turtles || 0); // Keep the existing turtles field; do not alias turtle silently.
      const start = side === 'blue' ? 3 : 10;
      setValue(`name-input-${side === 'blue' ? 1 : 8}`, team.teamname || team.name || '');
      setValue(`coach-input-${side}`, team.coach);
      setValue(`fullname-input-${side}`, team.fullname);
      for (let i = 0; i < 5; i++) {
        setValue(`name-input-${start + i}`, team.playerlist[i].name);
        setValue(`lane-select-${start + i}`, team.playerlist[i].lane || 'none');
      }
      const win = byId(`btn-win-${side}`);
      if (win) {
        const color = side === 'blue' ? '0,175,255' : '249,72,104';
        win.style.background = `rgba(${color},${data.winmatches === side ? '0.3' : '0.1'})`;
        win.style.boxShadow = data.winmatches === side ? `0 0 15px rgba(${color},0.5)` : '';
      }
    }
    root.blueScore = Number(data.teamdata.blueteam.score) || 0;
    root.redScore = Number(data.teamdata.redteam.score) || 0;
    setValue('game-number', data.game_number);
    const info = data.matchInfo || {};
    for (const [id, key] of [['match-stage', 'stage'], ['match-group', 'group'], ['match-number', 'match'], ['game-number-text', 'game']]) {
      setValue(id, info[key]);
    }
    setValue('lowerthird-title-input', data.title);
    const format = Number(data.matchFormat) || 3;
    localStorage.setItem('matchFormat', String(format));
    if (typeof root.highlightActiveFormat === 'function') root.highlightActiveFormat(format);
    if (typeof root.updateScoreDots === 'function') root.updateScoreDots();
  }
  function mark(el) { if (el) { el.dataset.matchDirty = 'true'; session.markDirty(el); } }
  function clean(el, value) {
    if (el && el.value === value) delete el.dataset.matchDirty;
    session.clean(el, value);
  }
  function run(action) {
    // Run immediately so an explicit reset/swap can flush staged input saves in order.
    try { return Promise.resolve(action()).catch(error => console.error('Match action not saved:', error.message)); }
    catch (error) { console.error('Match action not saved:', error.message); return Promise.resolve(); }
  }
  let commandTail = Promise.resolve();
  root.queueOperation = operation => {
    const task = commandTail.then(operation);
    commandTail = task.catch(() => {});
    return task.catch(error => console.error('Match action not saved:', error.message));
  };
  function saveInput(side, el, fields, statusId) {
    mark(el);
    const captured = el.value, value = captured.trim();
    const status = byId(statusId);
    if (session.status().blocked) { if (status) status.textContent = 'Not saved'; return; }
    if (status) { status.textContent = 'Saving...'; status.className = 'status-indicator saving'; }
    session.defer(el.id, () => run(async () => {
      try {
        await session.update(data => { for (const field of fields) data.teamdata[sideKey(side)][field] = value; });
        clean(el, captured);
        if (status && el.value === captured) { status.textContent = 'Saved'; status.className = 'status-indicator saved'; }
      } catch (error) {
        if (status) { status.textContent = 'Not saved'; status.className = 'status-indicator error'; }
        throw error;
      }
    }));
  }
  root.autoSaveTeamName = (side, el) => saveInput(side, el, ['teamname', 'name'], `${side}-status`);
  root.autoSaveCoachName = (side, el) => saveInput(side, el, ['coach'], `${side}-coach-status`);
  root.autoSaveFullName = (side, el) => saveInput(side, el, ['fullname'], `${side}-fullname-status`);
  root.adjustTurtle = (side, amount) => run(() => session.update(data => {
    const team = data.teamdata[sideKey(side)]; team.turtles = Math.max(0, (Number(team.turtles) || 0) + amount);
  }));
  root.addWinQueued = side => root.queueOperation(async () => {
    await session.update(data => { const team = data.teamdata[sideKey(side)]; team.score = (Number(team.score) || 0) + 1; });
    // Preserve the normal panel's existing stats action, only after a successful score save.
    if (typeof root.recordHeroStats === 'function') await root.recordHeroStats(side);
  });
  root.minusWinQueued = side => root.queueOperation(() => session.update(data => {
    const team = data.teamdata[sideKey(side)]; team.score = Math.max(0, (Number(team.score) || 0) - 1);
  }));
  root.resetScore = () => run(() => session.update(data => {
    data.teamdata.blueteam.score = 0; data.teamdata.redteam.score = 0;
  }));
  root.setFormat = format => run(() => session.update(data => {
    data.matchFormat = format; data.teamdata.blueteam.score = 0; data.teamdata.redteam.score = 0;
  }));
  root.manualSaveMatchInfo = () => run(async () => {
    const ids = ['match-stage', 'match-group', 'match-number', 'game-number-text'];
    const captured = ids.map(inputValue);
    if (!ids.some(id => byId(id)?.dataset.matchDirty)) return;
    await session.update(data => {
      const previous = data.matchInfo || {};
      const info = { ...previous };
      for (const [i, key] of ['stage', 'group', 'match', 'game'].entries()) {
        if (byId(ids[i])?.dataset.matchDirty) info[key] = captured[i].trim();
      }
      info.text = `${info.match || ''} ${info.game || ''}`.trim();
      data.matchInfo = info;
    });
    ids.forEach((id, i) => clean(byId(id), captured[i]));
  });
  root.updateLowerThirdTitle = () => run(async () => {
    const el = byId('lowerthird-title-input'), value = el.value;
    await session.update(data => { data.title = value.trim(); });
    clean(el, value);
  });
  root.updateGameInfo = (field, value) => run(async () => {
    await session.update(data => { data[field] = value; });
    if (field === 'game_number') clean(byId('game-number'), inputValue('game-number'));
  });
  root.setWinner = side => run(() => session.update(data => { data.winmatches = side; }));
  root.safeOperation = original => root.queueOperation(async () => { await original(); render(session.get()); });
  root.safeResetNames = () => root.safeOperation(root.resetNames);
  root.safeResetImages = () => root.safeOperation(root.resetImages);
  root.safeSwitchNames = () => root.safeOperation(root.switchNames);
  root.safeSwitchImages = () => root.safeOperation(root.switchImages);
  for (const name of ['forceUpdateDisplay', 'loadTeamNames', 'loadScoreOnly', 'loadScore', 'loadGameState']) {
    root[name] = async () => {
      try { if (!session.get()) await session.ready; render(session.get()); }
      catch (error) { console.error(error.message); }
    };
  }
  root.startAutoSync = () => {}; // The shared client owns one socket and its recovery poll.
  root.stopAutoSync = () => {};
  session.onChange(render);
  for (const id of manualIds) {
    const el = byId(id);
    if (el) el.addEventListener('input', () => mark(el));
  }
  const game = byId('game-number');
  if (game) {
    game.addEventListener('input', () => mark(game));
    game.addEventListener('change', () => root.updateGameInfo('game_number', Number(game.value)));
  }
  for (const id of ['match-stage', 'match-group', 'match-number', 'game-number-text']) {
    byId(id)?.addEventListener('change', root.manualSaveMatchInfo);
  }
  document.addEventListener('control-match-reloaded', () => {
    for (const el of document.querySelectorAll('[data-match-dirty]')) delete el.dataset.matchDirty;
    render(session.get());
    for (const el of document.querySelectorAll('.status-indicator')) { el.textContent = 'Idle'; el.className = 'status-indicator idle'; }
  });
})(window);
