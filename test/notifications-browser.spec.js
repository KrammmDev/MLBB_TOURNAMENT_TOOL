"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs/promises"),
  http = require("node:http"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const { fixture } = require("./fixtures");
const { createMatchStore } = require("../lib/match-store");
const { installMatchRoutes } = require("../lib/match-routes");
const { installNotificationRoutes } = require("../lib/notifications");
const videoFixture =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAMSEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggL87AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAl3AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WI9KpZwsQvtGScgQAitZyDdW5kiIEAhoVWX1ZQOYOBASPjg4QF9eEA4JCwgUC6gSSagQJVsIRVuYEBElTDZ0B/c3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS43LjEwM3Nz2mPAi2PFiPSqWcLEL7RkZ8ilRaOHRU5DT0RFUkSHmExhdmM2MS4xOS4xMDEgbGlidnB4LXZwOWfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDEuNTAwMDAwMDAwAB9DtnVBTueBAKOjgQAAgIJJg0IAA/ACNgA4JBwYSgAAMGAAABO///1ZFYAAAACjk4EAZACGAECSnABQAAADIAAAVHCjk4EAyACGAECSnABO4AADIAAAVHCjk4EBLACGAECSnABQAAADIAAAVHCjk4EBkACGAECSnABNQAADIAAAVHCjk4EB9ACGAECSnABQAAADIAAAVHCjk4ECWACGAECSnABO4AADIAAAVHCjk4ECvACGAECSnABQAAADIAAAVHCjk4EDIACGAECSnABKIAADIAAAVHCjk4EDhACGAECSnABQAAADIAAAVHCjk4ED6ACGAMCSnABKIAADIAAAVHCjk4EETACGAECSnABQAAADIAAAVHCjk4EEsACGAECSnABNQAADIAAAVHCjk4EFFACGAECSnABQAAADIAAAVHCjk4EFeACGAECSnABO4AADIAAAVHAcU7trkbuPs4EAt4r3gQHxggGo8IED";
test(
  "individual notification controls extend general cues, bind player identity and recover without replay",
  { timeout: 90000 },
  async (t) => {
    const initial = fixture();
    initial.matchInfo = { match: "Grand Finals", game: "Game 3" };
    for (const [side, team] of Object.entries(initial.teamdata))
      team.playerlist.forEach(
        (player, index) =>
          (player.name = `${side === "blueteam" ? "North" : "South"} ${index + 1}`),
      );
    initial.teamdata.blueteam.logo = "Assets/Team/blue.png";
    initial.teamdata.redteam.logo = "Assets/Team/red.png";
    initial.teamdata.blueteam.playerlist[0].image = "player/north-photo.png";
    const app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server }),
      cues = [],
      writes = [];
    const broadcast = (message) => {
      for (const client of wss.clients) client.send(JSON.stringify(message));
    };
    const store = createMatchStore({
      initial,
      persist: async () => {},
      onCommit: (snapshot) =>
        broadcast({ type: "matchdata_update", ...snapshot }),
    });
    let failNotification = false,
      missingArtwork = false,
      videoRequests = 0;
    let draft = {
      draftdata: {
        timer: "50",
        timer_running: false,
        current_phase: 0,
        blueside: {
          pick: Array.from({ length: 5 }, () => ({})),
          ban: Array.from({ length: 5 }, () => ({})),
        },
        redside: {
          pick: Array.from({ length: 5 }, () => ({})),
          ban: Array.from({ length: 5 }, () => ({})),
        },
      },
    };
    app.use(express.json());
    app.use((req, res, next) => {
      if (["POST", "PATCH", "PUT"].includes(req.method)) writes.push(req.path);
      if (req.path === "/api/notification" && failNotification)
        return res
          .status(503)
          .json({ message: "Notification service unavailable" });
      next();
    });
    installMatchRoutes(app, () => store);
    installNotificationRoutes(app, {
      getMatch: () => store.snapshot().data,
      broadcast: (cue) => {
        cues.push(cue);
        broadcast(cue);
      },
    });
    app.get("/api/players", (req, res) => res.json([]));
    app.get("/api/items", (req, res) => res.json([]));
    app.get("/api/mvp", (req, res) => res.json({ mvp: null }));
    app.get("/api/matchdraft", (req, res) => res.json(draft));
    app.post("/api/matchdraft", (req, res) => {
      draft = req.body;
      res.json({ message: "saved" });
    });
    app.use(express.static(path.join(__dirname, "../public")));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
      args: ["--autoplay-policy=no-user-gesture-required"],
    });
    t.after(async () => {
      await browser.close();
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    });
    const video = process.env.MLBB_TEST_NOTIFICATION_WEBM
      ? await fs.readFile(process.env.MLBB_TEST_NOTIFICATION_WEBM)
      : Buffer.from(videoFixture, "base64");
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (url.pathname.startsWith("/Assets/notification/")) {
        videoRequests++;
        return route.fulfill({ contentType: "video/webm", body: video });
      }
      if (url.pathname.startsWith("/Assets/player/")) {
        if (missingArtwork || url.pathname !== "/Assets/player/north-photo.png")
          return route.fulfill({ status: 404, body: "missing photo" });
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="400"><path d="M55 400V245Q65 205 100 205h80q35 0 45 40v155" fill="#e7edf5"/><path d="M100 205l40 40 40-40" fill="#97233d"/><ellipse cx="140" cy="140" rx="48" ry="62" fill="#c89573"/><path d="M92 127q-5-85 65-65 40 5 31 65l-30-24z" fill="#171e29"/><path d="M90 305l100 40M190 305L90 345" stroke="#c89573" stroke-width="25"/><path d="M118 265h44v35h-44" fill="#143b62"/></svg>',
        });
      }
      if (url.pathname.startsWith("/Assets/Team/")) {
        if (missingArtwork)
          return route.fulfill({ status: 404, body: "missing team logo" });
        const red = url.pathname.endsWith("red.png");
        return route.fulfill({
          contentType: "image/svg+xml",
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="180"><path d="M15 10h130v110l-65 50-65-50z" fill="${red ? "#ba304b" : "#2579a0"}" stroke="#fff" stroke-width="5"/><text x="80" y="107" text-anchor="middle" fill="#fff" font-size="65" font-family="Arial">${red ? "S" : "N"}</text></svg>`,
        });
      }
      if (url.pathname.includes("/Assets/Font/")) return route.continue();
      if (url.pathname.startsWith("/Assets/"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#28556c"/></svg>',
        });
      return route.continue();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const normal = await context.newPage(),
      six = await context.newPage(),
      overlay = await context.newPage(),
      errors = [];
    for (const page of [normal, six, overlay])
      page.on("pageerror", (error) => errors.push(error.message));
    await Promise.all([
      normal.goto(base + "/control.html"),
      six.goto(base + "/controlban6.html"),
      overlay.goto(base + "/notifdisplay.html"),
    ]);
    await overlay.bringToFront();
    for (const page of [normal, six]) {
      await page.waitForFunction(
        () =>
          document.querySelectorAll(".player-notif-card").length === 10 &&
          window.ControlMatch?.get(),
      );
      assert.equal(await page.locator(".player-notif-event").count(), 100);
      const playerPanel = await page
        .locator("#player-notifications")
        .boundingBox();
      const consolePanel = await page.locator(".content-wrapper").boundingBox();
      assert.ok(
        playerPanel.width > 1200 &&
          playerPanel.y >= consolePanel.y + consolePanel.height,
        "desktop player controls use the full width below the existing console",
      );
      assert.ok(
        (await page.locator(".player-notif-event").first().boundingBox())
          .width >= 90,
        "event labels have practical operating width",
      );
      assert.equal(
        await page.locator(".notif-kill-buttons button").count(),
        6,
        "general kill buttons remain",
      );
      assert.equal(
        await page.locator(".notif-objective-column button").count(),
        6,
        "general objective buttons remain",
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".player-notif-event")].every(
          (button) => !button.disabled,
        ),
      );
    }
    const button = (page, side, index, event) =>
      page.locator(
        `.player-notif-card[data-side="${side}"][data-player-index="${index}"] [data-event-id="${event}"]`,
      );
    async function send(page, side, index, event) {
      const response = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/notification") &&
          response.request().method() === "POST",
      );
      await button(page, side, index, event).click();
      return response;
    }
    // Actual legacy video still plays without adding player attribution.
    await normal.locator(".notif-kill-buttons button").first().click();
    await overlay.waitForFunction(
      () =>
        !document.getElementById("videoPlayer").paused &&
        document.getElementById("videoPlayer").currentTime > 0,
    );
    assert.equal(
      await overlay.locator("#player-notification").isHidden(),
      true,
    );
    assert.equal(cues.at(-1).videoId, "videoPlayer7");
    await overlay.waitForFunction(
      () => document.getElementById("videoPlayer").style.display === "none",
    );
    const generalVideoRequests = videoRequests;
    assert.equal((await send(normal, "blue", 0, "first-blood")).status(), 200);
    await overlay.waitForFunction(
      () =>
        document.getElementById("notification-player").textContent ===
          "North 1" && !document.getElementById("player-notification").hidden,
    );
    assert.equal(
      await overlay.locator("#notification-team").textContent(),
      "BLUE",
    );
    await overlay.waitForFunction(
      () =>
        document.getElementById("player-notification").dataset.artwork ===
        "player",
    );
    assert.equal(
      await overlay.locator("#videoPlayer").isVisible(),
      false,
      "individual cues never show a WebM",
    );
    assert.equal(
      videoRequests,
      generalVideoRequests,
      "individual cues never request a WebM",
    );
    assert.match(
      await overlay.locator("#notification-art img").getAttribute("src"),
      /north-photo.png$/,
    );
    const bannerBounds = await overlay
      .locator("#player-notification")
      .boundingBox();
    const artBounds = await overlay.locator("#notification-art").boundingBox();
    assert.ok(
      bannerBounds.y > 500 && artBounds.y < bannerBounds.y,
      "player cutout extends above a lower-third card",
    );
    assert.ok(
      await overlay.locator("#player-notification").evaluate((banner) =>
        banner.getAnimations().some((animation) => {
          const frames = animation.effect.getKeyframes();
          return (
            frames[0].clipPath?.includes("50%") &&
            frames.at(-1).clipPath?.includes("-6px")
          );
        }),
      ),
      "barn doors reveal the lower-third outward from its center",
    );

    await overlay.bringToFront();
    await overlay.waitForTimeout(700);
    await overlay.evaluate(() => document.fonts.ready);
    assert.equal(
      await overlay.evaluate(
        () =>
          document.fonts.check('40px "Notification Display"') &&
          document.fonts.check('35px "Notification Player"'),
      ),
      true,
      "bundled esports fonts load successfully",
    );
    if (process.env.MLBB_CAPTURE_DIR) {
      await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
      await overlay.screenshot({
        path: path.join(
          process.env.MLBB_CAPTURE_DIR,
          "notification-overlay.png",
        ),
        omitBackground: true,
      });
    }
    await overlay.waitForFunction(() =>
      document
        .getElementById("player-notification")
        .getAnimations()
        .some((animation) => {
          const frames = animation.effect.getKeyframes();
          return (
            frames[0].clipPath?.includes("-6px") &&
            frames.at(-1).clipPath?.includes("50%")
          );
        }),
    );
    await overlay.waitForFunction(
      () => document.getElementById("player-notification").hidden,
    );
    // Both teams use lower-thirds; missing portraits fall back to their own logo.
    assert.equal((await send(six, "red", 4, "lord-slain")).status(), 200);
    await overlay.waitForFunction(
      () =>
        document.getElementById("notification-player").textContent ===
        "South 5",
    );
    assert.equal(cues.at(-1).videoId, null);
    await overlay.waitForFunction(
      () =>
        document.getElementById("player-notification").dataset.artwork ===
        "team",
    );
    assert.match(
      await overlay.locator("#notification-art img").getAttribute("src"),
      /Team\/red.png$/,
    );
    if (process.env.MLBB_CAPTURE_DIR)
      await overlay.screenshot({
        path: path.join(
          process.env.MLBB_CAPTURE_DIR,
          "notification-team-fallback.png",
        ),
        omitBackground: true,
      });
    assert.equal(
      await overlay.locator("#player-notification").getAttribute("data-side"),
      "red",
    );
    // Repeated player events and interruption do not leak prior cue timeouts.
    await send(normal, "blue", 2, "shutdown");
    await overlay.waitForFunction(
      () =>
        document.getElementById("notification-event").textContent ===
        "Shutdown",
    );
    assert.equal(await overlay.locator("#videoPlayer").isVisible(), false);
    await overlay.waitForTimeout(1800);
    const previousId = cues.at(-1).id;
    await send(normal, "blue", 2, "killing-spree");
    assert.notEqual(cues.at(-1).id, previousId);
    await overlay.waitForTimeout(2400);
    assert.equal(
      await overlay.locator("#player-notification").isVisible(),
      true,
      "old cue's timer cannot clear the replacement",
    );
    assert.equal(
      await overlay.locator("#notification-event").textContent(),
      "Killing Spree",
    );
    await overlay.waitForFunction(
      () => document.getElementById("player-notification").hidden,
    );
    // Missing photo AND logo still keep the correct text and clear on time.
    missingArtwork = true;
    const noLogo = store.snapshot().data;
    noLogo.teamdata.redteam.logo = "Assets/Team/missing-red.png";
    await store.replace(noLogo);
    await send(six, "red", 1, "double-kill");
    await overlay.waitForFunction(
      () =>
        document.getElementById("notification-player").textContent ===
          "South 2" && !document.getElementById("player-notification").hidden,
    );
    await overlay.waitForTimeout(200);
    assert.equal(
      await overlay.locator("#notification-art img").count(),
      0,
      "failed assets do not leave broken images",
    );
    assert.equal(
      await overlay.locator("#notification-player").textContent(),
      "South 2",
    );
    await overlay.waitForFunction(
      () => document.getElementById("player-notification").hidden,
    );
    missingArtwork = false;
    const restoredLogo = store.snapshot().data;
    restoredLogo.teamdata.redteam.logo = "Assets/Team/red.png";
    await store.replace(restoredLogo);
    // A late portrait from an interrupted cue cannot replace the current team's logo.
    const delayedMatch = store.snapshot().data;
    delayedMatch.teamdata.blueteam.playerlist[0].image =
      "player/delayed-photo.png";
    await store.replace(delayedMatch);
    let releasePhoto, photoRequested;
    const photoStarted = new Promise((resolve) => (photoRequested = resolve));
    const photoRelease = new Promise((resolve) => (releasePhoto = resolve));
    await context.route(
      "**/Assets/player/delayed-photo.png",
      async (route) => {
        photoRequested();
        await photoRelease;
        await route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200"><rect width="100" height="200" fill="red"/></svg>',
        });
      },
      { times: 1 },
    );
    await send(normal, "blue", 0, "shutdown");
    await photoStarted;
    await send(six, "red", 4, "shutdown");
    releasePhoto();
    await overlay.waitForFunction(
      () =>
        document.getElementById("notification-player").textContent ===
          "South 5" &&
        document.getElementById("player-notification").dataset.artwork ===
          "team",
    );
    await overlay.waitForTimeout(200);
    assert.match(
      await overlay.locator("#notification-art img").getAttribute("src"),
      /Team\/red.png$/,
      "late photo cannot overwrite the replacement cue",
    );
    assert.equal(
      videoRequests,
      generalVideoRequests,
      "no player event loads any WebM asset",
    );
    // A server-side lineup change between rendering and send must not misattribute.
    const countBeforeStale = cues.length;
    await normal.route(
      "**/api/notification",
      async (route) => {
        const changed = store.snapshot().data;
        changed.teamdata.blueteam.playerlist[0].name = "Replacement";
        await store.replace(changed);
        await route.continue();
      },
      { times: 1 },
    );
    assert.equal((await send(normal, "blue", 0, "savage")).status(), 409);
    assert.equal(cues.length, countBeforeStale);
    await normal.waitForFunction(
      () =>
        document.getElementById("player-notif-status").dataset.error === "true",
    );
    await normal.locator("h1").click();
    await normal.waitForFunction(() =>
      document
        .querySelector('.player-notif-card[data-side="blue"] h4')
        .textContent.includes("Replacement"),
    );
    // Server failures report an error instead of claiming a successful cue.
    failNotification = true;
    assert.equal((await send(normal, "blue", 0, "savage")).status(), 503);
    assert.equal(cues.length, countBeforeStale);
    failNotification = false;
    // Names remain literal text and side swaps update both control variants.
    const swapped = store.snapshot().data;
    [swapped.teamdata.blueteam, swapped.teamdata.redteam] = [
      swapped.teamdata.redteam,
      swapped.teamdata.blueteam,
    ];
    swapped.teamdata.redteam.playerlist[3].name =
      "<img src=x onerror=alert(1)> Long Player Name";
    await store.replace(swapped);
    await normal.locator("h1").click();
    await six.locator("h1").click();
    for (const page of [normal, six])
      await page.waitForFunction(
        () =>
          document.querySelector('.player-notif-team[data-side="blue"] h3')
            .textContent === "RED",
      );
    await send(six, "red", 3, "shutdown");
    await overlay.waitForFunction(() =>
      document
        .getElementById("notification-player")
        .textContent.startsWith("<img"),
    );
    assert.equal(
      await overlay.locator("#notification-player img").count(),
      0,
      "player names cannot inject markup",
    );
    await overlay.waitForFunction(
      () => document.getElementById("player-notification").hidden,
    );
    // Socket reconnection and page reload do not replay prior ephemeral cues.
    for (const client of wss.clients) client.terminate();
    await overlay.waitForTimeout(1800);
    assert.equal(
      await overlay.locator("#player-notification").isHidden(),
      true,
    );
    await send(normal, "blue", 1, "shutdown");
    await overlay.waitForFunction(
      () =>
        document.getElementById("notification-player").textContent ===
          "South 2" && !document.getElementById("player-notification").hidden,
    );
    await overlay.reload();
    assert.equal(
      await overlay.locator("#player-notification").isHidden(),
      true,
    );
    await normal.setViewportSize({ width: 580, height: 900 });
    await normal.locator("#player-notifications").scrollIntoViewIfNeeded();
    const layout = await normal
      .locator("#player-notifications")
      .evaluate((panel) => ({
        panelWidth: panel.clientWidth,
        teamWidth: panel
          .querySelector(".player-notif-team")
          .getBoundingClientRect().width,
        overflow: panel.scrollWidth > panel.clientWidth + 1,
      }));
    assert.equal(
      layout.overflow,
      false,
      "player controls do not overflow on a small screen",
    );
    assert.ok(layout.teamWidth < 580);
    if (process.env.MLBB_CAPTURE_DIR) {
      await normal.setViewportSize({ width: 1440, height: 1100 });
      await normal.locator("#player-notifications").screenshot({
        path: path.join(process.env.MLBB_CAPTURE_DIR, "player-controls.png"),
      });
    }
    assert.deepEqual(errors, []);
    assert.ok(
      writes.every((path) => path === "/api/notification"),
      "notification actions never write match or draft state",
    );
    assert.equal(
      store.snapshot().data.teamdata.blueteam.playerlist[0].name,
      "South 1",
    );
  },
);
