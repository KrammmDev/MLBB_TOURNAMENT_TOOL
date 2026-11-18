"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
test(
  "winner overlay follows live winner cues with logo/name only, safe fallbacks and stable animation",
  { timeout: 30000 },
  async (t) => {
    const app = express(),
      server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const wss = new WebSocketServer({ server }),
      writes = [];
    let missingRequests = 0;
    let data = require("./fixtures").fixture();
    app.use((req, res, next) => {
      if (req.method !== "GET") writes.push(req.method + " " + req.url);
      next();
    });
    app.get("/api/matchdata", (q, s) => s.json(data));
    app.get("/api/scoreboard-branding", (q, s) =>
      s.json({ data: { patchLabel: "STARWARD DECADE 1009" } }),
    );
    app.get("/api/broadcast-colors", (q, s) =>
      s.json({ revision: '"1"', data: { schemaVersion: 2, palettes: {} } }),
    );
    app.get("/Assets/Team/missing.png", (q, s) => {
      missingRequests++;
      s.sendStatus(404);
    });
    app.get(/^\/Assets\/Team\//, (q, s) =>
      s
        .type("svg")
        .send(
          '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><path fill="cyan" d="M160 15 305 80 260 245 160 305 60 245 15 80Z"/><path fill="#101820" d="m90 90 140 0-70 150Z"/></svg>',
        ),
    );
    app.use(express.static(path.join(__dirname, "../public")));
    wss.on("connection", (s) =>
      s.on("message", (raw) => writes.push(String(raw))),
    );
    const send = () => {
      for (const s of wss.clients)
        s.send(JSON.stringify({ type: "matchdata_update", data }));
    };
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
      args: ["--no-sandbox"],
    });
    t.after(async () => {
      await browser.close();
      for (const s of wss.clients) s.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
    });
    const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.winnerReveals = 0;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (this.id === "winnerWrapper") window.winnerReveals++;
        return animate.apply(this, args);
      };
    });
    await page.goto(
      "http://127.0.0.1:" + server.address().port + "/matchwinner.html",
    );
    await page.waitForFunction(
      () => document.getElementById("winnerStage").dataset.ready === "true",
    );
    await page.locator("#winnerWrapper").waitFor({ state: "hidden" });
    assert.equal(
      await page
        .locator("body")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    assert.equal(
      await page
        .locator("#winnerStage")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    data.teamdata.redteam.teamname = "RED PHOENIX";
    data.teamdata.redteam.logo = "Assets/Team/red.png";
    data.winmatches = "blue";
    data.game_number = 2;
    data.matchInfo = {
      match: "GRAND FINALS",
      stage: "KNOCKOUT STAGE",
      group: "DAY 1",
    };
    data.teamdata.blueteam.teamname = "BLUE TITANS";
    data.teamdata.blueteam.logo = "Assets/Team/blue.png";
    send();
    await page.waitForFunction(
      () =>
        document.getElementById("winnerName").textContent === "BLUE TITANS" &&
        document
          .getElementById("winnerWrapper")
          .classList.contains("is-visible"),
    );
    await page.waitForFunction(
      () =>
        document.getElementById("winnerLogoImg").naturalWidth === 320 &&
        !document.getElementById("winnerLogoImg").hidden,
    );
    assert.equal(await page.locator("#gameNumber").textContent(), "GAME 2");
    assert.equal(
      await page.locator("#resultMatch").textContent(),
      "GRAND FINALS",
    );
    assert.equal(
      await page.locator("#resultStageDay").textContent(),
      "KNOCKOUT STAGE DAY 1",
    );
    await page.waitForFunction(
      () =>
        document.getElementById("resultPatch").textContent ===
        "STARWARD DECADE 1009",
    );
    for (const socket of wss.clients)
      socket.send(
        JSON.stringify({
          type: "scoreboard_branding_update",
          data: { patchLabel: "PATCH <b>2</b>" },
        }),
      );
    await page.waitForFunction(
      () =>
        document.getElementById("resultPatch").textContent === "PATCH <b>2</b>",
    );
    assert.equal(await page.locator("#resultPatch b").count(), 0);

    await page
      .locator("#winnerWrapper")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    assert.deepEqual(await page.locator("#winnerWrapper").boundingBox(), {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    assert.equal(
      await page
        .locator(".victory-heading")
        .evaluate((e) => getComputedStyle(e).backgroundClip),
      "text",
    );
    assert.equal(
      await page
        .locator(".victory-heading")
        .evaluate((e) => getComputedStyle(e, "::after").content),
      "none",
    );
    assert.equal(
      await page
        .locator(".winning-team")
        .evaluate((e) => getComputedStyle(e).backgroundImage),
      "none",
    );
    assert.equal(
      await page
        .locator(".losing-team")
        .evaluate((e) => getComputedStyle(e).backgroundImage),
      "none",
    );
    assert.equal(
      await page
        .locator(".winning-team")
        .evaluate((e) => getComputedStyle(e, "::before").content),
      "none",
    );
    const shine = () =>
      page
        .locator(".tournament-rail")
        .evaluate((e) => getComputedStyle(e, "::after").transform);
    const beforeShine = await shine();
    await page.waitForTimeout(300);
    assert.notEqual(await shine(), beforeShine, "narrow rail light moves");
    assert.equal(
      await page
        .locator(".winning-team")
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    assert.equal(
      await page
        .locator(".winning-team")
        .evaluate((e) => getComputedStyle(e, "::after").display),
      "none",
    );
    for (const socket of wss.clients)
      socket.send(
        JSON.stringify({
          type: "broadcast_colors_update",
          data: {
            schemaVersion: 2,
            palettes: {
              arena: {
                matchwinner: {
                  background: "#331144",
                  left: "#00ff88",
                  right: "#224466",
                  text: "#ffffff",
                  muted: "#bbccee",
                  border: "#cc33aa",
                },
              },
            },
          },
        }),
      );
    await page.waitForFunction(
      () =>
        getComputedStyle(document.body)
          .getPropertyValue("--mw-background")
          .trim() === "#331144",
    );
    assert.equal(
      await page
        .locator("#winnerWrapper")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(51, 17, 68)",
    );
    assert.equal(
      await page
        .locator(".losing-team")
        .evaluate((e) => getComputedStyle(e).filter),
      "grayscale(1)",
    );
    assert.equal(await page.locator("#loserName").textContent(), "RED PHOENIX");
    assert.equal(
      await page
        .locator(".losing-team")
        .evaluate((e) => getComputedStyle(e).filter),
      "grayscale(1)",
    );
    assert.equal(
      await page
        .locator(".winning-team")
        .evaluate((e) => getComputedStyle(e).filter),
      "none",
    );
    for (const socket of wss.clients)
      socket.send(
        JSON.stringify({
          type: "update",
          data: { "tournament-title": "LCUAA ESPORTS CHAMPIONSHIP" },
        }),
      );
    await page.waitForFunction(
      () =>
        document.getElementById("tournamentName").textContent ===
        "LCUAA ESPORTS CHAMPIONSHIP",
    );
    assert.equal(
      await page.locator("#winnerWrapper").getAttribute("data-side"),
      "blue",
    );
    assert.equal(await page.evaluate(() => window.winnerReveals), 1);
    for (let i = 0; i < 4; i++) send();
    await page.waitForTimeout(5500);
    assert.equal(
      await page.evaluate(() => window.winnerReveals),
      1,
      "unchanged feed/poll does not replay the entrance",
    );
    if (process.env.MLBB_CAPTURE_DIR) {
      const fs = require("node:fs/promises");
      await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: path.join(process.env.MLBB_CAPTURE_DIR, "match-winner-blue.png"),
        omitBackground: true,
      });
    }
    data.teamdata.blueteam.teamname =
      "CITY UNIVERSITY <b>CHAMPIONS</b> ESPORTS TEAM";
    send();
    await page.waitForFunction(() =>
      document.getElementById("winnerName").textContent.includes("<b>"),
    );
    assert.equal(await page.locator("#winnerName b").count(), 0);
    assert.equal(
      await page.evaluate(() => window.winnerReveals),
      1,
      "editing the winning name does not replay the cue",
    );
    assert.ok(
      await page
        .locator("#winnerName")
        .evaluate(
          (e) =>
            e.scrollHeight <= e.clientHeight && e.scrollWidth <= e.clientWidth,
        ),
    );
    data.winmatches = "red";
    data.game_number = 3;
    data.teamdata.redteam.teamname = "RED PHOENIX";
    data.teamdata.redteam.logo = "Assets/Team/missing.png";
    send();
    await page.waitForFunction(
      () =>
        document.getElementById("winnerName").textContent === "RED PHOENIX" &&
        document
          .getElementById("winnerWrapper")
          .classList.contains("without-logo"),
    );
    assert.equal(
      await page.locator("#winnerWrapper").getAttribute("data-side"),
      "red",
    );
    assert.equal(await page.locator("#winnerLogoImg").isVisible(), false);
    assert.equal(await page.evaluate(() => window.winnerReveals), 2);
    assert.equal(
      await page.locator("#loserName").textContent(),
      "CITY UNIVERSITY <b>CHAMPIONS</b> ESPORTS TEAM",
    );
    assert.equal(
      await page
        .locator(".winning-team")
        .evaluate((e) => getComputedStyle(e).order),
      "3",
    );
    const failed = missingRequests;
    send();
    await page.waitForTimeout(200);
    assert.equal(
      missingRequests,
      failed,
      "failed logo is not re-requested on the same cue",
    );
    data.winmatches = "none";
    send();
    await page.locator("#winnerWrapper").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator("#winnerWrapper").getAttribute("aria-hidden"),
      "true",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".winning-team")
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    assert.equal(
      await page
        .locator(".winning-team")
        .evaluate((e) => getComputedStyle(e, "::after").animationName),
      "none",
    );
    data.winmatches = "red";
    data.teamdata.redteam.logo = "javascript:alert(1)";
    send();
    await page.waitForFunction(() =>
      document.getElementById("winnerWrapper").classList.contains("is-visible"),
    );
    assert.equal(
      await page.locator("#winnerLogoImg").getAttribute("src"),
      null,
    );
    assert.equal(
      await page.evaluate(() => window.winnerReveals),
      2,
      "reduced motion skips entrance animation",
    );
    await page.setViewportSize({ width: 960, height: 540 });
    await page.waitForFunction(
      () =>
        document.getElementById("winnerStage").getBoundingClientRect().width ===
        960,
    );
    const box = await page.locator("#winnerWrapper").boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 960 &&
        box.y + box.height <= 540,
    );
    data.winmatches = "blue";
    data.game_number = 4;
    data.teamdata.blueteam.logo = "";
    data.teamdata.blueteam.teamname = "NAME ONLY WINNERS";
    send();
    await page.waitForFunction(
      () =>
        document.getElementById("winnerName").textContent ===
        "NAME ONLY WINNERS",
    );
    assert.equal(await page.locator("#winnerLogoSlot").isVisible(), false);
    assert.equal(await page.locator("#gameNumber").textContent(), "GAME 4");
    assert.deepEqual(writes, [], "winner overlay never writes match state");
    assert.deepEqual(errors, []);
  },
);

