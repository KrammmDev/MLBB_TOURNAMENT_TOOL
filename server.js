// server.js - PORT 3000 (Safe & Rare) & Strict IP Filter
// FULL REVISED VERSION - Fix WebSocket Freezing, Lag on LAN & Race Conditions
// + AUTOMATIC HERO PICK/BAN/WIN RATE TRACKING (herostats)
// + CSV IMPORT FOR NON-LIVE MATCHES (ADD MODE)
// + TOURNAMENT BRACKET SYSTEM (controller.html + viewer.html)
// + SHARED STATE (server-side mirror ng localStorage para gumana sa ibang PC)

const WebSocket = require("ws");
const http = require("http");
const express = require("express");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const multer = require("multer");
const { createMatchStore } = require("./lib/match-store");
const { installMatchRoutes } = require("./lib/match-routes");
const { loadRosterThemeStore, installRosterThemeRoutes } = require("./lib/roster-theme-store");
const { validateMatch } = require("./public/script/match-state");
const { loadSponsorStore, installSponsorRoutes } = require("./lib/broadcast-sponsors");
const { loadColorStore, installColorRoutes } = require("./lib/broadcast-colors");
const { mirrorDraftTimer } = require("./lib/draft-timer");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static("public"));

// ==========================================
// 1. KELAS ANTREAN PENULISAN (WRITE QUEUE)
// ==========================================
class AsyncQueue {
  constructor() {
    this.queue = Promise.resolve();
  }
  enqueue(task) {
    this.queue = this.queue.then(task).catch((err) => {
      console.error("Queue Error:", err);
    });
    return this.queue;
  }
}
const fileQueue = new AsyncQueue();

// ==========================================
// 2. PERSIAPAN FOLDER & FILE DATABASE
// ==========================================
const dbDir = path.join(__dirname, "public/database");
const savedMatchDir = path.join(dbDir, "savedmatch");
const unifiedDir = path.join(__dirname, "public/Assets/costum/Theme");
const flagDir = path.join(__dirname, "public/Assets/nationalflag");

if (!fsSync.existsSync(dbDir)) fsSync.mkdirSync(dbDir, { recursive: true });
if (!fsSync.existsSync(savedMatchDir))
  fsSync.mkdirSync(savedMatchDir, { recursive: true });
if (!fsSync.existsSync(unifiedDir))
  fsSync.mkdirSync(unifiedDir, { recursive: true });
if (!fsSync.existsSync(flagDir)) fsSync.mkdirSync(flagDir, { recursive: true });

const matchDataPath = path.join(dbDir, "matchdatateam.json");
const draftDataPath = path.join(dbDir, "matchdraft.json");
const prevDraftPath = path.join(dbDir, "previousmatchdraft.json");
const mapDrawPath = path.join(dbDir, "mapdraw.json");
const mvpDataPath = path.join(dbDir, "mvpdata.json");
const notifPath = path.join(dbDir, "notification.json");
const schedulePath = path.join(dbDir, "schedule.json");
const itemsPath = path.join(dbDir, "items.json");
const flagJsonPath = path.join(dbDir, "flags.json");
const themePath = path.join(unifiedDir, "theme.json");
const herostatsPath = path.join(dbDir, "herostats.json");
const tournamentPath = path.join(dbDir, "tournament.json"); // [TOURNAMENT]
const sharedStatePath = path.join(dbDir, "sharedstate.json"); // [SHARED STATE]

const storageUnified = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, unifiedDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const uploadUnified = multer({ storage: storageUnified });

const storageFlag = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, flagDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const uploadFlag = multer({ storage: storageFlag });

// ==========================================
// 3. DEFAULT DATA GENERATORS
// ==========================================
const defaultMatchData = {
  game_duration: "00:00",
  game_number: 0,
  winmatches: "none",
  teamdata: {
    blueteam: {
      teamname: "BLUE TEAM",
      score: "0",
      logo: "",
      totalgold: 0,
      turret: 0,
      lord: 0,
      turtle: 0,
      playerlist: Array(5)
        .fill()
        .map(() => ({
          name: "Player",
          hero: "",
          level: 0,
          KDA: "0/0/0",
          gold: 0,
          spell: "idle",
          banhero: "",
          itemlist: ["idle", "idle", "idle", "idle", "idle", "idle"],
        })),
    },
    redteam: {
      teamname: "RED TEAM",
      score: "0",
      logo: "",
      totalgold: 0,
      turret: 0,
      lord: 0,
      turtle: 0,
      playerlist: Array(5)
        .fill()
        .map(() => ({
          name: "Player",
          hero: "",
          level: 0,
          KDA: "0/0/0",
          gold: 0,
          spell: "idle",
          banhero: "",
          itemlist: ["idle", "idle", "idle", "idle", "idle", "idle"],
        })),
    },
  },
};

