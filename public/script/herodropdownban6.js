// herodropdown.js - Controller Logic
// FULL REVISED VERSION - Fix WebSocket Sync, Stability, & Isolated Timer

// Variabel Global
let selected1 = null;
let selected2 = null;
let allHeroes = [];
let currentPhaseIndex = 0;
let correctionMode = false;
let currentDraftData = null; // State lokal dari data server
let ws = null; // WebSocket Connection
let reconnectInterval = null;
let isSaving = false; // Flag untuk mencegah spam save

// Urutan dropdown (Draft Pick Rules)
const dropdownOrder = [
  { dropdown: "dropdowns-11", phase: 0, display: ["ban-left-1"] },
  { dropdown: "dropdowns-16", phase: 1, display: ["ban-right-1"] },
  { dropdown: "dropdowns-12", phase: 2, display: ["ban-left-2"] },
  { dropdown: "dropdowns-17", phase: 3, display: ["ban-right-2"] },
  { dropdown: "dropdowns-1", phase: 4, display: ["pick-left-1"] },
  {
    dropdown: ["dropdowns-6", "dropdowns-7"],
    phase: 5,
    display: ["pick-right-1", "pick-right-2"],
  },
  {
    dropdown: ["dropdowns-2", "dropdowns-3"],
    phase: 6,
    display: ["pick-left-2", "pick-left-3"],
  },
  { dropdown: "dropdowns-8", phase: 7, display: ["pick-right-3"] },
  { dropdown: "dropdowns-18", phase: 9, display: ["ban-right-3"] },
  { dropdown: "dropdowns-13", phase: 8, display: ["ban-left-3"] },
  { dropdown: "dropdowns-9", phase: 10, display: ["pick-right-4"] },
  {
    dropdown: ["dropdowns-4", "dropdowns-5"],
    phase: 11,
    display: ["pick-left-4", "pick-left-5"],
  },
  { dropdown: "dropdowns-10", phase: 12, display: ["pick-right-5"] },
  { dropdown: "dropdowns-10", phase: 12, display: ["pick-right-5"] }, // Phase dummy akhir
];

// ==========================================
// 1. WEBSOCKET MANAGER (AUTO RECONNECT)
// ==========================================

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://${window.location.host}`);

  ws.onopen = () => {
    console.log("Controller Connected to Server");
    // Saat connect, ambil data terbaru sekali saja
    fetchDraftData();

    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Jika ada update dari server (misal dari controller lain), sinkronkan local state
      if (msg.type === "draftdata_update" && msg.data) {
        // Update local state tanpa fetch ulang
        currentDraftData = msg.data;
        applyServerDataToUI();
      }
    } catch (e) {
      console.error("WS Parse Error", e);
    }
  };

  ws.onclose = () => {
    console.log("Koneksi terputus. Mencoba reconnect...");
    if (!reconnectInterval) {
      reconnectInterval = setInterval(connectWebSocket, 3000);
    }
  };

  ws.onerror = (err) => {
    console.error("Socket error:", err);
    ws.close();
  };
}

// ==========================================
// 2. DATA HANDLING (FETCH & SAVE)
// ==========================================

async function fetchDraftData() {
  try {
    const response = await fetch("/api/matchdraft");
    const data = await response.json();
    currentDraftData = data.draftdata;
    applyServerDataToUI();
  } catch (error) {
    console.error("Gagal mengambil data draft:", error);
  }
}

async function saveDraftData() {
  if (isSaving) return; // Prevent spam
  isSaving = true;

  try {
    await fetch("/api/matchdraft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftdata: currentDraftData }),
    });
  } catch (error) {
    console.error("Gagal menyimpan data draft:", error);
  } finally {
    isSaving = false;
  }
}

// ==========================================
// 3. MATCH DATA SYNC (NAMES & BANS)
// ==========================================

function getMatchDataLocation(dropdownIndex) {
  if (dropdownIndex >= 1 && dropdownIndex <= 5)
    return { team: "blueteam", idx: dropdownIndex - 1, field: "hero" };
  if (dropdownIndex >= 6 && dropdownIndex <= 10)
    return { team: "redteam", idx: dropdownIndex - 6, field: "hero" };
  if (dropdownIndex >= 11 && dropdownIndex <= 15)
    return { team: "blueteam", idx: dropdownIndex - 11, field: "banhero" };
  if (dropdownIndex >= 16 && dropdownIndex <= 20)
    return { team: "redteam", idx: dropdownIndex - 16, field: "banhero" };
  return null;
}

