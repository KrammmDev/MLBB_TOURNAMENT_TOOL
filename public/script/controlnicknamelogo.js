// controlnicknamelogo.js (Versi API Node.js - Preserving Other Data + Lane Support)

// Variabel global untuk menyimpan state logo di memori browser
let currentBlueLogo = "";
let currentRedLogo = "";

// --- FUNGSI UTAMA: LOAD & SAVE DATA ---

// Mengambil data dari Server dan mengisi Input Form
async function loadFromServer() {
  try {
    const response = await fetch("/api/matchdata");
    const data = await response.json();

    // Cek struktur data agar tidak error
    if (!data.teamdata) return;

    const blue = data.teamdata.blueteam;
    const red = data.teamdata.redteam;

    // --- LOAD BLUE TEAM (Nama, Skor, Logo) ---
    document.getElementById("name-input-1").value = blue.teamname || "";
    const input2 = document.getElementById("name-input-2");
    if (input2) input2.value = blue.score || "";
    currentBlueLogo = blue.logo || "";

    // Player Name & Lane Biru (Index 3-7)
    for (let i = 0; i < 5; i++) {
      // Load Nama
      const playerName =
        blue.playerlist && blue.playerlist[i] ? blue.playerlist[i].name : "";
      document.getElementById(`name-input-${3 + i}`).value = playerName;

      // Load Lane (NEW) - Default 'none'
      const playerLane =
        blue.playerlist && blue.playerlist[i]
          ? blue.playerlist[i].lane
          : "none";
      const laneSelect = document.getElementById(`lane-select-${3 + i}`);
      if (laneSelect) laneSelect.value = playerLane;
    }

    // --- LOAD RED TEAM (Nama, Skor, Logo) ---
    document.getElementById("name-input-8").value = red.teamname || "";
    const input9 = document.getElementById("name-input-9");
    if (input9) input9.value = red.score || "";
    currentRedLogo = red.logo || "";

    // Player Name & Lane Merah (Index 10-14)
    for (let i = 0; i < 5; i++) {
      // Load Nama
      const playerName =
        red.playerlist && red.playerlist[i] ? red.playerlist[i].name : "";
      document.getElementById(`name-input-${10 + i}`).value = playerName;

      // Load Lane (NEW) - Default 'none'
      const playerLane =
        red.playerlist && red.playerlist[i] ? red.playerlist[i].lane : "none";
      const laneSelect = document.getElementById(`lane-select-${10 + i}`);
      if (laneSelect) laneSelect.value = playerLane;
    }
  } catch (error) {
    console.error("Gagal memuat data:", error);
  }
}

function updateMatchDisplay() {
  const matchEl = document.getElementById("match-number");
  const gameEl = document.getElementById("game-number");
  if (!matchEl || !gameEl) return; // Safety check
  const matchText = `${matchEl.value} ${gameEl.value}`;
  const matchElement = document.getElementById("match-display");
  if (matchElement) matchElement.textContent = matchText.toUpperCase();
}

document.addEventListener("DOMContentLoaded", function () {
  updateMatchDisplay();
});

// Optional: Auto-update kapag nag-load
document.addEventListener("DOMContentLoaded", function () {
  updateMatchDisplay();
});

// FUNGSI SAVE YANG AMAN
async function saveToServer() {
  try {
    const getResponse = await fetch("/api/matchdata");
    let fullData = await getResponse.json();

    // --- BLUE TEAM ---
    fullData.teamdata.blueteam.teamname =
      document.getElementById("name-input-1").value;
    fullData.teamdata.blueteam.logo = currentBlueLogo;

    for (let i = 0; i < 5; i++) {
      if (!fullData.teamdata.blueteam.playerlist[i])
        fullData.teamdata.blueteam.playerlist[i] = {};

      const nameEl = document.getElementById(`name-input-${3 + i}`);
      const laneEl = document.getElementById(`lane-select-${3 + i}`);
      fullData.teamdata.blueteam.playerlist[i].name = nameEl
        ? nameEl.value
        : "";
      fullData.teamdata.blueteam.playerlist[i].lane = laneEl
        ? laneEl.value
        : "none";
    }

    // --- RED TEAM ---
    fullData.teamdata.redteam.teamname =
      document.getElementById("name-input-8").value;
    fullData.teamdata.redteam.logo = currentRedLogo;

    for (let i = 0; i < 5; i++) {
      if (!fullData.teamdata.redteam.playerlist[i])
        fullData.teamdata.redteam.playerlist[i] = {};

      const nameEl = document.getElementById(`name-input-${10 + i}`);
      const laneEl = document.getElementById(`lane-select-${10 + i}`);
      fullData.teamdata.redteam.playerlist[i].name = nameEl ? nameEl.value : "";
      fullData.teamdata.redteam.playerlist[i].lane = laneEl
        ? laneEl.value
        : "none";
    }

    await fetch("/api/matchdata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullData),
    });
  } catch (error) {
    console.error("Gagal menyimpan data (Save Error):", error);
  }
}