const defaultTheme = {
  fontFile: "Renegade Pursuit.otf",
  useCustomFont: false,
  fontSizeMultiplier: 1.0,
  images: { heroPickBg: "", lowerBg: "", lowerMidBg: "" },
  colors: {
    bluePrimary: "#00d2ff",
    blueDark: "#003e4d",
    redPrimary: "#ff2a2a",
    redDark: "#4d0000",
    scoreBlue: "#00d2ff",
    scoreRed: "#ff2a2a",
    upperBg: "#000000",
    lowerBg: "#0a0a0a",
    lowerMidBg: "#111111",
    heroPickBg: "#1e1e1e",
    logoTeamBg: "#000000",
    postDraftBg: "#1a1a1a",
    playerNameBg: "#000000",
    laneLogoBg: "rgba(0,0,0,0.8)",
    timerBlue: "#00d2ff",
    timerMid: "#ffffff",
    timerRed: "#ff2a2a",
    playerName: "#ffffff",
    phaseText: "#ffffff",
    laneIconType: "white",
    laneLogoBorder: "#ffffff",
    auraBan: "#ff0000",
    auraPick: "#ffffff",
    globalBorder: "rgba(255, 255, 255, 0.2)",
  },
  gradients: {
    upperBg: { enabled: false, colorB: "#333333", angle: 90 },
    lowerBg: { enabled: false, colorB: "#333333", angle: 90 },
    lowerMidBg: { enabled: false, colorB: "#333333", angle: 90 },
    heroPickBg: { enabled: false, colorB: "#333333", angle: 90 },
    logoTeamBg: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgTeamName: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgLogo: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgScore: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgCombined: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgBox1: { enabled: false, colorB: "#333333", angle: 90 },
    sbBgSecondary: { enabled: false, colorB: "#333333", angle: 90 },
  },
  scoreboard: {
    teamNameBlue: "#00d2ff",
    teamNameRed: "#ff2a2a",
    bgTeamName: "#1e1e1e",
    bgLogo: "#000000",
    bgScore: "#000000",
    bgCombined: "#0a0a0a",
    bgBox1: "#1e1e1e",
    bgSecondary: "#1e1e1e",
    borderBottom: "rgba(255, 255, 255, 0.2)",
    activeFlag: "indonesia.png",
    disableGlow: false,
    disableShadow: false,
  },
  opacity: {
    upper: 100,
    lower: 100,
    heroPick: 100,
    logoTeam: 60,
    postDraft: 100,
  },
  toggles: {
    hideLaneLogo: false,
    disableGlow: false,
    hidePattern: false,
    hidePostDraftBg: false,
    disableBoxShadow: false,
  },
  animations: { banType: "pulse", pickType: "pulse", heroAnim: "fade" },
};

const defaultDraftData = {
  draftdata: {
    timer: "50",
    timer_running: false,
    current_phase: 0,
    blueside: { ban: [{}, {}, {}, {}, {}], pick: [{}, {}, {}, {}, {}] },
    redside: { ban: [{}, {}, {}, {}, {}], pick: [{}, {}, {}, {}, {}] },
  },
};

const defaultHeroStats = {
  _meta: { gamesPlayed: 0 },
  heroes: {},
};

const defaultTournamentState = {
  tournamentName: "My Tournament",
  tournamentFormat: "single", // 'single' or 'double'
  elimType: "single", // 'single' or 'double' elim
  numGroups: 4,
  advancePerGroup: 2,
  teams: [],
  groups: {},
  groupMatches: [],
  playoffMatches: [],
  currentStage: "setup", // setup | group | playoff | done
  champion: null,
  grandFinalId: null,
  grandFinalResetId: null,
};

function normalizeHeroStats(raw) {
  const safe = {
    _meta: { gamesPlayed: 0 },
    heroes: {},
  };
  if (raw && typeof raw === "object") {
    if (raw._meta && typeof raw._meta.gamesPlayed === "number") {
      safe._meta.gamesPlayed = raw._meta.gamesPlayed;
    }
    if (raw.heroes && typeof raw.heroes === "object") {
      for (const [name, stat] of Object.entries(raw.heroes)) {
        safe.heroes[name] = {
          picks: typeof stat?.picks === "number" ? stat.picks : 0,
          bans: typeof stat?.bans === "number" ? stat.bans : 0,
          wins: typeof stat?.wins === "number" ? stat.wins : 0,
        };
      }
    }
  }
  return safe;
}

if (!fsSync.existsSync(matchDataPath))
  fsSync.writeFileSync(
    matchDataPath,
    JSON.stringify(defaultMatchData, null, 2),
  );
if (!fsSync.existsSync(draftDataPath))
  fsSync.writeFileSync(
    draftDataPath,
    JSON.stringify(defaultDraftData, null, 2),
  );
if (!fsSync.existsSync(prevDraftPath))
  fsSync.writeFileSync(
    prevDraftPath,
    JSON.stringify(defaultDraftData, null, 2),
  );
if (!fsSync.existsSync(themePath))
  fsSync.writeFileSync(themePath, JSON.stringify(defaultTheme, null, 2));
if (!fsSync.existsSync(mapDrawPath))
  fsSync.writeFileSync(
    mapDrawPath,
    JSON.stringify({ drawdata: { status: "idle" } }, null, 2),
  );
if (!fsSync.existsSync(mvpDataPath))
  fsSync.writeFileSync(mvpDataPath, JSON.stringify({ mvp: null }, null, 2));
if (!fsSync.existsSync(schedulePath))
  fsSync.writeFileSync(schedulePath, JSON.stringify({}, null, 2));
if (!fsSync.existsSync(notifPath))
  fsSync.writeFileSync(notifPath, JSON.stringify({}, null, 2));