async function updateMatchDataHero(dropdownIndex, heroValue) {
  const loc = getMatchDataLocation(dropdownIndex);
  if (!loc) return;
  return ControlMatch.update(data => {
    data.teamdata[loc.team].playerlist[loc.idx][loc.field] = heroValue;
  });
}

async function swapMatchDataHeroes(index1, index2) {
  const a = getMatchDataLocation(index1), b = getMatchDataLocation(index2);
  if (!a || !b) return;
  return ControlMatch.update(data => {
    const x = data.teamdata[a.team].playerlist[a.idx], y = data.teamdata[b.team].playerlist[b.idx];
    const value = x[a.field] || ''; x[a.field] = y[b.field] || ''; y[b.field] = value;
  });
}

async function resetMatchDataHeroes() {
  return ControlMatch.update(data => {
    for (const side of ['blueteam', 'redteam']) for (const player of data.teamdata[side].playerlist) {
      player.hero = ''; player.banhero = '';
    }
  });
}

// ==========================================
// 4. HELPER MAPPING (DRAFT JSON)
// ==========================================

function getJsonLocation(index) {
  if (index >= 1 && index <= 5)
    return { side: "blueside", type: "pick", idx: index - 1 };
  if (index >= 6 && index <= 10)
    return { side: "redside", type: "pick", idx: index - 6 };
  if (index >= 11 && index <= 15)
    return { side: "blueside", type: "ban", idx: index - 11 };
  if (index >= 16 && index <= 20)
    return { side: "redside", type: "ban", idx: index - 16 };
  return null;
}

function getHeroFromData(index) {
  if (!currentDraftData) return "";
  const loc = getJsonLocation(index);
  if (!loc) return "";
  return currentDraftData[loc.side][loc.type][loc.idx].hero || "";
}

function setHeroToData(index, heroImg) {
  if (!currentDraftData) return;
  const loc = getJsonLocation(index);
  if (loc) {
    currentDraftData[loc.side][loc.type][loc.idx].hero = heroImg;
  }
}

// ==========================================
// 5. INITIALIZATION
// ==========================================

async function loadHeroes() {
  try {
    const response = await fetch("/database/herolist.json");
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Error loading herolist.json:", error);
    return [];
  }
}

async function initializePage() {
  allHeroes = await loadHeroes();

  // Connect WS akan handle fetch data awal juga
  connectWebSocket();

  // Setup Listeners
  for (let i = 1; i <= 20; i++) {
    const input = document.getElementById(`search-${i}`);
    const dropdown = document.getElementById(`dropdown-items-${i}`);
    if (input && dropdown) {
      input.addEventListener("input", () => filterDropdown(i));
      input.addEventListener("blur", () => hideDropdown(i));
    }
  }

  const correctionBtn = document.getElementById("correction");
  if (correctionBtn)
    correctionBtn.addEventListener("click", toggleCorrectionMode);

  // Control Buttons
  document
    .getElementById("start")
    .addEventListener("click", () => handleControlAction("start"));
  document
    .getElementById("stop")
    .addEventListener("click", () => handleControlAction("stop"));
  document
    .getElementById("nextPhase")
    .addEventListener("click", () => handleControlAction("nextPhase"));
  document
    .getElementById("reset")
    .addEventListener("click", () => handleControlAction("reset"));
}

document.addEventListener("DOMContentLoaded", initializePage);

// ==========================================
// 6. UI LOGIC & STATE
// ==========================================

function applyServerDataToUI() {
  if (!currentDraftData) return;

  currentPhaseIndex = parseInt(currentDraftData.current_phase) || 0;

  // Sinkronisasi Timer Lokal
  TimerManager.syncState();

  // Update Input Text dari gambar hero
  for (let i = 1; i <= 20; i++) {
    const heroImg = getHeroFromData(i);
    const input = document.getElementById(`search-${i}`);
    if (input) {
      // Kita hanya update value jika user sedang TIDAK mengetik (document.activeElement)
      if (document.activeElement !== input) {
        input.value = getHeroName(heroImg);
      }
    }
  }
  updateDropdownState();
}

