// Names, lanes and logos share the same guarded match session as the control panel.
let currentBlueLogo = '';
let currentRedLogo = '';
const identitySides = ['blueteam', 'redteam'];
function clearIdentityDirty() {
  for (const el of document.querySelectorAll('input[id^="name-input-"], select[id^="lane-select-"], input[id^="coach-input-"], input[id^="fullname-input-"], input[type="file"]')) {
    delete el.dataset.matchDirty;
    ControlMatch.clean(el, el.value);
  }
}
async function loadFromServer() {
  if (!ControlMatch.get()) await ControlMatch.ready;
  await loadTeamNames();
}
function updateMatchDisplay() {
  const match = document.getElementById('match-number');
  const game = document.getElementById('game-number-text');
  const display = document.getElementById('match-display');
  if (display && match && game) display.textContent = `${match.value} ${game.value}`.toUpperCase();
}
function saveIdentityInput(el, team, index, field) {
  const value = el.value;
  el.dataset.matchDirty = 'true'; ControlMatch.markDirty(el);
  ControlMatch.defer(el.id, () => {
    ControlMatch.update(data => { data.teamdata[team].playerlist[index][field] = value; })
      .then(() => { if (el.value === value) delete el.dataset.matchDirty; ControlMatch.clean(el, value); })
      .catch(error => console.error('Player edit not saved:', error.message));
  });
}
function setupAutoSave() {
  for (const [team, start] of [['blueteam', 3], ['redteam', 10]]) {
    for (let i = 0; i < 5; i++) {
      const name = document.getElementById(`name-input-${start + i}`);
      const lane = document.getElementById(`lane-select-${start + i}`);
      name?.addEventListener('input', () => saveIdentityInput(name, team, i, 'name'));
      lane?.addEventListener('change', () => saveIdentityInput(lane, team, i, 'lane'));
    }
  }
}
function setupLogoUpload() {
  for (const [id, team] of [['file1', 'blueteam'], ['file2', 'redteam']]) {
    const input = document.getElementById(id);
    let selection = 0;
    input?.addEventListener('change', () => {
      const version = ++selection;
      const file = input.files[0];
      if (!file) return;
      ControlMatch.markDirty(input);
      const captured = input.value;
      const reader = new FileReader();
      reader.onload = () => {
        if (version !== selection || input.value !== captured) return;
        ControlMatch.update(data => { data.teamdata[team].logo = reader.result; })
          .then(() => ControlMatch.clean(input, captured))
          .catch(error => console.error('Logo not saved:', error.message));
      };
      reader.onerror = () => { if (version !== selection) return; ControlMatch.clean(input, captured); console.error('Could not read selected logo'); };
      reader.readAsDataURL(file);
    });
  }
}
async function resetNames() {
  await ControlMatch.update(data => {
    for (const team of identitySides) {
      data.teamdata[team].teamname = ''; data.teamdata[team].name = '';
      for (const player of data.teamdata[team].playerlist) { player.name = ''; player.lane = 'none'; }
    }
  });
  clearIdentityDirty(); await loadFromServer();
}
async function resetImages() {
  await ControlMatch.update(data => { for (const team of identitySides) data.teamdata[team].logo = ''; });
  for (const id of ['file1', 'file2']) { const input = document.getElementById(id); if (input) { input.value = ''; ControlMatch.clean(input, ''); } }
}
async function switchNames() {
  await ControlMatch.update(data => {
    const blue = data.teamdata.blueteam, red = data.teamdata.redteam;
    for (const field of ['teamname', 'name', 'fullname', 'coach', 'score', 'logo']) {
      const value = blue[field] ?? ''; blue[field] = red[field] ?? ''; red[field] = value;
    }
    for (let i = 0; i < 5; i++) for (const field of ['name', 'lane']) {
      const fallback = field === 'lane' ? 'none' : '';
      const value = blue.playerlist[i][field] ?? fallback;
      blue.playerlist[i][field] = red.playerlist[i][field] ?? fallback;
      red.playerlist[i][field] = value;
    }
  });
  clearIdentityDirty(); await loadFromServer();
}
async function switchImages() {
  await ControlMatch.update(data => {
    const blue = data.teamdata.blueteam.logo || '';
    data.teamdata.blueteam.logo = data.teamdata.redteam.logo || ''; data.teamdata.redteam.logo = blue;
  });
}
let firstSwapSelection = null;
async function handleSwapClick(index, button) {
  if (!firstSwapSelection) {
    firstSwapSelection = { index, button }; button.textContent = 'Cancel'; return;
  }
  const first = firstSwapSelection.index;
  if (first === index) { resetSwapUI(); return; }
  const locate = slot => slot >= 3 && slot <= 7 ? ['blueteam', slot - 3]
    : slot >= 10 && slot <= 14 ? ['redteam', slot - 10] : null;
  const a = locate(first), b = locate(index);
  if (!a || !b) { resetSwapUI(); return; }
  try {
    await ControlMatch.update(data => {
      const x = data.teamdata[a[0]].playerlist[a[1]], y = data.teamdata[b[0]].playerlist[b[1]];
      for (const field of ['name', 'lane']) {
        const fallback = field === 'lane' ? 'none' : '';
        const value = x[field] ?? fallback; x[field] = y[field] ?? fallback; y[field] = value;
      }
    });
    clearIdentityDirty(); await loadFromServer();
  } catch (error) { console.error('Player swap not saved:', error.message); }
  finally { resetSwapUI(); }
}
function resetSwapUI() {
  firstSwapSelection = null;
  for (const button of document.querySelectorAll('button[id^="swap-btn-"]')) {
    button.textContent = 'Swap'; button.style.backgroundColor = '';
  }
}
ControlMatch.onChange(data => {
  currentBlueLogo = data.teamdata.blueteam.logo || '';
  currentRedLogo = data.teamdata.redteam.logo || '';
});
window.addEventListener('load', () => {
  setupAutoSave(); setupLogoUpload();
  loadFromServer().catch(error => console.error(error.message));
});
