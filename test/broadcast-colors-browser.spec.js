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
  { installMatchRoutes } = require("../lib/match-routes");
const {
    createRosterThemeStore,
    installRosterThemeRoutes,
  } = require("../lib/roster-theme-store"),
  { loadColorStore, installColorRoutes } = require("../lib/broadcast-colors");
test(
  "color controls isolate previews, save by theme/output, reset, reject conflicts and recover without resetting data",
  { timeout: 120000 },
  async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "color-browser-"));
    const app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const broadcast = (message) => {
      for (const client of wss.clients) client.send(JSON.stringify(message));
    };
    const data = fixture();
    data.teamdata.blueteam.teamname = "NORTH";
    data.teamdata.redteam.teamname = "SOUTH";
    const match = createMatchStore({ initial: data, persist: async () => {} });
    const themes = createRosterThemeStore({
      initial: { schemaVersion: 1, themeId: "arena", previousThemeId: null },
      persist: async () => {},
    });
    const colors = await loadColorStore({
      file: path.join(dir, "colors.json"),
      onCommit: (snapshot) =>
        broadcast({ type: "broadcast_colors_update", ...snapshot }),
    });
    const side = () => ({
      pick: Array.from({ length: 5 }, () => ({})),
      ban: Array.from({ length: 5 }, () => ({})),
    });
    const draft = {
      current_phase: 6,
      timer: "18",
      timer_running: false,
      blueside: side(),
      redside: side(),
    };
    draft.blueside.pick[0] = { hero: "Assets/HeroPick/Alpha.png" };
    const identity = JSON.stringify({
      match: match.snapshot(),
      draft,
      themes: themes.snapshot(),
    });
    const writes = [];
    app.use(express.json());
    app.use((req, res, next) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method))
        writes.push(req.path);
      next();
    });
    installMatchRoutes(app, () => match);
    installRosterThemeRoutes(app, () => themes);
    installColorRoutes(app, () => colors);
    app.get("/api/matchdraft", (req, res) => res.json({ draftdata: draft }));
    app.get("/database/herolist.json", (req, res) =>
      res.json([{ name: "Alpha", img: "Assets/HeroPick/Alpha.png" }]),
    );
    app.get("/api/herostats", (req, res) => res.json({ heroes: {} }));
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
      await fs.rm(dir, { recursive: true, force: true });
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 810 },
      }),
      errors = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (url.pathname.includes("/Assets/"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 250"><rect width="150" height="250" fill="#294d65"/><circle cx="75" cy="70" r="45" fill="#819eac"/></svg>',
        });
      return route.continue();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function page(url) {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base + url);
      return page;
    }
    const admin = await page("/broadcast-themes.html"),
      roster = await page("/broadcast-overlay.html"),
      normal = await page("/draft-display.html"),
      six = await page("/draft-display.html?format=six");
    await admin.waitForFunction(
      () =>
        document.getElementById("color-scope").textContent ===
          "Arena · Roster" &&
        !document.getElementById("color-hex-left").disabled &&
        document
          .getElementById("theme-status")
          .textContent.startsWith("Preview ready"),
    );
    for (const page of [roster, normal, six])
      await page.waitForFunction(
        () =>
          document.body.dataset.rosterReady === "true" ||
          document.body.dataset.draftReady === "true",
      );
    await normal
      .locator("#image-display-1")
      .evaluate((el) => (window.heroIdentity = el));
    const variable = (page, name) =>
      page.evaluate(
        (name) => getComputedStyle(document.body).getPropertyValue(name).trim(),
        name,
      );
    async function waitVariable(page, name, value) {
      await page.waitForFunction(
        ({ name, value }) =>
          getComputedStyle(document.body).getPropertyValue(name).trim() ===
          value,
        { name, value },
      );
    }
    async function previewFrame() {
      return admin.frames().find((frame) => frame !== admin.mainFrame());
    }
    async function choose(id, output) {
      if (output) await admin.locator("#preview-output").selectOption(output);
      await admin.locator(`[data-theme-id="${id}"]`).click();
      await admin.waitForFunction(
        ({ id, output }) =>
          document.getElementById("theme-preview").contentDocument?.body
            ?.dataset[output + "Theme"] === id &&
          document
            .getElementById("theme-status")
            .textContent.startsWith("Preview ready"),
        { id, output: output?.startsWith("draft") ? "draft" : "roster" },
      );
    }
    async function set(field, value) {
      await admin.locator("#color-hex-" + field).fill(value);
    }
    async function save() {
      await admin.locator("#save-colors").click();
      await admin.waitForFunction(() =>
        document
          .getElementById("color-status")
          .textContent.startsWith("Colors saved"),
      );
    }
    await set("left", "#123456");
    let frame = await previewFrame();
    await waitVariable(frame, "--orange", "#123456");
    assert.equal(
      await variable(roster, "--orange"),
      "#ff7200",
      "preview does not change live roster",
    );
    assert.deepEqual(colors.snapshot().data.palettes, {});
    await save();
    await waitVariable(roster, "--orange", "#123456");
    assert.equal(
      await variable(normal, "--blue-accent"),
      "#1bc2d5",
      "roster colors do not recolor draft",
    );
    await choose("arena", "draft-normal");
    await set("left", "#aabbcc");
    frame = await previewFrame();
    await waitVariable(frame, "--blue-accent", "#aabbcc");
    assert.equal(await variable(normal, "--blue-accent"), "#1bc2d5");
    for (const [field, value] of Object.entries({
      background: "#142536",
      right: "#ddee11",
      text: "#f0f1f2",
      muted: "#abcdef",
      border: "#334455",
    }))
      await set(field, value);
    await save();
    assert.equal(
      await frame
        .locator(".hero-name.blue")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    assert.match(
      await frame
        .locator(".hero-name.blue")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundImage),
      /linear-gradient/,
    );
    for (const page of [normal, six])
      await waitVariable(page, "--blue-accent", "#aabbcc");
    assert.equal(
      await normal
        .locator(".lowermid")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(20, 37, 54)",
    );
    assert.equal(
      await normal
        .locator("#timer")
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(240, 241, 242)",
    );
    assert.equal(
      await normal
        .locator(".phasebox h2")
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(171, 205, 239)",
    );
    assert.equal(
      await normal
        .locator(".heropick")
        .first()
        .evaluate((el) => getComputedStyle(el).borderLeftColor),
      "rgb(51, 68, 85)",
    );
    assert.equal(
      await normal
        .locator("#image-display-1")
        .evaluate((el) => el === window.heroIdentity),
      true,
      "color updates preserve hero DOM",
    );
    assert.equal(await variable(roster, "--orange"), "#123456");
    if (process.env.MLBB_CAPTURE_DIR) {
      await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
      await admin.screenshot({
        path: path.join(
          process.env.MLBB_CAPTURE_DIR,
          "theme-color-controls.png",
        ),
        fullPage: true,
      });
    }
    assert.equal(
      await normal
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgba(0, 0, 0, 0)",
      "canvas remains transparent",
    );
    // Custom text colors must not suppress the live low-clock cue.
    draft.timer = "4";
    draft.timer_running = true;
    broadcast({
      type: "update",
      data: { draftdata: { timer: "4", timer_running: true } },
    });
    await normal.waitForFunction(
      () => document.getElementById("timer").textContent === "04",
    );
    assert.equal(
      await normal
        .locator("#timer")
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(255, 137, 154)",
    );
    draft.timer = "18";
    draft.timer_running = false;
    broadcast({
      type: "update",
      data: { draftdata: { timer: "18", timer_running: false } },
    });
    await admin.locator("#reset-colors").click();
    frame = await previewFrame();
    await waitVariable(frame, "--blue-accent", "#1bc2d5");
    assert.equal(
      await variable(normal, "--blue-accent"),
      "#aabbcc",
      "reset is preview-only until saved",
    );
    await save();
    await waitVariable(normal, "--blue-accent", "#1bc2d5");
    assert.equal(
      await variable(roster, "--orange"),
      "#123456",
      "reset leaves other output saved colors intact",
    );
    // Classic's embedded SVG center follows custom accents as well as its name bars.
    await choose("classic", "draft-normal");
    assert.equal(await admin.locator("#activate-theme").isDisabled(), false);
    await set("left", "#c2357a");
    assert.equal(
      await admin.locator("#activate-theme").isDisabled(),
      true,
      "unsaved colors cannot masquerade as activated colors",
    );
    frame = await previewFrame();
    await frame.waitForFunction(() =>
      getComputedStyle(document.querySelector(".lowermid"), "::before")
        .backgroundImage.toLowerCase()
        .includes("%23c2357a"),
    );
    assert.equal(
      await frame
        .locator(".lowerside:first-child .playername")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(194, 53, 122)",
    );
    await save();
    assert.equal(
      themes.snapshot().data.themeId,
      "arena",
      "saving colors does not activate the preview theme",
    );
    // Reproduce the reported Classic palette: white panels/text and green accents.
    await set("background", "#ffffff");
    await set("text", "#ffffff");
    await set("muted", "#ffffff");
    await set("left", "#185c25");
    await set("right", "#568e00");
    await frame.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#timer")).color ===
        "rgb(24, 33, 43)",
    );
    for (const selector of ["#match-display", ".coach-name", ".phasebox h2"])
      assert.equal(
        await frame
          .locator(selector)
          .first()
          .evaluate((el) => getComputedStyle(el).color),
        "rgb(24, 33, 43)",
      );
    assert.equal(
      await frame
        .locator(".hero-name.blue")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(255, 255, 255)",
    );
    assert.equal(
      await frame
        .locator(".heropick.blue-side")
        .first()
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--accent").trim(),
        ),
      "24, 92, 37",
    );
    assert.equal(
      await frame
        .locator(".heropick.red-side")
        .first()
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--accent").trim(),
        ),
      "86, 142, 0",
    );
    assert.match(
      await frame
        .locator(".heropick.blue-side")
        .first()
        .evaluate((el) => getComputedStyle(el, "::before").backgroundImage),
      /rgb\(24, 92, 37\)/,
    );
    assert.match(
      await frame
        .locator(".tb-left .tb-fill")
        .evaluate((el) => getComputedStyle(el).backgroundImage),
      /rgb\(24, 92, 37\)/,
    );
    assert.match(
      await frame
        .locator(".tb-right .tb-fill")
        .evaluate((el) => getComputedStyle(el).backgroundImage),
      /rgb\(86, 142, 0\)/,
    );
    assert.equal(
      await frame
        .locator(".broadcast-sponsors")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(255, 255, 255)",
    );
    await save();
    await choose("studio", "roster");
    await set("left", "#456789");
    frame = await previewFrame();
    await frame.waitForFunction(
      () =>
        getComputedStyle(document.querySelector(".player-card.blue"))
          .borderTopColor === "rgb(69, 103, 137)",
    );
    await save();
    assert.deepEqual(colors.snapshot().data.palettes.studio.roster, {
      left: "#456789",
    });
    await choose("classic", "roster");
    await set("left", "#8755aa");
    frame = await previewFrame();
    await frame.waitForFunction(() =>
      getComputedStyle(
        document.querySelector(".player-card.blue .player-name-box"),
      ).backgroundImage.includes("rgb(135, 85, 170)"),
    );
    await save();
    await choose("studio", "draft-six");
    await set("right", "#227799");
    frame = await previewFrame();
    await frame.waitForFunction(
      () =>
        getComputedStyle(
          document.querySelector(".lowerside:last-child .playername"),
        ).backgroundColor === "rgb(34, 119, 153)",
    );
    await save();
    await choose("studio", "roster");
    // Unsaved values survive switching to another preview and back.
    await set("text", "#112233");
    await choose("arena", "roster");
    await choose("studio", "roster");
    assert.equal(
      await admin.locator("#color-hex-text").inputValue(),
      "#112233",
    );
    await admin.locator("#reload-colors").click();
    await admin.waitForFunction(() =>
      document
        .getElementById("color-status")
        .textContent.startsWith("Saved colors loaded"),
    );
    const other = await page("/broadcast-themes.html");
    await other.waitForFunction(
      () =>
        !document.getElementById("color-hex-left").disabled &&
        document
          .getElementById("theme-status")
          .textContent.startsWith("Preview ready"),
    );
    await choose("arena", "roster");
    await set("right", "#102030");
    await save();
    await other.locator("#color-hex-left").fill("#abcdef");
    await other.locator("#save-colors").click();
    await other.waitForFunction(() =>
      document
        .getElementById("color-status")
        .textContent.includes("changed in another panel"),
    );
    assert.equal(
      await other.locator("#color-hex-left").inputValue(),
      "#abcdef",
      "stale operator keeps unsaved edits",
    );
    assert.equal(colors.snapshot().data.palettes.arena.roster.left, "#123456");
    await other.locator("#color-hex-left").fill("red");
    assert.equal(await other.locator("#save-colors").isDisabled(), true);
    for (const client of wss.clients) client.close();
    await roster.reload();
    await waitVariable(roster, "--orange", "#123456");
    assert.equal(await normal.locator("#timer").textContent(), "18");
    assert.equal(
      JSON.stringify({
        match: match.snapshot(),
        draft,
        themes: themes.snapshot(),
      }),
      identity,
    );
    assert.deepEqual(
      writes.filter((url) => url !== "/api/broadcast-colors"),
      [],
      "color editing never writes match, draft or theme selection",
    );
    assert.deepEqual(errors, []);
  },
);