function updateDropdownState() {
  // Disable semua dulu
  for (let i = 1; i <= 20; i++) {
    const input = document.getElementById(`search-${i}`);
    if (input) input.disabled = !correctionMode;
  }

  // Enable sesuai phase (jika bukan correction mode)
  if (!correctionMode && currentPhaseIndex < dropdownOrder.length) {
    const currentPhase = dropdownOrder[currentPhaseIndex];
    const dropdowns = Array.isArray(currentPhase.dropdown)
      ? currentPhase.dropdown
      : [currentPhase.dropdown];
    dropdowns.forEach((dropdownId) => {
      const input = document.getElementById(
        `search-${dropdownId.split("-")[1]}`,
      );
      if (input) input.disabled = false;
    });
  }

  const correctionButton = document.getElementById("correction");
  if (correctionButton)
    correctionButton.textContent = correctionMode
      ? "Exit Correction"
      : "Correction";
}

function toggleCorrectionMode() {
  correctionMode = !correctionMode;
  updateDropdownState();
}

// ==========================================
// 7. DROPDOWN & SELECTION LOGIC
// ==========================================

function filterDropdown(index) {
  let input = document.getElementById(`search-${index}`);
  let dropdown = document.getElementById(`dropdown-items-${index}`);
  let searchText = input.value.toLowerCase();

  if (allHeroes.length === 0) return;
  dropdown.innerHTML = "";

  if (searchText.length > 0) {
    const filteredHeroes = allHeroes.filter((hero) =>
      hero.name.toLowerCase().includes(searchText),
    );
    if (filteredHeroes.length > 0) {
      dropdown.style.display = "block";
      filteredHeroes.forEach((hero) => {
        let option = document.createElement("div");
        option.textContent = hero.name;

        // --- ON CLICK HERO ---
        option.onclick = async function () {
          try {
            // Do not advance or mutate the local draft when the guarded match mirror rejects.
            await updateMatchDataHero(index, hero.name);
            setHeroToData(index, hero.img);
            input.value = hero.name;
            dropdown.style.display = "none";
            if (!correctionMode && isCurrentPhaseDropdown(index)) await checkPhaseCompletion();
            else await saveDraftData();
          } catch (error) {
            console.error("Hero edit not saved:", error.message);
            await fetchDraftData();
          }
        };
        dropdown.appendChild(option);
      });
    } else {
      dropdown.style.display = "none";
    }
  } else {
    dropdown.style.display = "none";
  }
}

function isCurrentPhaseDropdown(index) {
  if (currentPhaseIndex >= dropdownOrder.length) return false;
  const currentPhase = dropdownOrder[currentPhaseIndex];
  const dropdowns = Array.isArray(currentPhase.dropdown)
    ? currentPhase.dropdown
    : [currentPhase.dropdown];
  return dropdowns.includes(`dropdowns-${index}`);
}

async function checkPhaseCompletion() {
  if (currentPhaseIndex >= dropdownOrder.length) {
    await saveDraftData();
    return;
  }

  const currentPhase = dropdownOrder[currentPhaseIndex];
  const dropdowns = Array.isArray(currentPhase.dropdown)
    ? currentPhase.dropdown
    : [currentPhase.dropdown];

  // Cek apakah semua slot di phase ini sudah terisi
  const allFilled = dropdowns.every((dropdownId) => {
    const idx = parseInt(dropdownId.split("-")[1]);
    return getHeroFromData(idx) !== "";
  });

  if (allFilled) {
    // Jika penuh, lanjut ke phase berikutnya
    await handleControlAction("nextPhase");
  } else {
    // Jika belum (untuk phase double pick), simpan saja perkembangannya
    await saveDraftData();
  }
}

function hideDropdown(index) {
  setTimeout(() => {
    const dropdown = document.getElementById(`dropdown-items-${index}`);
    if (dropdown && !dropdown.contains(document.activeElement)) {
      dropdown.style.display = "none";
    }
  }, 200);
}

// ==========================================
// 8. SWAP LOGIC
// ==========================================

async function swapHeroes() {
  if (selected1 === null || selected2 === null) return;
  try {
    const hero1 = getHeroFromData(selected1), hero2 = getHeroFromData(selected2);
    await swapMatchDataHeroes(selected1, selected2);
    setHeroToData(selected1, hero2);
    setHeroToData(selected2, hero1);
    document.getElementById(`search-${selected1}`).value = getHeroName(hero2);
    document.getElementById(`search-${selected2}`).value = getHeroName(hero1);
    await saveDraftData();
  } catch (error) {
    console.error("Hero swap not saved:", error.message);
    await fetchDraftData();
  } finally { resetSelection(); }
}