// --- EVENT HANDLERS ---

// Auto Save saat mengetik atau mengganti dropdown
function setupAutoSave() {
  // Listener untuk Input Nama (1-14)
  for (let i = 1; i <= 14; i++) {
    const input = document.getElementById(`name-input-${i}`);
    if (input) {
      input.addEventListener("input", saveToServer);
    }
  }

  // Listener untuk Dropdown Lane (3-7 & 10-14)
  const laneIndices = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
  laneIndices.forEach((i) => {
    const select = document.getElementById(`lane-select-${i}`);
    if (select) {
      select.addEventListener("change", saveToServer); // Gunakan 'change' untuk dropdown
    }
  });
}

// Handle Upload Logo
function setupLogoUpload() {
  document.getElementById("file1").addEventListener("change", function () {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        currentBlueLogo = e.target.result;
        saveToServer();
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById("file2").addEventListener("change", function () {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        currentRedLogo = e.target.result;
        saveToServer();
      };
      reader.readAsDataURL(file);
    }
  });
}

// --- LOGIKA TOMBOL (Reset, Switch, Swap) ---

async function resetNames() {
  // 1. Reset Nama
  for (let i = 1; i <= 14; i++) {
    const input = document.getElementById(`name-input-${i}`);
    if (input) input.value = "";
  }

  // 2. Reset Lane ke 'none'
  const laneIndices = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
  laneIndices.forEach((i) => {
    const select = document.getElementById(`lane-select-${i}`);
    if (select) select.value = "none";
  });

  await saveToServer();
}

async function resetImages() {
  currentBlueLogo = "";
  currentRedLogo = "";
  document.getElementById("file1").value = "";
  document.getElementById("file2").value = "";
  await saveToServer();
}