if (!fsSync.existsSync(herostatsPath))
  fsSync.writeFileSync(
    herostatsPath,
    JSON.stringify(defaultHeroStats, null, 2),
  );
if (!fsSync.existsSync(tournamentPath))
  fsSync.writeFileSync(
    tournamentPath,
    JSON.stringify(defaultTournamentState, null, 2),
  );

if (!fsSync.existsSync(itemsPath)) {
  const defaultItems = [
    "winter_truncheon",
    "immortality",
    "athena_shield",
    "blade_armor",
    "antique_cuirass",
    "oracle",
    "radiant_armor",
    "twilight_armor",
    "guardian_helmet",
    "sky_guardian_helmet",
    "thunder_belt",
    "cursed_helmet",
  ];
  fsSync.writeFileSync(itemsPath, JSON.stringify(defaultItems, null, 2));
}

// ==========================================
// 4. IN-MEMORY CACHE
// ==========================================
let cache = {
  matchdata: defaultMatchData,
  matchdraft: defaultDraftData,
  theme: defaultTheme,
  mapdraw: { drawdata: { status: "idle" } },
  mvp: { mvp: null },
  schedule: {},
  herostats: defaultHeroStats,
  tournament: defaultTournamentState,
};

async function loadCache() {
  try {
    const loaded = JSON.parse(await fs.readFile(matchDataPath, "utf8"));
    validateMatch(loaded);
    cache.matchdata = loaded;
  } catch (error) {
    throw new Error(`Cannot load match data safely: ${error.message}`);
  }
  try {
    cache.matchdraft = JSON.parse(await fs.readFile(draftDataPath, "utf8"));
  } catch (e) {}
  try {
    cache.theme = JSON.parse(await fs.readFile(themePath, "utf8"));
  } catch (e) {}
  try {
    cache.mapdraw = JSON.parse(await fs.readFile(mapDrawPath, "utf8"));
  } catch (e) {}
  try {
    cache.mvp = JSON.parse(await fs.readFile(mvpDataPath, "utf8"));
  } catch (e) {}
  try {
    cache.schedule = JSON.parse(await fs.readFile(schedulePath, "utf8"));
  } catch (e) {}
  try {
    const rawHeroStats = JSON.parse(await fs.readFile(herostatsPath, "utf8"));
    cache.herostats = normalizeHeroStats(rawHeroStats);
  } catch (e) {
    console.warn(
      "!! herostats.json could not be read/parsed, using defaults:",
      e.message,
    );
    cache.herostats = normalizeHeroStats(null);
  }
  try {
    cache.tournament = JSON.parse(await fs.readFile(tournamentPath, "utf8"));
  } catch (e) {
    console.warn("!! tournament.json not found, using defaults");
    cache.tournament = { ...defaultTournamentState };
  }
  console.log(">> In-Memory Cache Loaded!");
}
let matchStore;
let rosterThemeStore;
let sponsorStore;
let colorStore;
const sponsorDirectory = path.join(__dirname, "runtime", "sponsor-logos");

async function initFlagDB() {
  if (!fsSync.existsSync(flagJsonPath)) {
    try {
      const files = await fs.readdir(flagDir);
      const imageFiles = files.filter((file) =>
        /\.(png|jpg|jpeg|webp)$/i.test(file),
      );
      await fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2));
    } catch (error) {
      await fs.writeFile(flagJsonPath, JSON.stringify([], null, 2));
    }
  }
}
const flagDbReady = initFlagDB();

// ==========================================
// 4a. SHARED STATE (mirror ng localStorage ng mga client)
// Ito ang ipinapadala sa bawat bagong WebSocket client
// bilang "init" message, para makita agad ang schedule
// at iba pang data kahit sa ibang PC.
// ==========================================
let sharedState = {};
try {
  sharedState = JSON.parse(fsSync.readFileSync(sharedStatePath, "utf8"));
  if (!sharedState || typeof sharedState !== "object") sharedState = {};
} catch (e) {
  sharedState = {};
}

function persistSharedState() {
  const payload = JSON.stringify(sharedState);
  fileQueue.enqueue(() => fs.writeFile(sharedStatePath, payload));
}

// ==========================================
// 4b. HEROLIST LOOKUP
// ==========================================
let heroImgToName = {};

async function loadHeroListMap() {
  const HEROLIST_CANDIDATES = [
    path.join(__dirname, "public", "herolist.json"),
    path.join(__dirname, "public", "database", "herolist.json"),
    path.join(__dirname, "herolist.json"),
  ];

  for (const candidate of HEROLIST_CANDIDATES) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const list = JSON.parse(raw);
      const map = {};
      for (const hero of list) {
        if (hero.img && hero.name) map[hero.img] = hero.name;
      }
      heroImgToName = map;
      console.log(
        `>> herolist.json loaded from ${candidate} (${Object.keys(map).length} heroes) — herostats name lookup ready.`,
      );
      return;
    } catch (e) {
      // subukan yung susunod na candidate
    }
  }
  console.warn(
    "!! WARNING: herolist.json not found in expected locations. Hero stat name-lookup will fail until HEROLIST_CANDIDATES is fixed in server.js.",
  );
}
const heroListReady = loadHeroListMap();