function getHeroName(imgSrc) {
  if (!imgSrc) return "";
  let hero = allHeroes.find((h) => h.img === imgSrc);
  return hero ? hero.name : "";
}

function selectDropdown(index) {
  let button = document.querySelector(`#dropdowns-${index} .swap-button`);
  if (selected1 === null) {
    selected1 = index;
    if (button) button.classList.add("selected");
  } else if (selected2 === null && selected1 !== index) {
    selected2 = index;
    if (button) button.classList.add("selected");
    swapHeroes();
  } else {
    resetSelection();
  }
}

function resetSelection() {
  if (selected1 !== null) {
    let btn = document.querySelector(`#dropdowns-${selected1} .swap-button`);
    if (btn) btn.classList.remove("selected");
  }
  if (selected2 !== null) {
    let btn = document.querySelector(`#dropdowns-${selected2} .swap-button`);
    if (btn) btn.classList.remove("selected");
  }
  selected1 = null;
  selected2 = null;
}

// ==========================================
// 9. ISOLATED TIMER MANAGER
// ==========================================

const TimerManager = {
  interval: null,

  start: function () {
    if (this.interval) return; // Mencegah double timer

    this.interval = setInterval(() => {
      if (currentDraftData && currentDraftData.timer_running) {
        let currentTime = parseInt(currentDraftData.timer);

        if (currentTime > 0) {
          currentTime--;
          currentDraftData.timer = currentTime.toString();
          this.updateUI();

          // Sync detik ke Overlay HANYA via WebSocket (tanpa save JSON)
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "update",
                data: {
                  draftdata: {
                    timer: currentDraftData.timer,
                    timer_running: true,
                  },
                },
              }),
            );
          }
        } else {
          this.stop(); // Berhenti otomatis di 0
        }
      }
    }, 1000);
  },

  stop: function () {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (currentDraftData) currentDraftData.timer_running = false;
    this.updateUI();
  },

  reset: function (defaultTime = "50") {
    this.stop();
    if (currentDraftData) {
      currentDraftData.timer = defaultTime;
      currentDraftData.timer_running = false;
    }
    this.updateUI();
  },

  updateUI: function () {
    const timerText = document.getElementById("timer-display");
    if (timerText && currentDraftData) {
      timerText.textContent = currentDraftData.timer;
    }
  },

  syncState: function () {
    this.updateUI();
    if (currentDraftData && currentDraftData.timer_running) {
      this.start();
    } else {
      this.stop();
    }
  },
};

// ==========================================
// 10. CONTROLS (START, STOP, RESET, NEXT)
// ==========================================

async function handleControlAction(action) {
  if (!currentDraftData) return;
  if (action === "reset") {
    try { await resetMatchDataHeroes(); }
    catch (error) { console.error("Draft reset not saved:", error.message); return; }
  }

  if (action === "start") {
    currentDraftData.timer_running = true;
    TimerManager.start();
  } else if (action === "stop") {
    currentDraftData.timer_running = false;
    TimerManager.stop();
  } else if (action === "nextPhase") {
    if (currentPhaseIndex < dropdownOrder.length) {
      currentDraftData.current_phase = currentPhaseIndex + 1;
      TimerManager.reset("50");
      currentDraftData.timer_running = true;
      TimerManager.start();
    }
  } else if (action === "reset") {
    currentDraftData.current_phase = 0;
    TimerManager.reset("50");
    correctionMode = false;

    // Reset Draft Data (Gambar)
    const empty = [
      { hero: "" },
      { hero: "" },
      { hero: "" },
      { hero: "" },
      { hero: "" },
    ];
    currentDraftData.blueside.ban = JSON.parse(JSON.stringify(empty));
    currentDraftData.blueside.pick = JSON.parse(JSON.stringify(empty));
    currentDraftData.redside.ban = JSON.parse(JSON.stringify(empty));
    currentDraftData.redside.pick = JSON.parse(JSON.stringify(empty));

    // Reset Match Data (Nama) via API
    resetSelection();
  }

  // Save state utama ke server.
  await saveDraftData();
}
