"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const { fixture } = require("./fixtures"),
  { createMatchStore } = require("../lib/match-store"),
  { installMatchRoutes } = require("../lib/match-routes"),
  {
    createRosterThemeStore,
    installRosterThemeRoutes,
  } = require("../lib/roster-theme-store"),
  { loadColorStore, installColorRoutes } = require("../lib/broadcast-colors");
test(
  "scoreboard follows theme/draft palette, preserves match bindings, isolates preview and recovers",
  { timeout: 90000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "scoreboard-")),
      app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const broadcast = (message) => {
      for (const client of wss.clients) client.send(JSON.stringify(message));
    };
    const data = fixture();
    data.matchFormat = 5;
    data.matchInfo = {
      stage: "PLAYOFFS",
      group: "DAY 2",
      match: "GRAND FINALS",
      game: "GAME 3",
    };
    Object.assign(data.teamdata.blueteam, {
      teamname: "CITY COLLEGE OF ANGELES",
      logo: "Assets/Team/left.png",
      score: "2",
      turtles: 2,
    });
    Object.assign(data.teamdata.redteam, {
      teamname: "TAGUIG CITY UNIVERSITY",
      logo: "Assets/Team/right.png",
      score: "1",
      turtles: 1,
    });
    const match = createMatchStore({ initial: data, persist: async () => {} }),
      themes = createRosterThemeStore({
        initial: { schemaVersion: 1, themeId: "arena", previousThemeId: null },
        persist: async () => {},
      }),
      colors = await loadColorStore({
        file: path.join(directory, "colors.json"),
        onCommit: (snapshot) =>
          broadcast({ type: "broadcast_colors_update", ...snapshot }),
      });
    const before = JSON.stringify(match.snapshot()),
      writes = [];
    app.use(express.json());
    app.use((req, res, next) => {
      if (req.method !== "GET") writes.push(req.path);
      next();
    });
    installMatchRoutes(app, () => match);
    installRosterThemeRoutes(app, () => themes);
    installColorRoutes(app, () => colors);
    app.get("/api/broadcast-sponsors", (req, res) =>
      res.json({
        data: {
          schemaVersion: 1,
          enabled: true,
          intervalSeconds: 5,
          logos: [
            {
              id: "test-sponsor",
              file: "11111111-1111-4111-8111-111111111111.png",
            },
          ],
        },
        revision: '"test"',
      }),
    );
    app.use(express.static(path.join(__dirname, "../public")));
    server.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
    });
    t.after(async () => {
      await browser.close();
      for (const client of wss.clients) client.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      await fs.rm(directory, { recursive: true, force: true });
    });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      }),
      errors = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (
        url.pathname.includes("/Assets/") ||
        url.pathname.startsWith("/broadcast-sponsors/")
      )
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="#24b3cb"/></svg>',
        });
      return route.continue();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function page(url) {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + url);
      return page;
    }
    const live = await page("/scoreboard.html"),
      pinned = await page("/scoreboard-display.html?theme=classic");
    const ready = (page, id) =>
      page.waitForFunction(
        (id) =>
          document.body.dataset.scoreboardTheme === id &&
          document.body.dataset.scoreboardReady === "true",
        id,
      );
    await ready(live, "arena");
    await ready(pinned, "classic");
    await live.locator("#sb-sponsors img").waitFor();
    assert.equal(
      await live.locator("#name-box-1").textContent(),
      data.teamdata.blueteam.teamname,
    );
    assert.equal(await live.locator("#blue-score-display .active").count(), 2);
    assert.equal(await live.locator("#blue-score-display .sb-win").count(), 3);
    assert.equal(await live.locator("#red-turtle-container img").count(), 1);
    assert.equal(await live.locator("#sb-game").textContent(), "GAME 3");
    assert.equal(
      await live
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    for (const id of ["classic", "arena", "studio"]) {
      await themes.select(id, themes.snapshot().revision);
      broadcast({ type: "roster_theme_update", ...themes.snapshot() });
      await ready(live, id);
      const sponsorBox = await live.locator("#sb-sponsors img").boundingBox(),
        infoBox = await live.locator("#match-display").boundingBox();
      assert.ok(
        sponsorBox.x >= 1724 &&
          sponsorBox.x >= infoBox.x + infoBox.width &&
          infoBox.y >= sponsorBox.y &&
          infoBox.y < sponsorBox.y + sponsorBox.height,
        "match details are left of sponsor in adjacent panels",
      );
      assert.equal(
        (await live.locator("#match-display").innerText())
          .replace(/\s+/g, " ")
          .trim(),
        "GRAND FINALS | GAME 3",
      );
      assert.equal(
        await live
          .locator(
            "#bluelord,#redlord,#bluegold,#redgold,#bluetower,#redtower,#homescore,#awayscore,#timer",
          )
          .count(),
        0,
      );
      const safeAreas = await live.evaluate(() =>
        [
          [170, 170],
          [960, 20],
          [1600, 400],
        ].map(
          ([x, y]) =>
            document
              .elementsFromPoint(x, y)
              .filter((el) =>
                ["sb-frame", "sb-banner"].some((cls) =>
                  el.classList.contains(cls),
                ),
              ).length,
        ),
      );
      assert.deepEqual(
        safeAreas,
        [0, 0, 0],
        "minimap, top game HUD and gameplay stay uncovered",
      );
      const logoBox = await live.locator("#displayImage1").boundingBox();
      assert.ok(logoBox.x >= 394 && logoBox.x + logoBox.width <= 510);
      if (process.env.MLBB_CAPTURE_DIR) {
        await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
        await live.screenshot({
          omitBackground: true,
          path: path.join(process.env.MLBB_CAPTURE_DIR, `scoreboard-${id}.png`),
        });
      }
    }
    assert.equal(
      await pinned.locator("body").getAttribute("data-scoreboard-theme"),
      "classic",
    );
    const admin = await page("/broadcast-themes.html");
    await admin.locator("#preview-output").selectOption("scoreboard");
    await admin.waitForFunction(() =>
      document
        .getElementById("theme-status")
        .textContent.startsWith("Preview ready"),
    );
    await admin.locator("#color-hex-left").fill("#bb66dd");
    const frame = admin.frames().find((frame) => frame !== admin.mainFrame());
    await frame.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".sb-left")).borderLeftColor ===
        "rgb(187, 102, 221)",
    );
    assert.notEqual(
      await live
        .locator(".sb-left")
        .evaluate((el) => getComputedStyle(el).borderLeftColor),
      "rgb(187, 102, 221)",
    );
    await admin.locator("#save-colors").click();
    await live.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".sb-left")).borderLeftColor ===
        "rgb(187, 102, 221)",
    );
    assert.deepEqual(colors.snapshot().data.palettes.studio.draft, {
      left: "#bb66dd",
    });
    const changed = structuredClone(data);
    changed.teamdata.blueteam.teamname = "<b>LONG TEAM NAME FROM OPERATOR</b>";
    changed.teamdata.blueteam.score = "3";
    changed.teamdata.blueteam.turtles = 0;
    changed.matchInfo.game = "GAME 4";
    changed.matchInfo.stage = "GROUP STAGE";
    changed.matchInfo.group = "GROUP A";
    broadcast({ type: "matchdata_update", data: changed });
    await live.waitForFunction(
      () => document.getElementById("sb-game").textContent === "GAME 4",
    );
    assert.equal(
      await live.locator("#matchinfo-main").textContent(),
      "GROUP STAGE",
    );
    assert.equal(await live.locator("#matchinfo-day").textContent(), "GROUP A");
    assert.equal(await live.locator("#name-box-1 b").count(), 0);
    assert.equal(await live.locator("#blue-score-display .active").count(), 3);
    assert.equal(await live.locator("#blue-turtle-container img").count(), 0);
    for (const client of wss.clients) client.close();
    await live.waitForFunction(
      () => document.getElementById("sb-game").textContent === "GAME 3",
    );
    await live.reload();
    await ready(live, "studio");
    assert.equal(
      await live.locator("#sb-match-text").textContent(),
      "GRAND FINALS",
    );
    await live.setViewportSize({ width: 960, height: 540 });
    await live.waitForFunction(
      () =>
        getComputedStyle(document.getElementById("scoreboard-stage"))
          .transform === "matrix(0.5, 0, 0, 0.5, 0, 0)",
    );
    assert.equal(
      await live
        .locator("#scoreboard-stage")
        .evaluate((el) => getComputedStyle(el).transform),
      "matrix(0.5, 0, 0, 0.5, 0, 0)",
    );
    assert.equal(JSON.stringify(match.snapshot()), before);
    assert.deepEqual(writes, ["/api/broadcast-colors"]);
    assert.deepEqual(errors, []);
  },
);
