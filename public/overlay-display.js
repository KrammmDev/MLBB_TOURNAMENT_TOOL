// ============================================
// Broadcast Overlay Display
// Connected sa MLBB Control Panel via /api/matchdata
// ============================================

const DEFAULT_IMG = "Assets/Other/transparent.png";
const SLIDE_INTERVAL_MS = 6000;
const POLL_INTERVAL_MS = 3000;

let currentDataStr = "";
let playerSlides = []; // each item = { blue: player|null, red: player|null }
let currentSlideIndex = 0;
let slideTimer = null;
let pollTimer = null;
let countdownInterval = null;

// Lane labels (TEXT ONLY)
const LANE_LABELS = {
  gold: "GOLD",
  junggle: "JUNGLE",
  jungle: "JUNGLE",
  mid: "MID",
  roam: "ROAM",
  exp: "EXP",
  none: "",
};

// Lane icons (IMAGE PATHS - walang leading slash)
const LANE_ICONS = {
  gold: "Assets/lane/gold.png",
  junggle: "Assets/lane/junggle.png",
  jungle: "Assets/lane/junggle.png",
  mid: "Assets/lane/mid.png",
  roam: "Assets/lane/roam.png",
  exp: "Assets/lane/exp.png",
  none: "Assets/lane/None.png",
};