test(
  "winner color control persists an independent palette and resets it",
  { timeout: 20000 },
  async (t) => {
    const app = express(),
      server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const {
      createColorStore,
      installColorRoutes,
    } = require("../lib/broadcast-colors");
    const store = createColorStore({
      file: "/tmp/winner-colors-test.json",
      persist: async () => {},
      initial: {
        schemaVersion: 2,
        palettes: { arena: { schedule: { left: "#112233" } } },
      },
    });
    app.use(express.json());
    installColorRoutes(app, () => store);
    const data = require("./fixtures").fixture();
    data.winmatches = "blue";
    app.get("/api/matchdata", (q, s) => s.json(data));
    app.use(express.static(path.join(__dirname, "../public")));
    const wss = new WebSocketServer({ server });
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
      args: ["--no-sandbox"],
    });
    t.after(async () => {
      await browser.close();
      for (const s of wss.clients) s.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
    });
    const page = await browser.newPage();
    await page.goto(
      "http://127.0.0.1:" + server.address().port + "/matchwinner-control.html",
    );
    await page.waitForFunction(() => !document.getElementById("save").disabled);
    await page.locator("#color-background").evaluate((e) => {
      e.value = "#334455";
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const preview = page.frameLocator("#preview");
    await preview.locator("body").evaluate(
      (e) =>
        new Promise((resolve) => {
          const tick = () =>
            getComputedStyle(e).getPropertyValue("--mw-background").trim() ===
            "#334455"
              ? resolve()
              : setTimeout(tick, 20);
          tick();
        }),
    );
    assert.equal(
      store.snapshot().data.palettes.arena.matchwinner,
      undefined,
      "preview does not save",
    );
    await page.click("#save");
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent ===
        "Saved — OBS updated.",
    );
    assert.equal(
      store.snapshot().data.palettes.arena.matchwinner.background,
      "#334455",
    );
    assert.deepEqual(store.snapshot().data.palettes.arena.schedule, {
      left: "#112233",
    });
    await page.click("#reset");
    await page.waitForFunction(() => !document.getElementById("save").disabled);
    assert.deepEqual(store.snapshot().data.palettes.arena.matchwinner, {});
  },
);