function resolveHeroName(imgPath) {
  if (!imgPath) return null;
  return heroImgToName[imgPath] || null;
}

function ensureHeroStat(name) {
  if (!cache.herostats.heroes[name]) {
    cache.herostats.heroes[name] = { picks: 0, bans: 0, wins: 0 };
  }
  return cache.herostats.heroes[name];
}

// ==========================================
// 5. FUNGSI HELPER (IP & BROADCAST)
// ==========================================
function getLocalIp() {
  const nets = os.networkInterfaces();
  let candidateIp = "localhost";
  const virtualKeywords = [
    "virtual",
    "vmware",
    "vbox",
    "virtualbox",
    "wsl",
    "hyper-v",
    "vethernet",
    "docker",
    "vpn",
    "zerotier",
    "tap",
    "tun",
  ];
  for (const name of Object.keys(nets)) {
    const isVirtual = virtualKeywords.some((keyword) =>
      name.toLowerCase().includes(keyword),
    );
    if (!isVirtual) {
      for (const net of nets[name]) {
        if (net.family === "IPv4" && !net.internal) {
          if (
            name.toLowerCase().includes("wi-fi") ||
            name.toLowerCase().includes("ethernet")
          ) {
            return net.address;
          }
          candidateIp = net.address;
        }
      }
    }
  }
  return candidateIp;
}

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// ==========================================
// 6. WEBSOCKET SERVER
// ==========================================
function heartbeat() {
  this.isAlive = true;
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  // Ipadala ang kasalukuyang localStorage state at tournament state sa bagong client
  try {
    ws.send(JSON.stringify({ type: "init", data: sharedState }));
    ws.send(
      JSON.stringify({
        type: "tournament_update",
        data: cache.tournament,
      }),
    );
  } catch (e) {
    console.warn("Failed to send initial state:", e.message);
  }

  ws.on("message", (message) => {
    try {
      let msg = JSON.parse(message);

      if (msg.type === "update" && msg.data && typeof msg.data === "object") {
        cache.matchdraft = mirrorDraftTimer(cache.matchdraft, msg.data.draftdata);
        // I-save sa server ang laman para maipadala sa mga susunod na client
        for (const [k, v] of Object.entries(msg.data)) {
          if (v === null) delete sharedState[k];
          else sharedState[k] = v;
        }
        persistSharedState();
      } else if (
        msg.type === "init" &&
        msg.data &&
        typeof msg.data === "object"
      ) {
        // Ipinapadala ng crosshost.js ng controller ang buong localStorage
        // pagkakonekta. I-merge sa server state at i-relay bilang "update"
        // (hindi "init", para hindi mapalitan ang buong state ng ibang client).
        for (const [k, v] of Object.entries(msg.data)) {
          if (v !== null && v !== undefined) sharedState[k] = v;
        }
        persistSharedState();
        msg = { type: "update", data: msg.data };
      } else if (msg.type === "clear") {
        sharedState = {};
        persistSharedState();
      } else {
        return;
      }

      // I-relay sa lahat ng iba pang client
      const out = JSON.stringify(msg);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(out);
        }
      });
    } catch (e) {
      console.error("WebSocket Message Error:", e);
    }
  });
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", function close() {
  clearInterval(interval);
});

// ==========================================
// 7. API ROUTES
// ==========================================
// --- PLAYER IMAGES API (Filename-based) ---
const playerDir = path.join(__dirname, "public", "Assets", "player");

app.get("/api/players", async (req, res) => {
  try {
    const files = await fs.readdir(playerDir);
    const players = files
      .filter((f) => /\.(png|jpg|jpeg|webp|gif)$/i.test(f))
      .map((f) => {
        const name = f.replace(/\.[^.]+$/, "");
        return {
          name: name,
          filename: f,
          image: `/Assets/player/${f}`,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`✅ /api/players → ${players.length} players`);
    res.json(players);
  } catch (error) {
    console.error("❌ Failed to read player folder:", error);
    res.status(500).json({ error: "Cannot read player folder" });
  }
});
// --- MATCH DATA API ---
installMatchRoutes(app, () => matchStore);
installRosterThemeRoutes(app, () => rosterThemeStore);
installSponsorRoutes(app, () => sponsorStore, sponsorDirectory);
installColorRoutes(app, () => colorStore);

// --- MATCH DRAFT API ---
app.get("/api/matchdraft", (req, res) => {
  res.json(cache.matchdraft);
});

app.post("/api/matchdraft", (req, res) => {
  try {
    cache.matchdraft = req.body;

    broadcast({ type: "draftdata_update", data: cache.matchdraft.draftdata });

    const payload = JSON.stringify(cache.matchdraft, null, 2);
    fileQueue.enqueue(() => fs.writeFile(draftDataPath, payload));

    res.json({ message: "Draft data saved" });
  } catch (error) {
    res.status(500).json({ message: "Error saving draft" });
  }
});

// --- THEME API ---
app.get("/api/theme", (req, res) => {
  res.json(cache.theme);
});

app.post("/api/theme", (req, res) => {
  try {
    cache.theme = req.body;
    broadcast({ type: "theme_update", data: cache.theme });

    const payload = JSON.stringify(cache.theme, null, 2);
    fileQueue.enqueue(() => fs.writeFile(themePath, payload));

    res.json({ message: "Theme saved" });
  } catch (error) {
    res.status(500).json({ message: "Error saving theme" });
  }
});

app.post("/api/theme-reset", (req, res) => {
  try {
    cache.theme = defaultTheme;
    broadcast({ type: "theme_update", data: cache.theme });

    const payload = JSON.stringify(cache.theme, null, 2);
    fileQueue.enqueue(() => fs.writeFile(themePath, payload));

    res.json({ message: "Theme Reset to Default", theme: cache.theme });
  } catch (error) {
    res.status(500).json({ message: "Error resetting theme" });
  }
});

// --- UNIFIED UPLOAD API (Theme Assets) ---
app.post("/api/upload-asset", uploadUnified.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const targetField = req.body.targetField;
  const ext = path.extname(req.file.originalname).toLowerCase();

  try {
    if (!cache.theme.images) cache.theme.images = {};

    if (targetField === "font" && (ext === ".ttf" || ext === ".otf")) {
      cache.theme.fontFile = req.file.originalname;
      cache.theme.useCustomFont = true;
    } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
      if (targetField === "heroPickBg")
        cache.theme.images.heroPickBg = req.file.originalname;
      else if (targetField === "lowerBg")
        cache.theme.images.lowerBg = req.file.originalname;
      else if (targetField === "lowerMidBg")
        cache.theme.images.lowerMidBg = req.file.originalname;
    }

    broadcast({ type: "theme_update", data: cache.theme });

    const payload = JSON.stringify(cache.theme, null, 2);
    fileQueue.enqueue(() => fs.writeFile(themePath, payload));

    res.json({
      message: "Asset uploaded successfully",
      filename: req.file.originalname,
      updatedTheme: cache.theme,
    });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ message: "Error updating theme config" });
  }
});

