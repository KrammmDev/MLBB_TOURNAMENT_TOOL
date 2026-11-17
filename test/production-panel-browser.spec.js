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
  const browser = await chromium.launch({
    executablePath: process.env.MLBB_TEST_BROWSER || undefined,
    args: ["--no-sandbox"],
  });
  t.after(async () => {
    await browser.close();
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
  await control.locator("[name=accent]").fill("#ff00ff");
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
  await control.locator("[data-action=start]").click();
  await control.waitForFunction(
    () => document.getElementById("timer-value").dataset.running === "true",
  );
  await overlay.reload();
  await overlay.waitForFunction(
    () => !document.getElementById("panel-stage").hidden,
  );
  assert.ok(store.snapshot().data.running);
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
