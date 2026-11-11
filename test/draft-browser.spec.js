"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  http = require("node:http");
const express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const { createMatchStore } = require("../lib/match-store"),
  { installMatchRoutes } = require("../lib/match-routes");
const {
    createRosterThemeStore,
    installRosterThemeRoutes,
  } = require("../lib/roster-theme-store"),
  { mirrorDraftTimer } = require("../lib/draft-timer");
const { fixture } = require("./fixtures");
test(
  "draft outputs: both formats, blank branding, phase/clock updates, preview, activation and reconnect",
  { timeout: 60000 },
  async (t) => {
    const app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const broadcast = (message) => {
      for (const socket of wss.clients) socket.send(JSON.stringify(message));
    };
    const matchData = fixture();
    matchData.teamdata.blueteam.teamname = "North";
    matchData.teamdata.redteam.teamname = "South";
    matchData.teamdata.blueteam.coach = "Coach North";
    matchData.teamdata.blueteam.playerlist[0].lane = "gold";
    const match = createMatchStore({
      initial: matchData,
      persist: async () => {},
      onCommit: (snapshot) =>
        broadcast({ type: "matchdata_update", ...snapshot }),
    });
    const themes = createRosterThemeStore({
      initial: { schemaVersion: 1, themeId: "studio", previousThemeId: null },
      persist: async () => {},
      onCommit: (snapshot) =>
        broadcast({ type: "roster_theme_update", ...snapshot }),
    });
    const blankSide = () => ({
      pick: Array.from({ length: 5 }, () => ({})),
      ban: Array.from({ length: 5 }, () => ({})),
    });
    let draft = {
      draftdata: {
        current_phase: 6,
        timer: "18",
        timer_running: false,
        blueside: blankSide(),
        redside: blankSide(),
      },
    };
    draft.draftdata.blueside.pick[0] = { hero: "Assets/HeroPick/Alpha.png" };
    const heroes = [
      { name: "Alpha", img: "Assets/HeroPick/Alpha.png" },
      { name: "Balmond", img: "Assets/HeroPick/Balmond.png" },
    ];
    const writes = [];
    app.use(express.json());
    app.use((req, res, next) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method))
        writes.push(req.path);
      next();
    });
    installMatchRoutes(app, () => match);
    installRosterThemeRoutes(app, () => themes);
    app.get("/api/matchdraft", (req, res) =>
      res.set("Cache-Control", "no-store").json(draft),
    );
    app.get("/database/herolist.json", (req, res) => res.json(heroes));
    app.get("/api/herostats", (req, res) => res.json({ heroes: {} }));
    app.use(express.static(path.join(__dirname, "../public")));
    wss.on("connection", (socket) =>
      socket.on("message", (body) => {
        const message = JSON.parse(body);
        if (message.type === "update") {
          draft = mirrorDraftTimer(draft, message.data?.draftdata);
          broadcast(message);
        }
      }),
    );
    server.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
    });
    t.after(async () => {
      await browser.close();
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 810 },
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (/\/Assets\//i.test(url.pathname))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="#34536b"/><circle cx="100" cy="90" r="50" fill="#9eafbf"/><path d="M25 300V200Q25 150 100 150Q175 150 175 200V300" fill="#577c94"/></svg>',
        });
      return route.continue();
    });
    const base = `http://127.0.0.1:${server.address().port}`,
      errors = [];
    async function page(url) {
      const p = await context.newPage();
      p.on("pageerror", (error) => errors.push(error.message));
      await p.goto(base + url);
      return p;
    }
    const normal = await page("/draft-display.html"),
      six = await page("/draft-display.html?format=six"),
      legacy = await page("/display2.html"),
      legacySix = await page("/display2ban6.html");
    for (const p of [normal, six, legacy, legacySix])
      await p.waitForFunction(
        () =>
          window.DraftDisplay?.state().phase?.index === 6 &&
          document.getElementById("timer").textContent === "18",
      );
    for (const p of [normal, six])
      await p.waitForFunction(
        () => document.body.dataset.draftReady === "true",
      );
    assert.equal(await normal.locator(".banhero").count(), 10);
    assert.equal(await six.locator(".banhero").count(), 6);
    assert.equal(
      await normal.locator("#pick-left-1").getAttribute("class"),
      "box pick active-pick",
    );
    for (const p of [six, legacySix])
      assert.ok(
        (await p.locator("#pick-left-2").getAttribute("class")).includes(
          "active-pick",
        ),
      );
    await normal.waitForFunction(
      () => document.getElementById("hero-name-1").textContent === "Alpha",
    );
    assert.equal(await normal.locator("#name-box-1").textContent(), "North");
    assert.equal(await normal.locator("#match-display").textContent(), "");
    assert.doesNotMatch(
      await normal.locator("body").innerText(),
      /MLBB|WORLD CHAMP|BROADCAST OVERLAY|MATCH 1|GAME 1|Unknown/,
    );
    // Live zero ticks remain zero in both the numeric display and timer fill, including after recovery.
    broadcast({
      type: "update",
      data: { draftdata: { timer: "0", timer_running: false } },
    });
    draft = mirrorDraftTimer(draft, { timer: "0", timer_running: false });
    for (const p of [normal, six, legacy, legacySix])
      await p.waitForFunction(
        () => document.getElementById("timer").textContent === "00",
      );
    assert.equal(
      await normal.locator("#timer-bar").evaluate((el) => el.style.transform),
      "scaleX(0)",
    );
    // Full phase change highlights the correct pair without changing controller rules.
    draft = {
      draftdata: {
        ...draft.draftdata,
        current_phase: 7,
        timer: "35",
        timer_running: true,
      },
    };
    broadcast({ type: "draftdata_update", data: draft.draftdata });
    await normal.waitForFunction(
      () =>
        document
          .getElementById("pick-right-1")
          .classList.contains("active-pick") &&
        document
          .getElementById("pick-right-2")
          .classList.contains("active-pick"),
    );
    await six.waitForFunction(() =>
      document.getElementById("pick-right-3").classList.contains("active-pick"),
    );
    broadcast({ type: "draftdata_update", data: { timer: "bad" } });
    await normal.waitForTimeout(50);
    assert.equal(await normal.locator("#timer").textContent(), "35");
    const before = JSON.stringify(draft),
      matchBefore = match.snapshot().data;
    const admin = await page("/broadcast-themes.html");
    await admin.waitForFunction(
      () => document.getElementById("active-theme").textContent === "Studio",
    );
    await admin.locator("#preview-output").selectOption("draft-six");
    await admin.locator('[data-theme-id="arena"]').click();
    await admin.waitForFunction(
      () => !document.getElementById("activate-theme").disabled,
    );
    assert.equal(themes.snapshot().data.themeId, "studio");
    assert.match(
      await admin.locator("#output-url").inputValue(),
      /draft-display\.html\?format=six$/,
    );
    const index = await normal.locator("#image-display-1").evaluate((el) => {
      window.heroImageReference = el;
      return el.src;
    });
    await admin.locator("#activate-theme").click();
    for (const p of [normal, six])
      await p.waitForFunction(
        () => document.body.dataset.draftTheme === "arena",
      );
    assert.equal(
      await normal
        .locator("#image-display-1")
        .evaluate((el) => el === window.heroImageReference),
      true,
    );
    assert.equal(
      await normal.locator("#image-display-1").evaluate((el) => el.src),
      index,
    );
    assert.equal(JSON.stringify(draft), before);
    assert.deepEqual(match.snapshot().data, matchBefore);
    // Legacy geometry is fixed and does not load the new theme CSS.
    assert.equal(
      await legacy.locator('link[href*="draft-base.css"]').count(),
      0,
    );
    for (const socket of wss.clients) socket.close();
    draft = {
      draftdata: { ...draft.draftdata, timer: "0", timer_running: false },
    };
    await normal.waitForFunction(
      () => document.getElementById("timer").textContent === "00",
    );
    assert.equal(
      await normal
        .locator("#image-display-1")
        .evaluate((el) => el === window.heroImageReference),
      true,
    );
    // Corrections, missing art and reset are display updates only.
    draft.draftdata.blueside.pick[0] = { hero: "Assets/HeroPick/Balmond.png" };
    broadcast({ type: "draftdata_update", data: draft.draftdata });
    await normal.waitForFunction(
      () => document.getElementById("hero-name-1").textContent === "Balmond",
    );
    if (process.env.MLBB_CAPTURE_DIR) {
      const fs = require("node:fs/promises");
      await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
      await normal.screenshot({
        path: path.join(process.env.MLBB_CAPTURE_DIR, "draft-arena.png"),
        omitBackground: true,
      });
      await admin.screenshot({
        path: path.join(
          process.env.MLBB_CAPTURE_DIR,
          "draft-theme-control.png",
        ),
        fullPage: true,
      });
    }
    draft.draftdata.blueside.pick[0] = {};
    draft.draftdata.current_phase = 0;
    broadcast({ type: "draftdata_update", data: draft.draftdata });
    await normal.waitForFunction(
      () => !document.getElementById("image-box-1").classList.contains("show"),
    );
    assert.equal(await normal.locator("#hero-name-1").textContent(), "");
    assert.deepEqual(writes, ["/api/broadcast-theme"]);
    assert.deepEqual(errors, []);
  },
);