// --- FLAG API ---
app.get("/api/flags", async (req, res) => {
  try {
    const files = await fs.readdir(flagDir);
    const imageFiles = files.filter((file) =>
      /\.(png|jpg|jpeg|webp)$/i.test(file),
    );
    fileQueue.enqueue(() =>
      fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2)),
    );
    res.json(imageFiles);
  } catch (error) {
    res.json([]);
  }
});

app.post("/api/upload-flag", uploadFlag.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  try {
    const files = await fs.readdir(flagDir);
    const imageFiles = files.filter((file) =>
      /\.(png|jpg|jpeg|webp)$/i.test(file),
    );
    fileQueue.enqueue(() =>
      fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2)),
    );
    res.json({
      message: "Flag uploaded successfully",
      filename: req.file.originalname,
      list: imageFiles,
    });
  } catch (error) {
    res.status(500).json({ message: "Error uploading flag" });
  }
});

// --- EXTRAS API ---
app.get("/api/items", async (req, res) => {
  try {
    const data = await fs.readFile(itemsPath, "utf8");
    res.json(JSON.parse(data));
  } catch (error) {
    res.json([]);
  }
});

app.get("/api/schedule", (req, res) => {
  res.json(cache.schedule);
});
app.post("/api/schedule", (req, res) => {
  try {
    cache.schedule = req.body;
    broadcast({ type: "schedule_update", data: cache.schedule });
    fileQueue.enqueue(() =>
      fs.writeFile(schedulePath, JSON.stringify(cache.schedule, null, 2)),
    );
    res.json({ message: "Schedule saved" });
  } catch (error) {
    res.status(500).json({ message: "Error" });
  }
});

app.get("/api/mapdraw", (req, res) => {
  res.json(cache.mapdraw);
});
app.post("/api/mapdraw", (req, res) => {
  try {
    cache.mapdraw = req.body;
    broadcast({ type: "mapdraw_update", data: cache.mapdraw.drawdata });
    fileQueue.enqueue(() =>
      fs.writeFile(mapDrawPath, JSON.stringify(cache.mapdraw, null, 2)),
    );
    res.json({ message: "Map saved" });
  } catch (error) {
    res.status(500).json({ message: "Error" });
  }
});

app.get("/api/mvp", (req, res) => {
  res.json(cache.mvp);
});
app.post("/api/mvp", (req, res) => {
  try {
    cache.mvp = req.body;
    broadcast({ type: "mvp_update", data: cache.mvp.mvp });
    fileQueue.enqueue(() =>
      fs.writeFile(mvpDataPath, JSON.stringify(cache.mvp, null, 2)),
    );
    res.json({ message: "MVP saved" });
  } catch (error) {
    res.status(500).json({ message: "Error" });
  }
});

app.post("/api/notification", (req, res) => {
  try {
    const payload = { currentVideo: req.body.videoId, timestamp: Date.now() };
    broadcast({ type: "notification_trigger", videoId: req.body.videoId });
    fileQueue.enqueue(() =>
      fs.writeFile(notifPath, JSON.stringify(payload, null, 2)),
    );
    res.json({ message: "Notification triggered" });
  } catch (error) {
    res.status(500).json({ message: "Error" });
  }
});

