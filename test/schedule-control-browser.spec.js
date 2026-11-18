"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const {
  createRosterThemeStore,
  installRosterThemeRoutes,
} = require("../lib/roster-theme-store");
const {
  loadColorStore,
  installColorRoutes,
} = require("../lib/broadcast-colors");
const {
  createPanelStore,
  installPanelRoutes,
} = require("../lib/production-panel");
test(
  "real Schedule Control publishes live edits and caster replacements across browser contexts",
  { timeout: 30000 },
  async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "schedule-control-"));
    const app = express(),
      server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const wss = new WebSocketServer({ server }),
      received = [];
    let writer;
    const shared = {
      "unrelated-setting": "SERVER VALUE",
      "schedule-1": JSON.stringify({
        show: true,
        time: "MATCH 1 - BO3",
        team1: "SERVER BLUE",
        team2: "SERVER RED",
        score1: "1",
        score2: "0",
        logo1: "Assets/Team/a.png",
        logo2: "Assets/Team/b.png",
        castersImg: "Assets/caster-old.png",
        showCasters: true,
      }),
    };
    const broadcast = (m, except) => {
      for (const c of wss.clients) if (c !== except) c.send(JSON.stringify(m));
    };
    app.use(express.json());
    const themes = createRosterThemeStore({
      initial: { schemaVersion: 1, themeId: "arena", previousThemeId: null },
      persist: async () => {},
    });
    const colors = await loadColorStore({
      file: path.join(dir, "colors.json"),
    });
    installRosterThemeRoutes(app, () => themes);
    installColorRoutes(app, () => colors);
    installPanelRoutes(app, () =>
      createPanelStore({ persist: async () => {} }),
    );
    app.get("/api/matchdata", (q, s) =>
      s.json(require("./fixtures").fixture()),
    );
    app.get("/api/schedule", (q, s) => s.json({}));
    app.get("/api/scoreboard-branding", (q, s) =>
      s.json({ data: { logoFile: null } }),
    );
    app.get("/api/broadcast-sponsors", (q, s) =>
      s.json({ data: { enabled: false, logos: [] } }),
    );
    app.get(/^\/Assets\/(?!Font\/)/, (q, s) =>
      s
        .type("svg")
        .send(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>',
        ),
    );
    app.use(express.static(path.join(__dirname, "../public")));
    wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "init", data: shared }));
      socket.on("message", (raw) => {
        const m = JSON.parse(raw);
        received.push(m);
        writer = socket;
        if (m.type === "update") {
          for (const [key, value] of Object.entries(m.data || {})) {
            if (value === null) delete shared[key];
            else shared[key] = value;
          }
          broadcast(m, socket);
        }
      });
    });
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
      args: ["--no-sandbox"],
    });
    t.after(async () => {
      await browser.close();
      for (const c of wss.clients) c.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      await fs.rm(dir, { recursive: true, force: true });
    });
    const controlCtx = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
      }),
      displayCtx = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
    await controlCtx.addInitScript(() => {
      localStorage.setItem("unrelated-setting", "STALE BROWSER VALUE");
      localStorage.setItem(
        "schedule-1",
        JSON.stringify({ show: false, team1: "STALE BROWSER TEAM" }),
      );
    });
    const control = await controlCtx.newPage(),
      display = await displayCtx.newPage(),
      errors = [];
    for (const page of [control, display])
      page.on("pageerror", (e) => errors.push(e.message));
    const base = "http://127.0.0.1:" + server.address().port;
    await control.goto(base + "/schedulecontrol.html");
    await display.goto(base + "/scheduledisplay.html?theme=arena");
    await control.waitForFunction(
      () =>
        document.getElementById("schedule-sync-status").textContent ===
        "Live sync",
    );
    assert.equal(await control.locator("#team1-1").inputValue(), "SERVER BLUE");
    assert.equal(await control.locator("#show-1").isChecked(), true);
    assert.ok(
      (await control.locator("#logo1-1").getAttribute("src")).endsWith(
        "Assets/Team/a.png",
      ),
    );
    await display.waitForFunction(
      () =>
        document.querySelector(".schedule-team span")?.textContent ===
        "SERVER BLUE",
    );
    assert.equal(
      received.length,
      0,
      "connecting does not replay stale browser state",
    );
    await control.locator("#team1-1").fill("LIVE BLUE");
    await display.waitForFunction(
      () =>
        document.querySelector(".schedule-team span")?.textContent ===
        "LIVE BLUE",
      null,
      { timeout: 4000 },
    );
    await control.locator("#score1-1").fill("3");
    await display.waitForFunction(
      () =>
        document.querySelector(".schedule-score")?.textContent.startsWith("3"),
      null,
      { timeout: 4000 },
    );
    await control.locator("#time-1").fill("QUARTER FINALS - BO5");
    await display.waitForFunction(
      () =>
        document.querySelector(".schedule-meta")?.textContent ===
        "QUARTER FINALS - BO5",
      null,
      { timeout: 4000 },
    );
    const png = await control.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 16, 16);
      return c.toDataURL("image/png");
    });
    const file = {
      name: "caster.png",
      mimeType: "image/png",
      buffer: Buffer.from(png.split(",")[1], "base64"),
    };
    await control.locator("#casters-file").setInputFiles(file);
    await display.waitForFunction(
      (src) => {
        const img = document.getElementById("schedule-casters");
        return (
          img.getAttribute("src") === src &&
          !img.hidden &&
          img.naturalWidth === 16
        );
      },
      png,
      { timeout: 4000 },
    );
    await control
      .locator("#logo1-file-1")
      .setInputFiles({ ...file, name: "team-logo.png" });
    await display.waitForFunction(
      (src) =>
        document.querySelector(".schedule-team img")?.getAttribute("src") ===
        src,
      png,
      { timeout: 4000 },
    );
    await control.locator("#show-casters").uncheck();
    await display.locator("#schedule-talents").waitFor({ state: "hidden" });
    await control.locator("#show-casters").check();
    await display
      .locator("#schedule-casters")
      .waitFor({ state: "visible", timeout: 4000 });
    const png2 = await control.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 20;
      c.height = 20;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "green";
      ctx.fillRect(0, 0, 20, 20);
      return c.toDataURL("image/png");
    });
    await control.locator("#casters-file").setInputFiles({
      ...file,
      buffer: Buffer.from(png2.split(",")[1], "base64"),
    });
    await display.waitForFunction(
      (src) =>
        document.getElementById("schedule-casters").getAttribute("src") === src,
      png2,
      { timeout: 4000 },
    );
    await control.locator("#casters-file").setInputFiles(file);
    await display.waitForFunction(
      (src) => {
        const img = document.getElementById("schedule-casters");
        return img.getAttribute("src") === src && !img.hidden;
      },
      png,
      { timeout: 4000 },
    );
    assert.equal(await control.locator("#show-1").isChecked(), true);
    assert.equal(JSON.parse(shared["schedule-1"]).show, true);
    writer.terminate();
    await control.waitForFunction(() =>
      document
        .getElementById("schedule-sync-status")
        .textContent.includes("Reconnecting"),
    );
    await control.locator("#team1-1").fill("AFTER RECONNECT");
    await display.waitForFunction(
      () =>
        document.querySelector(".schedule-team span")?.textContent ===
        "AFTER RECONNECT",
      null,
      { timeout: 6000 },
    );
    const peer = { ...JSON.parse(shared["schedule-1"]), team2: "PEER RED" };
    shared["schedule-1"] = JSON.stringify(peer);
    const count = received.length;
    broadcast({ type: "update", data: { "schedule-1": shared["schedule-1"] } });
    await control.waitForFunction(
      () => document.getElementById("team2-1").value === "PEER RED",
    );
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(
      received.length,
      count,
      "received changes do not echo back to the server",
    );
    assert.equal(shared["unrelated-setting"], "SERVER VALUE");
    assert.ok(
      received.every(
        (m) =>
          m.type === "update" &&
          Object.keys(m.data).every((key) => /^schedule-[1-8]$/.test(key)),
      ),
    );
    delete shared["schedule-1"];
    const legacyCtx = await browser.newContext();
    await legacyCtx.addInitScript(() => {
      localStorage.setItem(
        "schedule-1",
        JSON.stringify({
          show: true,
          team1: "LEGACY IMPORT",
          team2: "LEGACY RED",
          score1: "0",
          score2: "0",
        }),
      );
      localStorage.setItem("unrelated-setting", "DO NOT IMPORT");
    });
    const legacy = await legacyCtx.newPage();
    legacy.on("pageerror", (e) => errors.push(e.message));
    await legacy.goto(base + "/schedulecontrol.html");
    await display.waitForFunction(
      () =>
        document.querySelector(".schedule-team span")?.textContent ===
        "LEGACY IMPORT",
      null,
      { timeout: 4000 },
    );
    assert.equal(JSON.parse(shared["schedule-1"]).show, true);
    assert.equal(shared["unrelated-setting"], "SERVER VALUE");
    await control.reload();
    await control.waitForFunction(
      () =>
        document.getElementById("schedule-sync-status").textContent ===
        "Live sync",
    );
    assert.equal(
      await control.locator("#team1-1").inputValue(),
      "LEGACY IMPORT",
    );
    assert.equal(await control.locator("#show-1").isChecked(), true);
    assert.deepEqual(errors, []);
  },
);
