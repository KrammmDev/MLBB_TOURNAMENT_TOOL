"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const path = require("node:path"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  http = require("node:http");
const express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const { fixture } = require("./fixtures");
const { createMatchStore } = require("../lib/match-store");
const { installMatchRoutes } = require("../lib/match-routes");
const {
  createRosterThemeStore,
  installRosterThemeRoutes,
} = require("../lib/roster-theme-store");
const {
  loadSponsorStore,
  installSponsorRoutes,
} = require("../lib/broadcast-sponsors");
test(
  "Studio sponsor controls upload, rotate, reorder, disable, recover and retain draft identity",
  { timeout: 60000 },
  async (t) => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "sponsor-browser-"),
    );
    const app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const broadcast = (message) => {
      for (const socket of wss.clients) socket.send(JSON.stringify(message));
    };
    const data = fixture();
    data.teamdata.blueteam.teamname = "NORTH";
    data.teamdata.redteam.teamname = "SOUTH";
    data.teamdata.blueteam.coach = "Coach North";
    data.teamdata.redteam.coach = "Coach South";
    data.teamdata.blueteam.logo = "Assets/Team/north.png";
    data.teamdata.redteam.logo = "Assets/Team/south.png";
    data.matchFormat = 7;
    data.matchInfo = { match: "GRAND FINALS", game: "GAME 3" };
    const match = createMatchStore({ initial: data, persist: async () => {} });
    const themes = createRosterThemeStore({
      initial: { schemaVersion: 1, themeId: "studio", previousThemeId: null },
      persist: async () => {},
    });
    const sponsorFile = path.join(directory, "sponsors.json");
    const sponsors = await loadSponsorStore({
      file: sponsorFile,
      onCommit: (s) => broadcast({ type: "broadcast_sponsors_update", ...s }),
    });
    const blank = () => ({
      pick: Array.from({ length: 5 }, () => ({})),
      ban: Array.from({ length: 5 }, () => ({})),
    });
    const draft = {
      current_phase: 0,
      timer: "34",
      timer_running: false,
      blueside: blank(),
      redside: blank(),
    };
    const heroes = [{ name: "Alpha", img: "Assets/HeroPick/Alpha.png" }];
    for (const side of ["blueside", "redside"])
      for (const pick of draft[side].pick) pick.hero = heroes[0].img;
    app.use(express.json());
    installMatchRoutes(app, () => match);
    installRosterThemeRoutes(app, () => themes);
    installSponsorRoutes(app, () => sponsors, path.join(directory, "logos"));
    app.get("/api/matchdraft", (req, res) => res.json({ draftdata: draft }));
    app.get("/database/herolist.json", (req, res) => res.json(heroes));
    app.get("/api/herostats", (req, res) => res.json({ heroes: {} }));
    app.use(express.static(path.join(__dirname, "../public")));
    server.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
    });
    t.after(async () => {
      await browser.close();
      for (const socket of wss.clients) socket.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      await fs.rm(directory, { recursive: true, force: true });
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 810 },
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (url.pathname.includes("/Assets/")) {
        if (url.pathname.includes("/Other/")) return route.abort();
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 250"><rect width="150" height="250" fill="#294d65"/><circle cx="75" cy="70" r="45" fill="#819eac"/><path d="M10 250V175Q10 110 75 110Q140 110 140 175V250" fill="#456b7d"/></svg>',
        });
      }
      return route.continue();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const admin = await context.newPage(),
      studio = await context.newPage(),
      other = await context.newPage();
    const errors = [];
    for (const page of [admin, studio, other])
      page.on("pageerror", (error) => errors.push(error.message));
    await admin.goto(base + "/broadcast-themes.html");
    await studio.goto(base + "/draft-display.html?theme=studio");
    await studio.waitForFunction(
      () =>
        document.body.dataset.draftReady === "true" &&
        document.getElementById("timer").textContent === "34",
    );
    await admin.waitForFunction(
      () => !document.getElementById("sponsor-add").disabled,
    );
    await admin.locator("#sponsor-preview").click();
    await admin.waitForFunction(() =>
      document
        .getElementById("theme-status")
        .textContent.startsWith("Preview ready"),
    );
    assert.equal(themes.snapshot().data.themeId, "studio");
    const identity = JSON.stringify({ match: match.snapshot(), draft });
    await studio
      .locator("#image-display-1")
      .evaluate((el) => (window.heroIdentity = el));
    assert.equal(await studio.locator(".broadcast-sponsors img").count(), 0);
    assert.equal(
      await studio
        .locator(".broadcast-sponsors")
        .evaluate((el) => Math.round(el.getBoundingClientRect().height)),
      51,
    );
    assert.equal(
      await studio.locator("#match-display").textContent(),
      "GRAND FINALS · GAME 3",
    );
    assert.doesNotMatch(
      await studio.locator("body").innerText(),
      /BPM|\bMPL\b/,
    );
    await studio.waitForFunction(
      () =>
        document.getElementById("displayImage1").naturalWidth > 0 &&
        document.getElementById("displayImage2").naturalWidth > 0,
    );
    assert.equal(await studio.locator("#blue-score-display .dot").count(), 4);
    const sponsorBox = await studio
      .locator(".broadcast-sponsors")
      .boundingBox();
    const logoBox = await studio.locator("#displayImage1").boundingBox();
    assert.ok(
      logoBox.y > sponsorBox.y + sponsorBox.height,
      "team logo stays below sponsor slot",
    );
    async function logo(name, color) {
      const content = await admin.evaluate((color) => {
        const c = document.createElement("canvas");
        c.width = 240;
        c.height = 80;
        const x = c.getContext("2d");
        x.fillStyle = color;
        x.fillRect(0, 0, 240, 80);
        x.fillStyle = "#121820";
        x.fillRect(20, 20, 40, 40);
        return c.toDataURL().split(",")[1];
      }, color);
      await admin
        .locator("#sponsor-upload")
        .setInputFiles({
          name,
          mimeType: "image/png",
          buffer: Buffer.from(content, "base64"),
        });
      await admin.locator("#sponsor-add").click();
      await admin.waitForFunction(
        () =>
          document.getElementById("sponsor-status").textContent ===
          "Logo uploaded and saved.",
      );
    }
    await logo("First.png", "#82dce5");
    await studio.waitForFunction(
      () =>
        document.querySelector(".broadcast-sponsors img")?.naturalWidth === 240,
    );
    const first = sponsors.snapshot().data.logos[0].id;
    await logo("Second.png", "#ffe294");
    await admin.locator("#sponsor-interval").fill("2");
    await admin.locator("#sponsor-save").click();
    await admin.waitForFunction(
      () =>
        document.getElementById("sponsor-status").textContent ===
        "Sponsor slideshow saved.",
    );
    await studio.waitForFunction(
      (id) =>
        !document.querySelector(".broadcast-sponsors img").src.includes(id),
      first,
      { timeout: 7000 },
    );
    await admin
      .getByRole("button", { name: "Move up Second.png", exact: true })
      .click();
    await admin.locator("#sponsor-save").click();
    await admin.waitForFunction(
      () =>
        document.getElementById("sponsor-status").textContent ===
        "Sponsor slideshow saved.",
    );
    assert.equal(sponsors.snapshot().data.logos[0].name, "Second.png");
    if (process.env.MLBB_CAPTURE_DIR) {
      await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
      await studio.screenshot({
        path: path.join(process.env.MLBB_CAPTURE_DIR, "studio-sponsors.png"),
        omitBackground: true,
      });
      await admin.screenshot({
        path: path.join(process.env.MLBB_CAPTURE_DIR, "sponsor-controls.png"),
        fullPage: true,
      });
    }
    await admin.locator("#sponsor-enabled").uncheck();
    await admin.locator("#sponsor-save").click();
    await studio.waitForFunction(
      () => !document.querySelector(".broadcast-sponsors img"),
    );
    // A stale second operator cannot replace the current sponsor playlist.
    await other.goto(base + "/broadcast-themes.html");
    await other.waitForFunction(
      () => !document.getElementById("sponsor-add").disabled,
    );
    await admin.locator("#sponsor-enabled").check();
    await admin.locator("#sponsor-save").click();
    await studio.waitForFunction(
      () =>
        document.querySelector(".broadcast-sponsors img")?.naturalWidth === 240,
    );
    await other.locator("#sponsor-interval").fill("7");
    await other.locator("#sponsor-save").click();
    await other.waitForFunction(() =>
      document.getElementById("sponsor-status").textContent.includes("changed"),
    );
    assert.equal(await other.locator("#sponsor-interval").inputValue(), "7");
    assert.equal(sponsors.snapshot().data.intervalSeconds, 2);
    await admin
      .getByRole("button", { name: "Remove First.png", exact: true })
      .click();
    await admin.locator("#sponsor-save").click();
    await admin.waitForFunction(
      () =>
        document.getElementById("sponsor-status").textContent ===
        "Sponsor slideshow saved.",
    );
    assert.equal(sponsors.snapshot().data.logos.length, 1);
    assert.equal(
      await studio
        .locator("#image-display-1")
        .evaluate((el) => el === window.heroIdentity),
      true,
    );
    // Recovery must fetch saved sponsor settings without replaying stale edits.
    for (const socket of wss.clients) socket.close();
    await studio.reload();
    await studio.waitForFunction(
      () =>
        document.querySelector(".broadcast-sponsors img")?.naturalWidth === 240,
    );
    assert.equal(await studio.locator("#timer").textContent(), "34");
    assert.equal(identity, JSON.stringify({ match: match.snapshot(), draft }));
    const restored = await loadSponsorStore({ file: sponsorFile });
    assert.deepEqual(restored.snapshot().data, sponsors.snapshot().data);
    assert.deepEqual(errors, []);
  },
);
