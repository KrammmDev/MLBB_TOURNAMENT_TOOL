"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  http = require("node:http"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const { fixture } = require("./fixtures"),
  { createMatchStore } = require("../lib/match-store"),
  { installMatchRoutes } = require("../lib/match-routes"),
  { installNotificationRoutes } = require("../lib/notifications");
const audioFixture =
  "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";
test(
  "general audio WebMs remain visible without user activation, retain permitted audio and report bad files",
  { timeout: 40000 },
  async (t) => {
    const app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const data = fixture(),
      store = createMatchStore({ initial: data, persist: async () => {} });
    const broadcast = (cue) => {
      for (const socket of wss.clients) socket.send(JSON.stringify(cue));
    };
    app.use(express.json());
    installMatchRoutes(app, () => store);
    installNotificationRoutes(app, {
      getMatch: () => store.snapshot().data,
      broadcast,
    });
    const fallback = Buffer.from(audioFixture, "base64");
    const turtle = process.env.MLBB_TEST_TURTLE_WEBM
      ? await fs.readFile(process.env.MLBB_TEST_TURTLE_WEBM)
      : fallback;
    const lord = process.env.MLBB_TEST_LORD_WEBM
      ? await fs.readFile(process.env.MLBB_TEST_LORD_WEBM)
      : fallback;
    let badVideo = false;
    app.get("/Assets/notification/:file", (req, res) => {
      res.set("Cache-Control", "no-store");
      if (badVideo) return res.status(404).end();
      res
        .type("video/webm")
        .send(req.params.file === "lordspawnn.webm" ? lord : turtle);
    });
    app.use(express.static(path.join(__dirname, "../public")));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
      args: ["--autoplay-policy=document-user-activation-required"],
    });
    t.after(async () => {
      await browser.close();
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    await context.addInitScript(() => {
      window.playFailures = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        const pending = play.apply(this, args);
        pending?.catch((error) => window.playFailures.push(error.name));
        return pending;
      };
    });
    const base = `http://127.0.0.1:${server.address().port}`,
      pages = [],
      sessions = [],
      errors = [];
    for (const url of ["/notifdisplay.html", "/scoreboard.html?theme=arena"]) {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base + url);
      pages.push(page);
      sessions.push(await context.newCDPSession(page));
    }
    // Read via CDP without granting a user gesture; regular page.evaluate can mask autoplay bugs.
    const state = async (session) => {
      const result = await session.send("Runtime.evaluate", {
        userGesture: false,
        returnByValue: true,
        expression: `(() => {
      const stage = document.getElementById('notification-stage'), video = document.getElementById('videoPlayer');
      return { ...stage.dataset, paused: video.paused, time: video.currentTime, muted: video.muted,
        display: video.style.display, failures: window.playFailures, activated: navigator.userActivation.hasBeenActive };
    })()`,
      });
      return result.result.value;
    };
    async function until(check) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const value = await check();
        if (value) return value;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      throw Error("Timed out waiting for notification playback");
    }
    await until(() => wss.clients.size === 2);
    async function send(videoId) {
      const response = await fetch(base + "/api/notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      assert.equal(response.status, 200);
    }
    for (const videoId of ["videoPlayer1", "videoPlayer4"]) {
      await send(videoId);
      await until(async () => {
        const values = await Promise.all(sessions.map(state));
        return (
          values.every(
            (value) =>
              value.notificationVideoId === videoId &&
              value.notificationState === "playing-muted" &&
              !value.paused &&
              value.time > 0,
          ) && values
        );
      });
      for (const session of sessions) {
        const value = await state(session);
        assert.equal(value.activated, false);
        assert.equal(value.display, "block");
        assert.equal(value.muted, true);
        assert.ok(
          value.failures.includes("NotAllowedError"),
          "real audio autoplay refusal is handled, not silently hidden",
        );
      }
    }
    // A trusted interaction enables normal audio on subsequent cues in that source.
    await pages[1].mouse.click(800, 220);
    await send("videoPlayer1");
    await until(async () => {
      const value = await state(sessions[1]);
      return (
        value.notificationVideoId === "videoPlayer1" &&
        value.notificationState === "playing" &&
        !value.muted &&
        value.time > 0
      );
    });
    assert.equal((await state(sessions[1])).activated, true);
    badVideo = true;
    await send("videoPlayer5");
    await until(async () =>
      (await Promise.all(sessions.map(state))).every(
        (value) => value.notificationState === "error",
      ),
    );
    for (const session of sessions) {
      const value = await state(session);
      assert.equal(value.display, "none");
      assert.equal(value.notificationVideoId, "videoPlayer5");
      assert.ok(
        value.notificationError.includes("bluelordslain.webm"),
        "missing/unsupported files leave inspectable diagnostics",
      );
    }
    assert.deepEqual(store.snapshot().data, data);
    assert.deepEqual(errors, []);
  },
);
