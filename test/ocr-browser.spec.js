"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const express = require("express"),
  { chromium } = require("playwright"),
  { WebSocketServer } = require("ws");
const { loadOCRStore, installOCRRoutes } = require("../lib/ocr-store"),
  { fixture } = require("./fixtures"),
  { createEngine } = require("../ocr/engine");
test(
  "native camera calibration → preview → live scoreboard; fallback, expiration and real worker baseline",
  { timeout: 90000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-browser-")),
      app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const data = fixture();
    data.teamdata.blueteam.turtles = 2;
    data.teamdata.redteam.turtles = 1;
    data.matchInfo = {
      stage: "PLAYOFFS",
      group: "DAY 2",
      match: "GRAND FINALS",
      game: "GAME 3",
    };
    let recognized = [],
      requests = [];
    const store = await loadOCRStore({
      file: path.join(directory, "ocr.json"),
      getMatch: () => data,
      engine: {
        recognize: async (bytes) => {
          recognized.push([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]);
          return { rawText: "12", score: 99 };
        },
      },
      onChange: (state) => {
        for (const client of wss.clients)
          client.send(JSON.stringify({ type: "ocr_update", data: state }));
      },
    });
    app.use(express.json({ limit: "20mb" }));
    app.use((req, res, next) => {
      if (req.method !== "GET") requests.push(req.path);
      next();
    });
    installOCRRoutes(app, () => store);
    app.get("/api/matchdata", (req, res) => res.json(data));
    app.use(express.static(path.join(__dirname, "../public")));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
      headless: true,
      args: ["--no-sandbox"],
    });
    t.after(async () => {
      await browser.close();
      await store.close();
      for (const c of wss.clients) c.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      await fs.rm(directory, { recursive: true, force: true });
    });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
    });
    await context.route("**/Assets/**", (route) =>
      route.fulfill({ status: 204 }),
    );
    await context.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({ status: 200, body: "" }),
    );
    await context.route("http://localhost:14337/MLBB.json", (route) =>
      route.fulfill({
        json: {
          killscore1: "7",
          killscore2: "0",
          timer: "05:20",
          gold1: "13.3k",
          gold2: "12.2k",
          turret1: "2",
          turret2: "1",
          lord1: "0",
          lord2: "1",
        },
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
    );
    const panel = await context.newPage(),
      errors = [];
    panel.on("pageerror", (e) => errors.push(e.message));
    await panel.addInitScript(() => {
      // Reproduce Chromium suppressing presentation callbacks while decode continues.
      HTMLVideoElement.prototype.requestVideoFrameCallback = () => 0;
      const camera = document.createElement("canvas");
      camera.width = 1920;
      camera.height = 1080;
      const paint = () => {
        const c = camera.getContext("2d");
        c.fillStyle = "#fff";
        c.fillRect(0, 0, 1920, 1080);
        c.fillStyle = "#000";
        c.font = "bold 40px Arial";
        c.fillText("12", 580, 45);
      };
      paint();
      const stream = camera.captureStream(30),
        track = stream.getVideoTracks()[0];
      window.__captureTrack = track;
      setInterval(paint, 33);
      track.getSettings = () => ({
        deviceId: "obs-test",
        width: 1920,
        height: 1080,
        frameRate: 30,
      });
      Object.defineProperty(navigator, "mediaDevices", {
        value: {
          enumerateDevices: async () => [
            {
              kind: "videoinput",
              label: "OBS Virtual Camera",
              deviceId: "obs-test",
            },
          ],
          getUserMedia: async () => stream,
        },
      });
    });
    await panel.goto(origin + "/ocr-control.html");
    await panel.locator("#connect").click();
    await panel.waitForFunction(() =>
      document
        .querySelector("#capture-info")
        .textContent.includes("native 1920"),
    );
    const bounds = await panel.locator("#preview").boundingBox();
    assert.ok(bounds.width < 1920);
    await panel.mouse.move(
      bounds.x + (580 / 1920) * bounds.width,
      bounds.y + (5 / 1080) * bounds.height,
    );
    await panel.mouse.down();
    await panel.mouse.move(
      bounds.x + (645 / 1920) * bounds.width,
      bounds.y + (55 / 1080) * bounds.height,
    );
    await panel.mouse.up();
    await panel.locator("#save").click();
    await panel.waitForFunction(() =>
      document
        .querySelector("#message")
        .textContent.includes("Calibration saved"),
    );
    const saved = store.settings().data.profile,
      rect = require("../public/script/ocr-model").cropRect(
        saved.regions.blueKills,
        1920,
        1080,
      );
    assert.ok(rect.width >= 64 && rect.width <= 66);
    assert.ok(rect.height >= 49 && rect.height <= 51);
    await panel.locator("#start").click();
    await panel.waitForFunction(
      () =>
        document.querySelector(
          'tr[data-field="blueKills"] [data-key="accepted"]',
        ).textContent === "12",
    );
    assert.equal(store.state().fields.blueKills.value, null);
    assert.deepEqual(recognized[0], [
      rect.width * 2 + 16,
      rect.height * 2 + 16,
    ]);
    await panel.waitForFunction(() => performance.now() > 6000);
    assert.equal(
      await panel.evaluate(() => window.__captureTrack.readyState),
      "live",
    );
    assert.ok(
      (await panel.locator("#capture-info").textContent()) !==
        "Capture disconnected",
    );
    const overlay = await context.newPage();
    overlay.on("pageerror", (e) => errors.push(e.message));
    await overlay.goto(origin + "/scoreboardocr.html");
    await overlay.waitForFunction(
      () => document.querySelector("#homescore-value").textContent === "7",
    );
    assert.equal(await overlay.locator("#timer").textContent(), "05:20");
    assert.equal(await overlay.locator("#blue-turtle-count").textContent(), "2");
    assert.equal(await overlay.locator("#red-turtle-count").textContent(), "1");
    assert.equal(await overlay.locator("#blue-turtle-container img").count(), 0);
    assert.equal(await overlay.locator("#red-turtle-container img").count(), 0);
    // Only numeric Turtle totals are shown, with four evenly spaced stats when enabled.
    await overlay.waitForFunction(() =>
      getComputedStyle(document.querySelector("#blue-turtle-container")).display === "none",
    );
    await panel.locator("#showTurtles").check();
    await overlay.waitForFunction(() =>
      getComputedStyle(document.querySelector(".blue-team .metrics")).gridTemplateColumns.split(" ").length === 4,
    );
    await overlay.waitForFunction(() =>
      getComputedStyle(document.querySelector("#blue-turtle-container")).display === "flex",
    );
    await panel.locator("#showTurtles").uncheck();
    await overlay.waitForFunction(() =>
      getComputedStyle(document.querySelector(".blue-team .metrics")).gridTemplateColumns.split(" ").length === 3,
    );
    await overlay.waitForFunction(() =>
      getComputedStyle(document.querySelector("#blue-turtle-container")).display === "none",
    );
    await panel.locator("#live").click();
    await overlay.waitForFunction(
      () => document.querySelector("#homescore-value").textContent === "12",
    );
    assert.equal(await overlay.locator("#timer").textContent(), "--:--");
    assert.equal(await overlay.locator("#blue-turtle-count").textContent(), "2");
    assert.equal(await overlay.locator("#red-turtle-count").textContent(), "1");
    assert.equal(
      await overlay.locator("#matchinfo-match").textContent(),
      "GRAND FINALS - GAME 3",
    );
    // No data/results mutation routes are used by capture, calibration or display.
    assert.ok(requests.every((p) => p.startsWith("/api/ocr/")));
    assert.equal(data.teamdata.blueteam.score, "0");
    if (process.env.MLBB_OCR_SCREENSHOT)
      await panel.screenshot({
        path: process.env.MLBB_OCR_SCREENSHOT,
        fullPage: true,
      });
    await panel.bringToFront();
    await panel.evaluate(() => {
      const video = document.querySelector("#video"),
        total = video.getVideoPlaybackQuality().totalVideoFrames;
      video.getVideoPlaybackQuality = () => ({ totalVideoFrames: total });
    });
    await panel.waitForFunction(
      () =>
        document.querySelector("#message").textContent.includes("OCR paused"),
      { timeout: 10000 },
    );
    await panel.waitForFunction(
      async () => !(await (await fetch("/api/ocr/state")).json()).active,
    );
    assert.equal(store.state().active, false);
    assert.equal(
      await panel.evaluate(() => window.__captureTrack.readyState),
      "live",
      "a stall pauses OCR without shutting down the camera",
    );
    await overlay.waitForFunction(
      () => document.querySelector("#homescore-value").textContent === "--",
    );
    await panel.evaluate(() => {
      delete document.querySelector("#video").getVideoPlaybackQuality;
    });
    await panel.waitForFunction(() =>
      document
        .querySelector("#message")
        .textContent.includes("Video frames resumed"),
    );
    await panel.locator("#start").click();
    await panel.waitForFunction(
      () =>
        document.querySelector(
          'tr[data-field="blueKills"] [data-key="accepted"]',
        ).textContent === "12",
    );
    await panel.locator("#stop").click();
    await overlay.waitForFunction(
      () => document.querySelector("#homescore-value").textContent === "--",
    );
    await panel.locator("#legacy").click();
    await overlay.waitForFunction(
      () => document.querySelector("#homescore-value").textContent === "7",
    );
    await context.route("http://localhost:14337/MLBB.json", (route) =>
      route.fulfill({
        json: { killscore1: "garbage", timer: "bad" },
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
    );
    await overlay.waitForFunction(
      () => document.querySelector("#homescore-value").textContent === "--",
    );
    assert.equal(await overlay.locator("#timer").textContent(), "--:--");
    // The native PNG passes through the actual local worker as a clean synthetic baseline.
    const samples = await panel.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 260;
      c.height = 90;
      const x = c.getContext("2d");
      x.fillStyle = "white";
      x.fillRect(0, 0, 260, 90);
      const blank = c.toDataURL();
      x.fillStyle = "black";
      x.font = "bold 54px Arial";
      x.fillText("12:34", 12, 65);
      return { blank, text: c.toDataURL() };
    });
    const engine = createEngine();
    try {
      const text = await engine.recognize(
        Buffer.from(samples.text.split(",")[1], "base64"),
      );
      assert.equal(text.rawText, "12:34");
      const blank = await engine.recognize(
        Buffer.from(samples.blank.split(",")[1], "base64"),
      );
      assert.equal(blank.rawText, "");
    } finally {
      await engine.close();
    }
    await panel.locator("#disconnect").click();
    assert.equal(
      await panel.evaluate(() => window.__captureTrack.readyState),
      "ended",
    );
    await panel.setViewportSize({ width: 440, height: 956 });
    assert.equal(
      await panel.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
  },
);
