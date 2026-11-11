// public/script/displaynicknamelogo.js

// 1. Inisialisasi WebSocket ke Server
const socket = new WebSocket(`ws://${window.location.host}`);

// 2. Fungsi untuk mengambil data dari Server (matchdatateam.json)
async function fetchDataAndUpdate() {
  try {
    const response = await fetch("/api/matchdata");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    updateUI(data);
  } catch (error) {
    console.error("Gagal mengambil data match:", error);
  }
}

// 3. Fungsi Mapping Data JSON ke HTML
function updateUI(data) {
  if (!data || !data.teamdata) return;

  const blue = data.teamdata.blueteam;
  const red = data.teamdata.redteam;

  // --- TIM BIRU ---
  setText("name-box-1", blue.teamname);
  setText("name-box-2", blue.score);
  setImage("displayImage1", blue.logo, "Logo Biru");

  if (blue.playerlist) {
    blue.playerlist.forEach((player, index) => {
      const htmlId = 3 + index;
      setText(`name-box-${htmlId}`, player.name);
      setMugshot(`name-image-box-${htmlId}`, player.name);
    });
  }

  // --- TIM MERAH ---
  setText("name-box-8", red.teamname);
  setText("name-box-9", red.score);
  setImage("displayImage2", red.logo, "Logo Merah");

  if (red.playerlist) {
    red.playerlist.forEach((player, index) => {
      const htmlId = 10 + index;
      setText(`name-box-${htmlId}`, player.name);
      setMugshot(`name-image-box-${htmlId}`, player.name);
    });
  }

  // UPDATE LINE SCORE
  updateScoreDots(
    parseInt(blue.score) || 0,
    parseInt(red.score) || 0,
    parseInt(data.matchFormat) || 5,
  );
}

// --- FUNGSI BANTUAN (HELPER) ---

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    // Update teks hanya jika ada perubahan untuk efisiensi
    if (el.textContent !== text) {
      el.textContent = text || "";
      // Panggil resize
      autoResizeText(el);
    } else {
      // Jika teks sama, tetap panggil resize (untuk handle perubahan layout/window resize)
      autoResizeText(el);
    }
  }
}

function autoResizeText(element) {
  if (!element) return;

  // I-check kung nasa scoreboard ba o draft
  const tnParent = element.closest(".tn");
  const teamHolder1 = element.closest(".teamnameholder1");
  const teamHolder2 = element.closest(".teamnameholder2");

  const container = tnParent || teamHolder1 || teamHolder2;
  if (!container) return;

  // Reset muna
  element.style.fontSize = "";
  element.style.whiteSpace = "nowrap";
  element.style.overflow = "visible";

  const maxWidth = container.clientWidth;
  if (!maxWidth) return;

  const style = window.getComputedStyle(element);
  let currentSize = parseFloat(style.fontSize) || 38;
  const minSize = 8;

  element.style.fontSize = `${currentSize}px`;

  while (element.scrollWidth > maxWidth && currentSize > minSize) {
    currentSize -= 0.5;
    element.style.fontSize = `${currentSize}px`;
  }

  element.style.overflow = "hidden";
}

function setImage(id, base64Data, altText) {
  const img = document.getElementById(id);
  const defaultLogo = "Assets/other/nologo.png";

  if (img) {
    const newSrc =
      base64Data && base64Data.trim() !== "" ? base64Data : defaultLogo;

    // Huwag galawin ang src kung pareho lang (iwas reload/blink ng logo)
    if (img.dataset.srcKey !== newSrc) {
      img.dataset.srcKey = newSrc;
      img.src = newSrc;
    }

    img.onerror = function () {
      this.onerror = null;
      this.src = defaultLogo;
    };

    img.style.display = "block";
    img.alt = altText;
  }
}

function setMugshot(containerId, playerName) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const newSrc =
    playerName && playerName.trim() !== ""
      ? `Assets/player/${encodeURIComponent(playerName)}.png`
      : "Assets/player/noplayer.png";

  // Huwag i-redraw kung pareho pa rin ang player
  if (container.dataset.srcKey === newSrc && container.firstChild) return;
  container.dataset.srcKey = newSrc;

  container.innerHTML = "";
  const img = document.createElement("img");
  img.src = newSrc;

  img.onerror = function () {
    this.onerror = null;
    this.src = "Assets/player/noplayer.png";
  };

  container.appendChild(img);
}

// --- LOGIKA KONEKSI REALTIME ---

socket.onopen = () => {
  console.log("Terhubung ke Server Overlay via WebSocket");
  fetchDataAndUpdate();
};

socket.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === "matchdata_update") {
      // updateUI na ang bahala sa score dots, kaya tinanggal na ang
      // walang-argumentong updateScoreDots() dito (iyon ang nag-reset ng dots)
      fetchDataAndUpdate();
    }
  } catch (e) {
    console.error("Error parsing WebSocket message:", e);
  }
};

socket.onclose = () => {
  console.log("Terputus dari server.");
  setTimeout(() => {
    window.location.reload();
  }, 3000);
};

// --- LINE SCORE (DOTS) ---

// Gumagawa lang ng dots kapag nagbago ang bilang. Hindi na binubura at
// ginagawa ulit tuwing may update.
function ensureDots(containerId, total) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const current = container.children.length;
  if (current === total) return;

  if (current < total) {
    for (let i = current; i < total; i++) {
      const dot = document.createElement("div");
      dot.classList.add("dot");
      container.appendChild(dot);
    }
  } else {
    for (let i = current; i > total; i--) {
      container.removeChild(container.lastChild);
    }
  }
}

function updateScoreDots(blueScore = 0, redScore = 0, format = 5) {
  let winsNeeded = 3;

  if (format === 1) winsNeeded = 1;
  else if (format === 3) winsNeeded = 2;
  else if (format === 5) winsNeeded = 3;
  else if (format === 7) winsNeeded = 4;

  ensureDots("blue-score-display", winsNeeded);
  ensureDots("red-score-display", winsNeeded);

  document
    .querySelectorAll("#blue-score-display .dot")
    .forEach((dot, index) => {
      dot.classList.toggle("active", index < blueScore);
    });

  document.querySelectorAll("#red-score-display .dot").forEach((dot, index) => {
    dot.classList.toggle("active", index < redScore);
  });
}
