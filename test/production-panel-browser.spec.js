"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  express = require("express"),
  { chromium } = require("playwright");
const {
  createPanelStore,
  installPanelRoutes,
} = require("../lib/production-panel");
test("control drives independent OBS overlay, colors, ticker, shared sponsors and refresh", async (t) => {
  const app = express(),
    store = createPanelStore({ persist: async () => {} });
  const currentMatch = require("./fixtures").fixture();
  Object.assign(currentMatch.teamdata.blueteam, {
    teamname: "BLUE TEAM",
    score: "2",
    logo: "Assets/Team/blue.png",
  });
  Object.assign(currentMatch.teamdata.redteam, {
    teamname: "RED TEAM",
    score: "1",
    logo: "Assets/Team/red.png",
  });
  app.get("/api/matchdata", (req, res) => res.json(currentMatch));
  app.get("/Assets/Team/:file", (req, res) =>
    res
      .type("svg")
      .send(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="38" fill="cyan"/></svg>',
      ),
  );
  app.use(express.json());
  installPanelRoutes(app, () => store);
  app.get("/api/broadcast-sponsors", (req, res) =>
    res.json({
      data: {
        schemaVersion: 1,
        enabled: true,
        intervalSeconds: 5,
        logos: [
          {
            id: "00000000-0000-0000-0000-000000000001",
            file: "00000000-0000-0000-0000-000000000001.png",
            name: "Partner",
          },
        ],
      },
    }),
  );
  app.get("/broadcast-sponsors/:file", (req, res) =>
    res
      .type("svg")
      .send(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="blue"/></svg>',
      ),
  );
  app.use(express.static(path.join(__dirname, "../public")));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const wss = new (require("ws").WebSocketServer)({ server });
  const browser = await chromium.launch({
    executablePath: process.env.MLBB_TEST_BROWSER || undefined,
    args: ["--no-sandbox"],
  });
  t.after(async () => {
    await browser.close();
    for (const client of wss.clients) client.terminate();
    await new Promise((r) => wss.close(r));
    await new Promise((r) => server.close(r));
  });
  const context = await browser.newContext(),
    errors = [];
  const control = await context.newPage(),
    overlay = await context.newPage();
  for (const page of [control, overlay])
    page.on("pageerror", (e) => errors.push(e.message));
  const base = "http://127.0.0.1:" + server.address().port;
  await control.goto(base + "/production-panel.html");
  await control.waitForFunction(
    () => document.getElementById("status").textContent === "Ready",
  );
  await overlay.goto(base + "/production-timer.html");
  await control.locator("[name=durationSeconds]").fill("30");
  await control.locator("[name=ticker]").fill("LIVE <script> text");
  await control
    .locator("[name=headline]")
    .fill("WHO WILL BE THE NEW CHAMPION?");
  await control.locator("[name=accent]").fill("#ff00ff");
  await control.locator("[name=lowerBackground]").fill("#112233");
  await control.locator("[name=headlineColor]").fill("#ffeedd");
  await control.locator("[name=tickerBackground]").fill("#223344");
  await control.locator("[name=tickerColor]").fill("#aabbcc");
  await control.locator("[name=sponsorBackground]").fill("#ddeeff");

  await control.locator("button[type=submit]").click();
  await control.waitForFunction(
    () => document.getElementById("status").textContent === "Panel saved.",
  );
  await overlay.waitForFunction(
    () =>
      document.getElementById("ticker-text").textContent ===
      "LIVE <script> text",
  );
  assert.equal(await overlay.locator("#ticker-text script").count(), 0);
  assert.equal(await overlay.locator("#timer-value").textContent(), "00:30");
  assert.equal(
    await overlay.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--panel-accent")
        .trim(),
    ),
    "#ff00ff",
  );
  await overlay.locator("#panel-sponsors img").waitFor();
  const areaColors = await overlay.evaluate(() => ({
    lower: getComputedStyle(document.querySelector(".broadcast-panel"))
      .backgroundColor,
    headline: getComputedStyle(document.getElementById("panel-headline")).color,
    tickerBackground: getComputedStyle(document.getElementById("ticker-window"))
      .backgroundColor,
    ticker: getComputedStyle(document.getElementById("ticker-window")).color,
    sponsor: getComputedStyle(document.getElementById("panel-sponsors"))
      .backgroundColor,
    matchWidth: getComputedStyle(document.querySelector(".match-card")).width,
  }));
  assert.deepEqual(areaColors, {
    lower: "rgb(17, 34, 51)",
    headline: "rgb(255, 238, 221)",
    tickerBackground: "rgb(34, 51, 68)",
    ticker: "rgb(170, 187, 204)",
    sponsor: "rgb(221, 238, 255)",
    matchWidth: "560px",
  });

  await overlay.waitForFunction(
    () =>
      document.getElementById("panel-blue-name").textContent === "BLUE TEAM",
  );
  assert.equal(await overlay.locator("#panel-blue-score").textContent(), "2");
  assert.equal(await overlay.locator("#panel-red-score").textContent(), "1");
  assert.equal(
    await overlay.locator("#panel-headline").textContent(),
    "WHO WILL BE THE NEW CHAMPION?",
  );
  assert.ok(
    (await overlay.locator("#panel-blue-logo").getAttribute("src")).endsWith(
      "/Assets/Team/blue.png",
    ),
  );
  const panelBefore = store.snapshot().data;
  currentMatch.teamdata.blueteam.teamname = "UPDATED <b> TEAM";
  currentMatch.teamdata.blueteam.score = "3";
  for (const client of wss.clients)
    client.send(
      JSON.stringify({ type: "matchdata_update", data: currentMatch }),
    );
  await overlay.waitForFunction(
    () => document.getElementById("panel-blue-score").textContent === "3",
  );
  assert.equal(await overlay.locator("#panel-blue-name b").count(), 0);
  assert.deepEqual(store.snapshot().data, panelBefore);

  await control.locator("[data-action=start]").click();
  await control.waitForFunction(
    () => document.getElementById("timer-value").dataset.running === "true",
  );
  await overlay.reload();
  await overlay.waitForFunction(
    () => !document.getElementById("panel-stage").hidden,
  );
  assert.ok(store.snapshot().data.running);
  const timerAnchor = store.snapshot().data.startedAt;
  await control.locator('[data-panel-target="showCurrentMatch"]').click();
  await overlay.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".match-card")).opacity === "0",
  );
  assert.equal(store.snapshot().data.running, true);
  assert.equal(store.snapshot().data.startedAt, timerAnchor);
  assert.equal(store.snapshot().data.showLowerThird, true);
  await overlay.reload();
  await overlay.waitForFunction(
    () => !document.getElementById("panel-stage").hidden,
  );
  assert.equal(
    await overlay.locator(".match-card").getAttribute("aria-hidden"),
    "true",
  );
  await control.locator('[data-panel-target="showCurrentMatch"]').click();
  await overlay.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".match-card")).opacity === "1",
  );
  await control.locator('[data-panel-target="showLowerThird"]').click();
  await overlay.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".broadcast-panel")).opacity ===
      "0",
  );
  assert.equal(store.snapshot().data.showCurrentMatch, true);
  await control.locator('[data-panel-target="showLowerThird"]').click();
  await overlay.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".broadcast-panel")).opacity ===
      "1",
  );

  await control.locator("[data-action=pause]").click();
  await control.waitForFunction(
    () => document.getElementById("status").textContent === "Timer pause.",
  );
  assert.equal(store.snapshot().data.running, false);
  await control.locator("[data-action=reset]").click();
  await control.waitForFunction(
    () => document.getElementById("status").textContent === "Timer reset.",
  );
  await overlay.waitForFunction(
    () => document.getElementById("timer-value").textContent === "00:30",
  );
  await control.waitForFunction(
    () => document.getElementById("timer-value").textContent === "00:30",
  );
  if (process.env.MLBB_CAPTURE_DIR) {
    const fs = require("node:fs/promises");
    await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
    await overlay.setViewportSize({ width: 1920, height: 1080 });
    await overlay.screenshot({
      path: path.join(process.env.MLBB_CAPTURE_DIR, "production-timer.png"),
      omitBackground: true,
    });
    await control.screenshot({
      path: path.join(process.env.MLBB_CAPTURE_DIR, "production-panel.png"),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
});