// ==========================================
// BINAGO: HINDI NA UMASA SA GAMES PLAYED
// Kinukuha na ang Total Picks bilang basehan
// ==========================================
app.get("/api/herostats", (req, res) => {
  try {
    // 1. Kalkulahin ang total picks ng LAHAT ng heroes
    let totalPicks = 0;
    for (const stat of Object.values(cache.herostats.heroes)) {
      totalPicks += stat.picks;
    }

    // 2. Gawing basehan ang totalPicks (kung 0, gawing 1 para iwas divide by zero)
    const totalPossiblePicks = totalPicks > 0 ? totalPicks : 1;
    const totalPossibleBans = totalPicks > 0 ? totalPicks : 1;

    // 3. Kunin pa rin ang gamesPlayed para sa display kung kailangan
    const gamesPlayed = cache.herostats._meta.gamesPlayed || 0;

    const result = {};

    for (const [name, stat] of Object.entries(cache.herostats.heroes)) {
      const pickRate =
        totalPossiblePicks > 0
          ? Math.min(100, (stat.picks / totalPossiblePicks) * 100)
          : 0;
      const banRate =
        totalPossibleBans > 0
          ? Math.min(100, (stat.bans / totalPossibleBans) * 100)
          : 0;
      const winRate =
        stat.picks > 0 ? Math.min(100, (stat.wins / stat.picks) * 100) : 0;

      result[name] = {
        pickRate,
        banRate,
        winRate,
        picks: stat.picks,
        bans: stat.bans,
        wins: stat.wins,
        pickCount: stat.picks,
      };
    }

    res.json({ gamesPlayed, heroes: result });
  } catch (error) {
    console.error("GET /api/herostats error:", error);
    res.status(500).json({ message: "Error reading hero stats" });
  }
});

