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
} = require("../lib/roster-theme-store");
const state = require("../public/script/match-state"),
  { fixture } = require("./fixtures");
test(
  "roster presets: legacy parity, isolated preview, live activation, conflicts, CSS rollback and reconnect",
  { timeout: 60000 },
  async (t) => {
    const app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const broadcast = (message) => {
      for (const socket of wss.clients) socket.send(JSON.stringify(message));
    };
    const data = fixture();
    data.teamdata.blueteam.playerlist[0].image = "/Assets/player/a.png";
    data.teamdata.blueteam.playerlist[0].name =
      'A very long player name with a quote " and <markup>';
    data.teamdata.blueteam.logo = "/Assets/team-a.png";
    const match = createMatchStore({
      initial: data,
      persist: async () => {},
      onCommit: (snapshot) =>
        broadcast({ type: "matchdata_update", ...snapshot }),
    });
    const themes = createRosterThemeStore({
      initial: { schemaVersion: 1, themeId: "classic", previousThemeId: null },
      persist: async () => {},
      onCommit: (snapshot) =>
        broadcast({ type: "roster_theme_update", ...snapshot }),
    });
    app.use(express.json());
    installMatchRoutes(app, () => match);
    installRosterThemeRoutes(app, () => themes);
    app.use(express.static(path.join(__dirname, "../public")));
    wss.on("connection", (socket) =>
      socket.send(
        JSON.stringify({
          type: "init",
          data: {
            "tournament-title": "MLBB Test League",
            "sponsor-name": "Fixture partner",
          },
        }),
      ),
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
      viewport: { width: 1440, height: 1000 },
    });
    const fixtureRoute = (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (/\/Assets\//i.test(url.pathname))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: /player/.test(url.pathname)
            ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800"><circle cx="200" cy="190" r="95" fill="#8b9eaf"/><path d="M45 800V430Q45 315 200 315Q355 315 355 430V800Z" fill="#536b80"/></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5L94 30V75L50 98L6 75V30Z" fill="#65c9d2"/></svg>',
        });
      return route.continue();
    };
    await context.route("**/*", fixtureRoute);
    const base = `http://127.0.0.1:${server.address().port}`,
      errors = [];
    const page = async (url) => {
      const p = await context.newPage();
      p.on("pageerror", (error) => errors.push(error.message));
      await p.goto(base + url);
      return p;
    };
    const classic = await page("/overlay-display.html"),
      arena = await page("/overlay-display-v2.html"),
      active = await page("/broadcast-overlay.html");
    for (const p of [classic, arena, active]) {
      try {
        await p.waitForFunction(
          () =>
            document.body.dataset.rosterReady === "true" &&
            document.querySelector(".player-slide.active"),
          null,
          { timeout: 10000 },
        );
      } catch (error) {
        console.log(
          "Roster diagnostics",
          p.url(),
          await p.evaluate(() => ({
            theme: document.body.dataset,
            ready: typeof RosterOverlay,
            slides: document.querySelectorAll(".player-slide").length,
            styles: [...document.querySelectorAll("link")].map((l) => ({
              href: l.href,
              media: l.media,
              loaded: Boolean(l.sheet),
            })),
          })),
          errors,
        );
        throw error;
      }
    }
    assert.equal(
      await classic.locator("body").getAttribute("data-roster-theme"),
      "classic",
    );
    assert.equal(
      await arena.locator("body").getAttribute("data-roster-theme"),
      "arena",
    );
    assert.equal(
      await active.locator("#tournament-title").innerText(),
      "MLBB Test League",
    );
    assert.equal(
      await active.locator("#team1-logo").getAttribute("data-source"),
      "/Assets/team-a.png",
    );
    assert.equal(
      await active.locator(".player-name-text").first().textContent(),
      data.teamdata.blueteam.playerlist[0].name,
    );
    const admin = await page("/broadcast-themes.html"),
      stale = await page("/broadcast-themes.html");
    await admin.waitForFunction(
      () => document.getElementById("active-theme").textContent === "Classic",
    );
    await stale.waitForFunction(
      () => document.getElementById("active-theme").textContent === "Classic",
    );
    await stale.locator('[data-theme-id="arena"]').click();
    await stale.waitForFunction(
      () => !document.getElementById("activate-theme").disabled,
    );
    await admin.locator('[data-theme-id="studio"]').click();
    await admin.waitForFunction(
      () => !document.getElementById("activate-theme").disabled,
    );
    assert.equal(themes.snapshot().data.themeId, "classic");
    await active.waitForFunction(() => RosterOverlay.state().index === 1);
    await active.evaluate(() => {
      window.originalRosterSlide = document.querySelector(
        ".player-slide.active",
      );
    });
    await admin.locator("#activate-theme").click();
    await active.waitForFunction(
      () => document.body.dataset.rosterTheme === "studio",
    );
    assert.equal(await active.evaluate(() => RosterOverlay.state().index), 1);
    assert.equal(
      await active.evaluate(() => window.originalRosterSlide.isConnected),
      true,
    );
    assert.equal(
      await classic.locator("body").getAttribute("data-roster-theme"),
      "classic",
    );
    assert.equal(
      await arena.locator("body").getAttribute("data-roster-theme"),
      "arena",
    );
    assert.deepEqual(match.snapshot().data, data);
    await stale.locator("#activate-theme").click();
    await stale.waitForFunction(
      () => document.getElementById("theme-status").dataset.error === "true",
    );
    assert.equal(themes.snapshot().data.themeId, "studio");
    await admin.locator("#previous-theme").click();
    await admin.waitForFunction(
      () => !document.getElementById("activate-theme").disabled,
    );
    await admin.locator("#activate-theme").click();
    await active.waitForFunction(
      () => document.body.dataset.rosterTheme === "classic",
    );
    // CSS failure retains the loaded look, then reconnect retries the persisted selection.
    const faultContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await faultContext.route("**/*", fixtureRoute);
    const fault = await faultContext.newPage();
    fault.on("pageerror", (error) => errors.push(error.message));
    await fault.route("**/themes/roster-studio.css", (route) => route.abort());
    await fault.goto(base + "/broadcast-overlay.html");
    await fault.waitForFunction(
      () => document.body.dataset.rosterReady === "true",
    );
    await themes.select("studio", themes.snapshot().revision);
    await fault.waitForFunction(
      () => Boolean(document.body.dataset.rosterError),
      null,
      { timeout: 10000 },
    );
    assert.equal(
      await fault.locator("body").getAttribute("data-roster-theme"),
      "classic",
    );
    await fault.unroute("**/themes/roster-studio.css");
    for (const socket of wss.clients) socket.close();
    await fault.waitForFunction(
      () => document.body.dataset.rosterTheme === "studio",
    );
    await active.waitForFunction(
      () => document.body.dataset.rosterTheme === "studio",
    );
    // Same-length image URL changes must rebuild the relevant roster content.
    await match.patch([
      {
        path: ["teamdata", "blueteam", "playerlist", "0", "image"],
        previous: { exists: true, value: "/Assets/player/a.png" },
        value: "/Assets/player/b.png",
      },
    ]);
    await active.waitForFunction(() =>
      Boolean(document.querySelector('img[src$="/Assets/player/b.png"]')),
    );
    await match.patch([
      {
        path: ["teamdata", "blueteam", "score"],
        previous: state.at(match.snapshot().data, [
          "teamdata",
          "blueteam",
          "score",
        ]),
        value: 4,
      },
    ]);
    await active.waitForFunction(
      () => document.getElementById("blue-score").textContent === "4",
    );
    assert.equal(
      await active.locator("body").getAttribute("data-roster-theme"),
      "studio",
    );
    const stage = await active.locator("#stage").boundingBox();
    assert.ok(stage.width <= 1441 && stage.height <= 1001);
    // Preserve legacy default-title behavior for empty branding values.
  broadcast({ type: "update", data: { "tournament-title": "" } });
  await active.waitForFunction(() => document.getElementById("tournament-title").textContent === "MLBB");
  broadcast({ type: "update", data: { "tournament-title": "MLBB Test League" } });
  // Metadata updates render as text and do not require a match write.
    broadcast({ type: "update", data: { "sponsor-name": "Partner <name>" } });
    await active.waitForFunction(
      () =>
        document.getElementById("sponsor-name").textContent ===
        "Partner <name>",
    );
    assert.equal(
      await active
        .locator("#sponsor-name")
        .evaluate((el) => el.childElementCount),
      0,
    );
    await admin.locator("#reload-settings").click();
    await admin.waitForFunction(() =>
      document
        .getElementById("theme-status")
        .textContent.startsWith("Preview ready"),
    );
    // Capture reproducible fixtures for visual review, not production branding approval.
    if (process.env.MLBB_CAPTURE_DIR) {
      const fs = require("node:fs/promises");
      await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
      await active.screenshot({
        path: path.join(process.env.MLBB_CAPTURE_DIR, "studio-roster.png"),
      });
      await admin.screenshot({
        path: path.join(process.env.MLBB_CAPTURE_DIR, "theme-control.png"),
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
  },
);