async function switchNames() {
  // Kuha ng Blue Team data (kasama ang coach)
  let blueTeamName = document.getElementById("name-input-1").value;
  let blueCoach = document.getElementById("coach-input-blue").value; // <-- BAGO
  let bluePlayers = [];
  let blueLanes = [];
  for (let i = 3; i <= 7; i++) {
    bluePlayers.push(document.getElementById(`name-input-${i}`).value);
    const laneEl = document.getElementById(`lane-select-${i}`);
    blueLanes.push(laneEl ? laneEl.value : "none");
  }

  // Kuha ng Red Team data (kasama ang coach)
  let redTeamName = document.getElementById("name-input-8").value;
  let redCoach = document.getElementById("coach-input-red").value; // <-- BAGO
  let redPlayers = [];
  let redLanes = [];
  for (let i = 10; i <= 14; i++) {
    redPlayers.push(document.getElementById(`name-input-${i}`).value);
    const laneEl = document.getElementById(`lane-select-${i}`);
    redLanes.push(laneEl ? laneEl.value : "none");
  }

  // Kuha ng Score mula server
  const getResponse = await fetch("/api/matchdata");
  const currentData = await getResponse.json();
  let blueScore = currentData.teamdata.blueteam.score || 0;
  let redScore = currentData.teamdata.redteam.score || 0;
  let blueLogo = currentBlueLogo;
  let redLogo = currentRedLogo;

  // I-swap sa UI (Names, Coaches, Players, Lanes)
  document.getElementById("name-input-1").value = redTeamName;
  document.getElementById("coach-input-blue").value = redCoach; // <-- BAGO
  for (let i = 0; i < 5; i++) {
    document.getElementById(`name-input-${3 + i}`).value = redPlayers[i];
    const laneEl = document.getElementById(`lane-select-${3 + i}`);
    if (laneEl) laneEl.value = redLanes[i];
  }

  document.getElementById("name-input-8").value = blueTeamName;
  document.getElementById("coach-input-red").value = blueCoach; // <-- BAGO
  for (let i = 0; i < 5; i++) {
    document.getElementById(`name-input-${10 + i}`).value = bluePlayers[i];
    const laneEl = document.getElementById(`lane-select-${10 + i}`);
    if (laneEl) laneEl.value = blueLanes[i];
  }

  // I-swap ang logo sa memory
  currentBlueLogo = redLogo;
  currentRedLogo = blueLogo;

  // I-swap ang score sa server directly
  const getResponse2 = await fetch("/api/matchdata");
  let fullData = await getResponse2.json();

  fullData.teamdata.blueteam.teamname = redTeamName;
  fullData.teamdata.blueteam.name = redTeamName;
  fullData.teamdata.blueteam.coach = redCoach; // <-- BAGO
  fullData.teamdata.blueteam.score = redScore;
  fullData.teamdata.blueteam.logo = currentBlueLogo;
  for (let i = 0; i < 5; i++) {
    if (!fullData.teamdata.blueteam.playerlist[i])
      fullData.teamdata.blueteam.playerlist[i] = {};
    fullData.teamdata.blueteam.playerlist[i].name = redPlayers[i];
    fullData.teamdata.blueteam.playerlist[i].lane = redLanes[i];
  }

  fullData.teamdata.redteam.teamname = blueTeamName;
  fullData.teamdata.redteam.name = blueTeamName;
  fullData.teamdata.redteam.coach = blueCoach; // <-- BAGO
  fullData.teamdata.redteam.score = blueScore;
  fullData.teamdata.redteam.logo = currentRedLogo;
  for (let i = 0; i < 5; i++) {
    if (!fullData.teamdata.redteam.playerlist[i])
      fullData.teamdata.redteam.playerlist[i] = {};
    fullData.teamdata.redteam.playerlist[i].name = bluePlayers[i];
    fullData.teamdata.redteam.playerlist[i].lane = blueLanes[i];
  }

  await fetch("/api/matchdata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullData),
  });

  // I-update ang score display sa control
  document.getElementById("blue-score-control").textContent = redScore;
  document.getElementById("red-score-control").textContent = blueScore;

  // I-update ang status indicators para sa coaches
  const blueStatus = document.getElementById("blue-coach-status");
  const redStatus = document.getElementById("red-coach-status");
  if (blueStatus) {
    blueStatus.textContent = "✓ Swapped";
    blueStatus.className = "status-indicator saved";
    setTimeout(() => {
      blueStatus.textContent = "Idle";
      blueStatus.className = "status-indicator idle";
    }, 2000);
  }
  if (redStatus) {
    redStatus.textContent = "✓ Swapped";
    redStatus.className = "status-indicator saved";
    setTimeout(() => {
      redStatus.textContent = "Idle";
      redStatus.className = "status-indicator idle";
    }, 2000);
  }

  console.log(
    "✅ Team names, coaches, players, and lanes swapped successfully!",
  );
}

async function switchImages() {
  let temp = currentBlueLogo;
  currentBlueLogo = currentRedLogo;
  currentRedLogo = temp;
  await saveToServer();
}

// SWAP INDIVIDUAL (Logic Swap Player + Lane)
let firstSwapSelection = null;

function handleSwapClick(index, button) {
  if (firstSwapSelection === null) {
    // Klik Pertama (Pilih sumber)
    firstSwapSelection = { index: index, button: button };
    button.textContent = "Cancel";
    button.style.backgroundColor = "#ffc107";
  } else {
    // Klik Kedua (Pilih target)
    if (firstSwapSelection.index === index) {
      // Jika klik tombol yang sama -> Cancel
      resetSwapUI();
      return;
    }

    // Ambil Elemen Input & Select
    const input1 = document.getElementById(
      `name-input-${firstSwapSelection.index}`,
    );
    const lane1 = document.getElementById(
      `lane-select-${firstSwapSelection.index}`,
    );

    const input2 = document.getElementById(`name-input-${index}`);
    const lane2 = document.getElementById(`lane-select-${index}`);

    // Swap Nama
    const tempVal = input1.value;
    input1.value = input2.value;
    input2.value = tempVal;

    // Swap Lane (Pastikan elemen ada sebelum swap)
    if (lane1 && lane2) {
      const tempLane = lane1.value;
      lane1.value = lane2.value;
      lane2.value = tempLane;
    }

    saveToServer();
    resetSwapUI();
  }
}

function resetSwapUI() {
  if (firstSwapSelection) {
    firstSwapSelection.button.textContent = "Swap";
    firstSwapSelection.button.style.backgroundColor = "";
    firstSwapSelection = null;
  }
  const allButtons = document.querySelectorAll('button[id^="swap-btn-"]');
  allButtons.forEach((btn) => {
    btn.textContent = "Swap";
    btn.style.backgroundColor = "";
  });
}

// --- INITIALIZATION ---

function initializeApp() {
  loadFromServer();
  setupAutoSave();
  setupLogoUpload();
}

window.onload = initializeApp;
