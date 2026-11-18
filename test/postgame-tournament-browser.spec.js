"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
test(
  "postgame frame leaves the capture window transparent and follows live teams and colors",
  { timeout: 25000 },
  async (t) => {
    const app = express(),
      server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const wss = new WebSocketServer({ server }),
      writes = [];
    let data = require("./fixtures").fixture();
    data.winmatches = "blue";
    data.matchFormat = 5;
    data.teamdata.blueteam.score = "1";
    data.teamdata.redteam.score = "0";
    data.teamdata.blueteam.teamname = "BLUE TITANS";
    data.teamdata.redteam.teamname = "RED PHOENIX";
    const {
      createColorStore,
      installColorRoutes,
    } = require("../lib/broadcast-colors");
    const store = createColorStore({
      file: "/tmp/pg-colors-test.json",
      persist: async () => {},
    });
    app.use(express.json());
    installColorRoutes(app, () => store);
    app.get("/api/matchdata", (q, s) => s.json(data));
    app.use(express.static(path.join(__dirname, "../public")));
    wss.on("connection", (s) =>
      s.on("message", (raw) => writes.push(String(raw))),
    );
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
    const base = "http://127.0.0.1:" + server.address().port;
    await page.goto(base + "/postgame-tournament.html");
    await page.waitForFunction(
      () => document.getElementById("postgameStage").dataset.ready === "true",
    );
    assert.equal(
      await page.locator("#pgBlueName").textContent(),
      "BLUE TITANS",
    );
    assert.equal(await page.locator("#pgRedResult").textContent(), "DEFEAT");
    assert.equal(
      await page.locator("#pgRed").evaluate((e) => getComputedStyle(e).filter),
      "grayscale(1)",
    );
    assert.deepEqual(await page.locator("#resultsWindow").boundingBox(), {
      x: 260,
      y: 220,
      width: 1600,
      height: 800,
    });
    for (const selector of ["body", "#postgameStage", "#resultsWindow"])
      assert.equal(
        await page
          .locator(selector)
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        "rgba(0, 0, 0, 0)",
      );
    const overlaps = await page.locator("#postgameStage > *").evaluateAll(
      (nodes) =>
        nodes
          .filter((e) => e.id !== "resultsWindow")
          .filter((e) => {
            const b = e.getBoundingClientRect();
            return (
              b.left < 1858 && b.right > 262 && b.top < 1018 && b.bottom > 222
            );
          }).length,
    );
    assert.equal(overlaps, 0, "no opaque sibling covers the capture window");
    const send = (m) => {
      for (const s of wss.clients) s.send(JSON.stringify(m));
    };
    data.winmatches = "red";
    data.game_number = 3;
    data.teamdata.redteam.score = "2";
    data.teamdata.redteam.teamname = "<b>CHAMPIONS</b>";
    send({ type: "matchdata_update", data });
    send({
      type: "update",
      data: { "tournament-title": "LCUAA CHAMPIONSHIP" },
    });
    await page.waitForFunction(
      () => document.getElementById("pgGame").textContent === "GAME 3",
    );
    assert.equal(await page.locator("#pgRedName b").count(), 0);
    assert.equal(await page.locator("#pgRedResult").textContent(), "VICTORY");
    assert.equal(await page.locator(".pg-line-score").count(), 0);
    const blueMarkBox=await page.locator("#pgBlueMarks").boundingBox(), blueLabelBox=await page.locator("#pgBlueResult").boundingBox();
    const redMarkBox=await page.locator("#pgRedMarks").boundingBox(),redLabelBox=await page.locator("#pgRedResult").boundingBox();
    assert.ok(blueMarkBox.x+blueMarkBox.width<blueLabelBox.x,"left bars precede result text");
    assert.ok(redLabelBox.x+redLabelBox.width<redMarkBox.x,"right bars follow result text");
    assert.equal(
      await page
        .locator("#pgBlueMarks")
        .evaluate((e) => getComputedStyle(e).order),
      "1",
    );
    assert.equal(
      await page
        .locator("#pgRedMarks")
        .evaluate((e) => getComputedStyle(e).order),
      "2",
    );
    assert.equal(
      await page
        .locator("#pgBlue")
        .evaluate((e) => getComputedStyle(e).opacity),
      "1",
    );
    assert.equal(
      await page
        .locator("#pgBlueMarks .pg-win-mark")
        .first()
        .evaluate((e) => getComputedStyle(e).borderLeftWidth),
      "0px",
    );
    assert.equal(
      await page
        .locator("#pgBlueMarks .pg-win-mark")
        .first()
        .evaluate((e) => getComputedStyle(e).opacity),
      "1",
    );

    assert.equal(await page.locator("#pgBlueMarks .pg-win-mark").count(), 3);
    assert.equal(await page.locator("#pgBlueMarks .is-won").count(), 1);
    assert.equal(
      await page
        .locator("#pgBlueMarks .pg-win-mark:not(.is-won)")
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(133, 136, 143)",
    );
    assert.equal(await page.locator("#pgRedMarks .is-won").count(), 2);
    const firstRedMark=await page.locator("#pgRedMarks .pg-win-mark").first().boundingBox();
    const lastRedMark=await page.locator("#pgRedMarks .pg-win-mark").last().boundingBox();
    assert.ok(firstRedMark.x>lastRedMark.x,"red wins fill from the far right toward the label");
    assert.equal(await page.locator("#pgBlueResult").textContent(), "DEFEAT");
    for (const [format, slots] of [
      [1, 1],
      [3, 2],
      [5, 3],
      [7, 4],
    ]) {
      data.matchFormat = format;
      data.teamdata.blueteam.score = "0";
      data.teamdata.redteam.score = "1";
      send({ type: "matchdata_update", data });
      await page.waitForFunction(
        (slots) =>
          document.querySelectorAll("#pgBlueMarks .pg-win-mark").length ===
            slots &&
          document.querySelectorAll("#pgBlueMarks .is-won").length === 0,
        slots,
      );
      assert.equal(await page.locator("#pgRedMarks .is-won").count(), 1);
    }
    await page.screenshot({
      path: "/tmp/postgame-tournament.png",
      omitBackground: true,
    });
    const control = await browser.newPage();
    await control.goto(base + "/postgame-tournament-control.html");
    await control.waitForFunction(
      () => !document.getElementById("save").disabled,
    );
    await control.locator("#color-left").evaluate((e) => {
      e.value = "#11cc44";
      e.dispatchEvent(new Event("input"));
    });
    await control.click("#save");
    await control.waitForFunction(
      () =>
        document.getElementById("status").textContent ===
        "Saved — OBS updated.",
    );
    assert.equal(store.snapshot().data.palettes.arena.postgame.left, "#11cc44");
    assert.equal(store.snapshot().data.palettes.arena.matchwinner, undefined);
    send({ type: "broadcast_colors_update", data: store.snapshot().data });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.body).getPropertyValue("--mw-left").trim() ===
        "#11cc44",
    );
    await page.setViewportSize({ width: 960, height: 540 });
    await page.waitForFunction(
      () =>
        document.getElementById("postgameStage").getBoundingClientRect()
          .width === 960,
    );
    assert.deepEqual(await page.locator("#resultsWindow").boundingBox(), {
      x: 130,
      y: 110,
      width: 800,
      height: 400,
    });
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
  },
);
