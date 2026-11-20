"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const { fixture } = require("./fixtures"),
  { createMatchStore } = require("../lib/match-store"),
  { installMatchRoutes } = require("../lib/match-routes");
test(
  "legacy postgame outputs use live snapshots, stop file polling and recover on reload",
  { timeout: 30000 },
  async (t) => {
    const app = express(),
      server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const wss = new WebSocketServer({ server });
    const broadcast = (m) => {
      for (const ws of wss.clients) ws.send(JSON.stringify(m));
    };
    const store = createMatchStore({
      initial: fixture(),
      persist: async () => {},
      onCommit: (s) => broadcast({ type: "matchdata_update", ...s }),
    });
    let fileReads = 0;
    app.use(express.json());
    app.use((req, res, next) => {
      if (req.path.endsWith("matchdatateam.json")) fileReads++;
      next();
    });
    installMatchRoutes(app, () => store);
    app.use(express.static(path.join(__dirname, "../public")));
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
    });
    t.after(async () => {
      await browser.close();
      for (const ws of wss.clients) ws.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
    });
    const ctx = await browser.newContext();
    await ctx.route("**/Assets/**", (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
      }),
    );
    const errors = [],
      pages = [];
    for (const name of ["postgame.html", "postgame2.html"]) {
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errors.push(e.stack));
      await p.goto(`http://127.0.0.1:${server.address().port}/${name}`);
      await p.waitForFunction(
        () => document.getElementById("name-box-1").textContent === "BLUE",
      );
      pages.push(p);
    }
    const original = store.snapshot().data;
    await store.patch([
      {
        path: ["teamdata", "blueteam", "teamname"],
        previous: { exists: true, value: original.teamdata.blueteam.teamname },
        value: "LIVE NORTH",
      },
    ]);
    for (const p of pages)
      await p.waitForFunction(
        () =>
          document.getElementById("name-box-1").textContent === "LIVE NORTH",
      );
    await pages[0].waitForTimeout(1600);
    assert.equal(fileReads, 0, "no 500ms match JSON file polling remains");
    await pages[1].reload();
    await pages[1].waitForFunction(
      () => document.getElementById("name-box-1").textContent === "LIVE NORTH",
    );
    assert.deepEqual(errors, []);
  },
);