// ============================================
// Fit 1920x1080 stage to the browser window
// ============================================
function fitStage() {
  const stage = document.getElementById("stage");
  if (!stage) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener("resize", fitStage);

// ============================================
// Helpers
// ============================================
function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function formatBestOf(format) {
  const n = String(format || 3).replace(/^bo/i, "");
  return "BO" + n;
}

// ============================================
// Fetch matchdata
// ============================================
async function fetchMatchData() {
  try {
    const res = await fetch("/api/matchdata", { cache: "no-store" });
    if (!res.ok) throw new Error("Fetch failed");
    return await res.json();
  } catch (e) {
    console.error("❌ Fetch error:", e);
    return null;
  }
}

// ============================================
// Apply data to DOM
// ============================================
function applyData(data) {
  if (!data) return;

  // Tournament info (from localStorage)
  const tournamentTitle = localStorage.getItem("tournament-title") || "MLBB";
  const tournamentSubtitle = localStorage.getItem("tournament-subtitle") || "";
  const badge = localStorage.getItem("anniversary-text") || "";
  const bottomLogo = localStorage.getItem("bottom-logo") || "MLBB";
  const bottomText = localStorage.getItem("bottom-text") || "BROADCAST OVERLAY";

  document.getElementById("tournament-title").textContent = tournamentTitle;
  document.getElementById("tournament-subtitle").textContent =
    tournamentSubtitle;
  document.getElementById("tournament-subtitle").style.display =
    tournamentSubtitle ? "inline-block" : "none";
  document.getElementById("anniversary-text").textContent = badge;
  document.querySelector(".badge-block").style.display = badge ? "" : "none";
  document.getElementById("bottom-logo").textContent = bottomLogo;
  document.getElementById("bottom-text").textContent = bottomText;

  // Sponsor strip (from localStorage). If sponsor-image is set, it shows a logo.
  const sponsorLabel =
    localStorage.getItem("sponsor-label") || "PARTNER IN ESPORTS";
  const sponsorName = localStorage.getItem("sponsor-name") || "";
  const sponsorImage = localStorage.getItem("sponsor-image") || "";
  const sponsorBlock = document.querySelector(".sponsor-block");
  document.getElementById("sponsor-label").textContent = sponsorLabel;
  const sponsorEl = document.getElementById("sponsor-name");
  if (sponsorImage) {
    sponsorEl.innerHTML = `<img src="${sponsorImage}" alt="Sponsor" />`;
    sponsorBlock.classList.add("has-image");
  } else {
    sponsorEl.textContent = sponsorName;
    sponsorBlock.classList.remove("has-image");
  }
  sponsorBlock.style.display = sponsorImage || sponsorName ? "" : "none";

  // Match info: MATCH | TIME | BEST OF
  const mi = data.matchInfo || {};
  document.getElementById("match-label").textContent = mi.match || "MATCH 1";

  document.getElementById("match-format").textContent = formatBestOf(
    data.matchFormat,
  );

  // Teams
  const blue = data.teamdata?.blueteam || {};
  const red = data.teamdata?.redteam || {};

  // Support both `teamname` and `name`
  document.getElementById("team1-code").textContent =
    blue.teamname || blue.name || "BLUE";
  document.getElementById("team2-code").textContent =
    red.teamname || red.name || "RED";

  document.getElementById("coach-blue").textContent = blue.coach || "-";
  document.getElementById("coach-red").textContent = red.coach || "-";

  // Scores
  document.getElementById("blue-score").textContent =
    parseInt(blue.score, 10) || 0;
  document.getElementById("red-score").textContent =
    parseInt(red.score, 10) || 0;

  // Logos
  const setImg = (id, src) => {
    const el = document.getElementById(id);
    if (el) el.src = src && src.length > 100 ? src : DEFAULT_IMG;
  };
  setImg("team1-logo", blue.logo);
  setImg("team2-logo", red.logo);

  // Countdown (from localStorage)
  const target = parseInt(localStorage.getItem("countdown-target") || "0", 10);
  startCountdown(target);
}

// ============================================
// Countdown
// ============================================
function startCountdown(targetMs) {
  if (countdownInterval) clearInterval(countdownInterval);
  const el = document.getElementById("countdown-timer");

  function tick() {
    const remaining = targetMs - Date.now();
    if (!targetMs || remaining <= 0) {
      el.textContent = "00:00";
      return;
    }
    const totalSec = Math.floor(remaining / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    el.textContent = `${mm}:${ss}`;
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ============================================
// Build player PAIRS from data.teamdata
// Slide N = blue playerlist[N] + red playerlist[N]
// ============================================
function buildPlayerPairs(data) {
  const blue = data.teamdata?.blueteam?.playerlist || [];
  const red = data.teamdata?.redteam?.playerlist || [];

  const PLAYER_DIR = "Assets/player/";
  const pickImage = (p) => {
    let c = p.image || p.photo || p.img || p.picture || p.playerImage || "";
    if (typeof c !== "string") return DEFAULT_IMG;
    c = c.trim().replace(/\\/g, "/");
    if (!c) return DEFAULT_IMG;

    if (/^(data:|https?:|blob:)/i.test(c)) return c;
    if (/^\/?Assets\//i.test(c)) return c.replace(/^\//, "");

    c = c.replace(/^\/?player\//i, "");

    if (!/\.(png|jpe?g|webp|gif)$/i.test(c)) c += ".png";

    return PLAYER_DIR + c;
  };

  const clean = (p, side) => {
    if (!p) return null;
    const name = String(p.name || p.ign || p.nickname || "").trim();
    if (!name) return null;
    const field = pickImage(p);
    const images = [];
    if (field !== DEFAULT_IMG) images.push(field);
    images.push(PLAYER_DIR + encodeURIComponent(name) + ".png");
    images.push(PLAYER_DIR + "noplayer.png");
    images.push(DEFAULT_IMG);

    return {
      name,
      lane: p.lane || "none",
      image: images[0],
      images,
      raw: String(
        p.image || p.photo || p.img || p.picture || p.playerImage || "",
      ).slice(0, 80),
      keys: Object.keys(p).join(","),
      side,
    };
  };

  const max = Math.max(blue.length, red.length);
  const pairs = [];
  for (let i = 0; i < max; i++) {
    const b = clean(blue[i], "blue");
    const r = clean(red[i], "red");
    if (b || r) pairs.push({ blue: b, red: r });
  }
  return pairs;
}

function pairKey(pair) {
  const k = (p) =>
    p ? `${p.name}|${p.lane}|${p.side}|${p.image.length}` : "-";
  return k(pair.blue) + "::" + k(pair.red);
}

// ============================================
// Render slides
// ============================================
function playerCardHtml(p, cls) {
  const imgSrc = p.image || DEFAULT_IMG;
  const laneLabel = LANE_LABELS[p.lane] || "";
  const laneIcon = LANE_ICONS[p.lane] || "";

  return `
    <div class="player-card ${cls}">
      <div class="player-image-wrapper">
        <img class="player-image" src="${imgSrc}" alt="${escapeHtml(p.name)}"
             data-fallbacks="${escapeHtml(JSON.stringify((p.images || []).slice(1)))}"
             onerror="imgFallback(this)" />
      </div>
      <div class="player-name-bar">
        <div class="player-name-box">
          <span class="player-name-text">${escapeHtml(p.name)}</span>
          ${laneIcon ? `<img class="player-lane-icon" src="${laneIcon}" alt="${laneLabel}" />` : ""}
        </div>
      </div>
    </div>
  `;
}

// Try the next image candidate when one fails to load
function imgFallback(el) {
  let list = [];
  try {
    list = JSON.parse(el.dataset.fallbacks || "[]");
  } catch (e) {}
  const next = list.shift();
  el.dataset.fallbacks = JSON.stringify(list);
  if (next) {
    console.warn("Player image failed:", el.alt, "→ trying", next);
    el.src = next;
  } else {
    el.onerror = null;
  }
}
window.imgFallback = imgFallback;

function showDebug(pairs) {
  if (!/[?&]debug/.test(location.search)) return;
  let box = document.getElementById("debug-box");
  if (!box) {
    box = document.createElement("pre");
    box.id = "debug-box";
    box.style.cssText =
      "position:absolute;top:0;left:0;z-index:999;background:rgba(0,0,0,.88);" +
      "color:#0f0;font:15px monospace;padding:10px;max-width:1000px;white-space:pre-wrap;";
    document.getElementById("stage").appendChild(box);
  }
  const lines = [];
  pairs.forEach((pair) => {
    [pair.blue, pair.red].forEach((p) => {
      if (!p) return;
      lines.push(
        `${p.side} | ${p.name} | raw="${p.raw}" | fields: ${p.keys}\n   try: ${p.images.join("  ->  ")}`,
      );
    });
  });
  box.textContent = lines.join("\n") || "no players in data";
}

function renderSlides() {
  const container = document.getElementById("player-slideshow");
  container.innerHTML = "";

  if (playerSlides.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No Players";
    container.appendChild(empty);
    return;
  }

  playerSlides.forEach((pair, idx) => {
    const slide = document.createElement("div");
    slide.className = "player-slide";
    slide.dataset.index = idx;

    const solo = !(pair.blue && pair.red);
    let html = "";
    if (pair.blue)
      html += playerCardHtml(pair.blue, "blue" + (solo ? " solo" : ""));
    if (pair.red)
      html += playerCardHtml(pair.red, "red" + (solo ? " solo" : ""));
    slide.innerHTML = html;

    container.appendChild(slide);
  });
}

// ============================================
// Slide show control
// ============================================
function showSlide(index) {
  const slides = document.querySelectorAll(".player-slide");
  if (slides.length === 0) return;

  slides.forEach((s, i) => {
    // Clear existing timer to prevent overlapping animations
    if (s._leaveTimer) {
      clearTimeout(s._leaveTimer);
      s._leaveTimer = null;
    }

    if (i === index) {
      s.classList.remove("leaving");
      s.classList.add("active");
    } else if (s.classList.contains("active")) {
      s.classList.remove("active");
      s.classList.add("leaving");

      // Clean up after the 0.6s smooth fade out
      s._leaveTimer = setTimeout(() => {
        s.classList.remove("leaving");
        s._leaveTimer = null;
      }, 600);
    }
  });
}

function nextSlide() {
  if (playerSlides.length === 0) return;
  currentSlideIndex = (currentSlideIndex + 1) % playerSlides.length;
  showSlide(currentSlideIndex);
}

function startSlideshow() {
  if (slideTimer) clearInterval(slideTimer);
  if (playerSlides.length > 1) {
    slideTimer = setInterval(nextSlide, SLIDE_INTERVAL_MS);
  }
}

// ============================================
// Full update
// ============================================
async function updateOverlay() {
  const data = await fetchMatchData();
  if (!data) return;

  // Detect change
  const newStr = JSON.stringify(data);
  if (newStr === currentDataStr) return;
  currentDataStr = newStr;

  // Apply static info
  applyData(data);

  // Rebuild slides only if the player pairs changed
  const newList = buildPlayerPairs(data);
  const playerListChanged =
    newList.length !== playerSlides.length ||
    newList.some((p, i) => pairKey(p) !== pairKey(playerSlides[i]));

  if (playerListChanged) {
    playerSlides = newList;
    currentSlideIndex = 0;
    renderSlides();
    showDebug(newList);
    setTimeout(() => showSlide(0), 100);
    startSlideshow();
  }
}

// ============================================
// Force update (for WebSocket / storage events)
// ============================================
function forceUpdate() {
  currentDataStr = "";
  updateOverlay();
}

window.updateOverlay = updateOverlay;
window.updateDisplay = updateOverlay;

// ============================================
// WebSocket (direct sa server)
// ============================================
function connectWebSocket() {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const ws = new WebSocket(`${wsProtocol}//${host}`);

  ws.onopen = () => console.log("✅ Overlay WS connected");
  ws.onerror = (e) => console.error("❌ Overlay WS error:", e);
  ws.onclose = () => {
    console.warn("⚠️ Overlay WS closed — reconnecting in 3s");
    setTimeout(connectWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      // Match data changes → force update
      if (
        msg.type === "matchdata_update" ||
        msg.type === "update" ||
        (msg.type === "update" && msg.data && msg.data.matchdata)
      ) {
        console.log("📥 WS update:", msg.type);
        forceUpdate();
      }
    } catch (e) {
      console.error("WS parse error:", e);
    }
  };
}

// ============================================
// Storage listener (for tournament settings)
// ============================================
window.addEventListener("storage", (e) => {
  if (
    e.key === null ||
    (e.key &&
      (e.key.startsWith("tournament-") ||
        e.key.startsWith("anniversary-") ||
        e.key.startsWith("bottom-") ||
        e.key.startsWith("sponsor-") ||
        e.key.startsWith("match-") ||
        e.key.startsWith("countdown-")))
  ) {
    console.log("📥 Storage event:", e.key);
    forceUpdate();
  }
});

// ============================================
// Poll server every 3s (fallback)
// ============================================
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(updateOverlay, POLL_INTERVAL_MS);
}

// ============================================
// Init
// ============================================
window.addEventListener("DOMContentLoaded", () => {
  fitStage();
  updateOverlay();
  connectWebSocket();
  startPolling();
});

// ============================================
// INJECTED CSS para sa Lane Icon
// ============================================
const laneIconStyles = document.createElement("style");
laneIconStyles.textContent = `
  .player-lane-icon {
    width: 40px;
    height: 40px;
    object-fit: contain;
    vertical-align: middle;
    margin-left: 6px;
    filter: brightness(0) invert(1);
  }
  .player-lane-text {
    font-size: 12px;
    font-weight: bold;
    color: #fff;
    margin-left: 4px;
    vertical-align: middle;
  }
`;
document.head.appendChild(laneIconStyles);