// --- GET: CSV TEMPLATE GENERATOR ---
app.get("/api/herostats-template", (req, res) => {
  try {
    const mode = req.query.mode === "current" ? "current" : "zero";

    const allHeroNames = [...new Set(Object.values(heroImgToName))].sort(
      (a, b) => a.localeCompare(b),
    );

    if (allHeroNames.length === 0) {
      console.warn(
        "!! herolist.json map is empty — template generation skipped.",
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="herostats_template.csv"',
      );
      return res.send("Hero,Picks,Bans,Wins\n");
    }

    const lines = ["Hero,Picks,Bans,Wins"];

    allHeroNames.forEach((heroName) => {
      const safeName = /[",\n]/.test(heroName)
        ? `"${heroName.replace(/"/g, '""')}"`
        : heroName;

      const existingStat = cache.herostats.heroes[heroName];

      if (mode === "current" && existingStat) {
        lines.push(
          `${safeName},${existingStat.picks || 0},${existingStat.bans || 0},${existingStat.wins || 0}`,
        );
      } else {
        lines.push(`${safeName},0,0,0`);
      }
    });

    const csv = lines.join("\n") + "\n";

    console.log(
      `📋 Template generated: ${allHeroNames.length} heroes (${mode} mode)`,
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="herostats_template_${mode}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    console.error("herostats-template error:", error);
    res.status(500).json({ message: "Error generating template" });
  }
});

app.post("/api/record-hero-stats", (req, res) => {
  try {
    const { winner } = req.body;
    if (winner !== "blue" && winner !== "red") {
      return res
        .status(400)
        .json({ message: "winner must be 'blue' or 'red'" });
    }

    const draft = cache.matchdraft && cache.matchdraft.draftdata;
    if (!draft) {
      return res.status(400).json({ message: "No draft data available" });
    }

    if (Object.keys(heroImgToName).length === 0) {
      console.warn(
        "!! herolist.json map is empty — hero stats cannot be resolved this game.",
      );
    }

    cache.herostats._meta.gamesPlayed =
      (cache.herostats._meta.gamesPlayed || 0) + 1;

    const sideMap = [
      { key: "blueside", isWinner: winner === "blue" },
      { key: "redside", isWinner: winner === "red" },
    ];

    let resolvedCount = 0;
    let unresolvedCount = 0;

    sideMap.forEach(({ key, isWinner }) => {
      const sideData = draft[key];
      if (!sideData) return;

      (sideData.pick || []).forEach((entry) => {
        const name = resolveHeroName(entry && entry.hero);
        if (!name) {
          if (entry && entry.hero) unresolvedCount++;
          return;
        }
        resolvedCount++;
        const stat = ensureHeroStat(name);
        stat.picks += 1;
        if (isWinner) stat.wins += 1;
      });

      (sideData.ban || []).forEach((entry) => {
        const name = resolveHeroName(entry && entry.hero);
        if (!name) {
          if (entry && entry.hero) unresolvedCount++;
          return;
        }
        resolvedCount++;
        const stat = ensureHeroStat(name);
        stat.bans += 1;
      });
    });

    broadcast({ type: "herostats_update" });

    const payload = JSON.stringify(cache.herostats, null, 2);
    fileQueue.enqueue(() => fs.writeFile(herostatsPath, payload));

    res.json({
      message: "Hero stats recorded",
      gamesPlayed: cache.herostats._meta.gamesPlayed,
      resolvedCount,
      unresolvedCount,
    });
  } catch (error) {
    console.error("record-hero-stats error:", error);
    res.status(500).json({ message: "Error recording hero stats" });
  }
});

app.post("/api/reset-hero-stats", (req, res) => {
  try {
    cache.herostats = { _meta: { gamesPlayed: 0 }, heroes: {} };

    broadcast({ type: "herostats_update" });

    const payload = JSON.stringify(cache.herostats, null, 2);
    fileQueue.enqueue(() => fs.writeFile(herostatsPath, payload));

    res.json({ message: "Hero stats reset to zero" });
  } catch (error) {
    console.error("reset-hero-stats error:", error);
    res.status(500).json({ message: "Error resetting hero stats" });
  }
});

// ==========================================
// --- IMPORT HERO STATS (ADD MODE ONLY) ---
// ==========================================
function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0];
  const delim = header.includes(";") ? ";" : ",";

  const headers = header
    .split(delim)
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]
      .split(delim)
      .map((v) => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

function normalizeHeroNameInput(name) {
  if (!name) return null;
  const clean = String(name)
    .toLowerCase()
    .replace(/[\s\-_'.]/g, "");

  const heroNames = Object.values(heroImgToName);
  const found = heroNames.find(
    (h) => h.toLowerCase().replace(/[\s\-_'.]/g, "") === clean,
  );
  return found || null;
}

app.post("/api/import-herostats", (req, res) => {
  try {
    const { csvText, gamesPlayed } = req.body;

    if (!csvText) {
      return res
        .status(400)
        .json({ ok: false, message: "Walang CSV content." });
    }

    const rows = parseCSVText(csvText);
    if (!rows.length) {
      return res
        .status(400)
        .json({ ok: false, message: "Walang laman ang CSV." });
    }

    const backupPath = herostatsPath + ".backup-" + Date.now();
    try {
      fsSync.copyFileSync(herostatsPath, backupPath);
    } catch (e) {
      console.warn("Backup failed (non-fatal):", e.message);
    }

    const report = {
      added: [],
      updated: [],
      skipped: [],
      gamesPlayedImported: 0,
    };

    rows.forEach((row) => {
      const rawName = row.Hero || row.hero || row.HERO || row.Name || row.name;
      const picks = Number(row.Picks ?? row.picks ?? 0) || 0;
      const bans = Number(row.Bans ?? row.bans ?? 0) || 0;
      const wins = Number(row.Wins ?? row.wins ?? 0) || 0;

      if (!rawName) return;

      const heroName = normalizeHeroNameInput(rawName);
      if (!heroName) {
        report.skipped.push({
          input: rawName,
          reason: "Hindi mahanap sa herolist.json",
        });
        return;
      }

      const wasExisting = !!cache.herostats.heroes[heroName];

      if (wasExisting) {
        const stat = cache.herostats.heroes[heroName];
        stat.picks += picks;
        stat.bans += bans;
        stat.wins += wins;
        report.updated.push({
          hero: heroName,
          addedPicks: picks,
          addedBans: bans,
          addedWins: wins,
          newTotals: { ...stat },
        });
      } else {
        cache.herostats.heroes[heroName] = { picks, bans, wins };
        report.added.push({ hero: heroName, picks, bans, wins });
      }
    });

    const gp = Number(gamesPlayed) || 0;
    if (gp > 0) {
      cache.herostats._meta.gamesPlayed =
        (cache.herostats._meta.gamesPlayed || 0) + gp;
      report.gamesPlayedImported = gp;
    }

    broadcast({ type: "herostats_update" });

    const payload = JSON.stringify(cache.herostats, null, 2);
    fileQueue.enqueue(() => fs.writeFile(herostatsPath, payload));

    console.log("✅ Hero stats imported (ADD mode):", {
      updated: report.updated.length,
      added: report.added.length,
      skipped: report.skipped.length,
      gamesPlayedAdded: report.gamesPlayedImported,
    });

    res.json({
      ok: true,
      message: "Import successful (ADD mode)",
      backup: backupPath,
      report,
    });
  } catch (error) {
    console.error("import-herostats error:", error);
    res.status(500).json({
      ok: false,
      message: "Error importing hero stats: " + error.message,
    });
  }
});

// ==========================================
// --- TOURNAMENT API ---
// ==========================================
app.get("/api/tournament", (req, res) => {
  res.json(cache.tournament);
});

app.post("/api/tournament", (req, res) => {
  try {
    cache.tournament = req.body;

    broadcast({ type: "tournament_update", data: cache.tournament });

    const payload = JSON.stringify(cache.tournament, null, 2);
    fileQueue.enqueue(() => fs.writeFile(tournamentPath, payload));

    res.json({ ok: true, message: "Tournament saved" });
  } catch (error) {
    console.error("POST /api/tournament error:", error);
    res.status(500).json({ ok: false, message: "Error saving tournament" });
  }
});

app.post("/api/tournament/reset", (req, res) => {
  try {
    cache.tournament = { ...defaultTournamentState };

    broadcast({ type: "tournament_update", data: cache.tournament });

    const payload = JSON.stringify(cache.tournament, null, 2);
    fileQueue.enqueue(() => fs.writeFile(tournamentPath, payload));

    res.json({
      ok: true,
      message: "Tournament reset",
      tournament: cache.tournament,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error resetting tournament" });
  }
});

// ==========================================
// --- GROUP MATCHES PREFS API (sync browser <-> OBS) ---
// ==========================================
const groupPrefsPath = path.join(dbDir, "groupmatchesprefs.json");
let groupPrefs = { ts: 0 };
try {
  groupPrefs = JSON.parse(fsSync.readFileSync(groupPrefsPath, "utf8"));
} catch (e) {}

app.get("/api/group-matches-prefs", (req, res) => {
  res.json(groupPrefs);
});

app.post("/api/group-matches-prefs", (req, res) => {
  try {
    const incoming = req.body;
    // tanggapin lang kapag mas bago kaysa sa naka-save
    if (
      incoming &&
      typeof incoming === "object" &&
      (incoming.ts || 0) >= (groupPrefs.ts || 0)
    ) {
      groupPrefs = incoming;
      const payload = JSON.stringify(groupPrefs, null, 2);
      fileQueue.enqueue(() => fs.writeFile(groupPrefsPath, payload));
    }
    res.json(groupPrefs);
  } catch (error) {
    console.error("POST /api/group-matches-prefs error:", error);
    res.status(500).json({ message: "Error saving group matches prefs" });
  }
});

// ==========================================
// --- FITUR ARSIP MATCH ---
// ==========================================
app.post("/api/save-match-record", async (req, res) => {
  try {
    fileQueue.enqueue(async () => {
      if (!fsSync.existsSync(savedMatchDir))
        await fs.mkdir(savedMatchDir, { recursive: true });
      for (let i = 6; i >= 1; i--) {
        const currentFile = path.join(savedMatchDir, `matchdata${i}.json`);
        const nextFile = path.join(savedMatchDir, `matchdata${i + 1}.json`);
        try {
          await fs.access(currentFile);
          await fs.rename(currentFile, nextFile);
        } catch (err) {}
      }
      const destPath = path.join(savedMatchDir, "matchdata1.json");
      await fs.writeFile(destPath, JSON.stringify(cache.matchdata, null, 2));
    });
    res.json({ message: "Match archived successfully (Queued)" });
  } catch (error) {
    res.status(500).json({ message: "Error archiving match data" });
  }
});

app.post("/api/archive-draft", (req, res) => {
  try {
    fileQueue.enqueue(() =>
      fs.writeFile(prevDraftPath, JSON.stringify(cache.matchdraft, null, 2)),
    );
    broadcast({ type: "analyzer_update" });
    res.json({ message: "Draft archived (Queued)" });
  } catch (error) {
    res.status(500).json({ message: "Error archiving draft" });
  }
});

app.get("/api/previousdraft", async (req, res) => {
  try {
    const data = await fs.readFile(prevDraftPath, "utf8");
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ message: "Error reading prev draft" });
  }
});

app.post("/api/analyzer-control", (req, res) => {
  broadcast({ type: "analyzer_control", action: req.body.action });
  res.json({ message: `Analyzer command sent` });
});

app.post("/api/delete-all-records", async (req, res) => {
  try {
    fileQueue.enqueue(async () => {
      if (fsSync.existsSync(savedMatchDir)) {
        const files = await fs.readdir(savedMatchDir);
        for (const file of files) {
          await fs.unlink(path.join(savedMatchDir, file));
        }
      }
    });

    res.json({ message: "All match records deleted successfully (Queued)" });
  } catch (error) {
    console.error("Delete all records error:", error);
    res.status(500).json({ message: "Error deleting match records" });
  }
});

// ==========================================
// 8. START SERVER (PORT 3000)
// ==========================================
const port = Number(process.env.PORT || 3000);
const localIp = getLocalIp();

async function start() {
  await Promise.all([loadCache(), flagDbReady, heroListReady]);
  matchStore = createMatchStore({
    initial: cache.matchdata,
    file: matchDataPath,
    onCommit: ({ data, revision }) => {
      cache.matchdata = data;
      broadcast({ type: "matchdata_update", data, revision });
      broadcast({ type: "update", data: { matchdata: data }, revision });
    },
  });
  rosterThemeStore = await loadRosterThemeStore({
    file: path.join(__dirname, "runtime", "roster-theme.json"),
    onCommit: snapshot => broadcast({ type: "roster_theme_update", ...snapshot }),
  });
  sponsorStore = await loadSponsorStore({
    file: path.join(__dirname, "runtime", "broadcast-sponsors.json"),
    onCommit: snapshot => broadcast({ type: "broadcast_sponsors_update", ...snapshot }),
  });
  colorStore = await loadColorStore({
    file: path.join(__dirname, "runtime", "broadcast-colors.json"),
    onCommit: snapshot => broadcast({ type: "broadcast_colors_update", ...snapshot }),
  });
  server.listen(port, "0.0.0.0", async () => {
    const boundPort = server.address().port;
    console.log("=============================================");
    console.log(` SERVER STARTED (MLBB LIVE ASSETS V1.0) `);
    console.log(` Local:   http://localhost:${boundPort}`);
    console.log(` Network: http://${localIp}:${boundPort}`);
    console.log(` Status:  Cache & Async Queue Active! `);
    console.log(` Tournament: http://localhost:${boundPort}/controller.html`);
    console.log(` Viewer:     http://localhost:${boundPort}/viewer.html`);
    console.log("=============================================");

    try {
      await fs.writeFile(path.join(__dirname, "public/serverip.txt"), localIp);
    } catch (error) {}
  });
}
start().catch(error => {
  console.error("Server startup failed:", error.message);
  clearInterval(interval);
  process.exitCode = 1;
});
