"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const { fixture } = require("./fixtures"),
  { createMatchStore } = require("../lib/match-store"),
  { installMatchRoutes } = require("../lib/match-routes"),
  {
    createRosterThemeStore,
    installRosterThemeRoutes,
  } = require("../lib/roster-theme-store"),
  { loadColorStore, installColorRoutes } = require("../lib/broadcast-colors");
test(
  "postdraft: three layouts, animated GIFs, fallback/reset, independent colors and reconnect",
  { timeout: 90000 },
  async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "postdraft-")),
      app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const broadcast = (message) => {
      for (const client of wss.clients) client.send(JSON.stringify(message));
    };
    const data = fixture();
    data.matchInfo = { match: "GRAND FINALS", game: "GAME 3" };
    data.matchFormat = 5;
    data.teamdata.blueteam.logo = "Assets/Team/blue.png";
    data.teamdata.redteam.logo = "Assets/Team/red.png";
    data.teamdata.blueteam.score = "2";
    for (const team of Object.values(data.teamdata))
      team.playerlist.forEach((player, i) => {
        player.name = `Player ${i + 1}`;
        player.lane = ["exp", "jungle", "mid", "gold", "roam"][i];
      });
    data.teamdata.blueteam.playerlist[0].image = "player/custom-photo.png";
    data.teamdata.blueteam.playerlist[2].name = "No Photo";
    data.teamdata.blueteam.playerlist[2].image =
      "/Assets/player/missing-photo.png";
    const side = () => ({
      pick: Array.from({ length: 5 }, () => ({
        hero: "/Assets/HeroPick/Alpha.png",
      })),
      ban: Array.from({ length: 5 }, () => ({})),
    });
    let draft = {
      current_phase: 17,
      timer: "30",
      timer_running: false,
      blueside: side(),
      redside: side(),
    };
    draft.blueside.pick[1].hero = "/Assets/HeroPick/Missing.png";
    const match = createMatchStore({ initial: data, persist: async () => {} }),
      themes = createRosterThemeStore({
        initial: {
          schemaVersion: 1,
          themeId: "classic",
          previousThemeId: null,
        },
        persist: async () => {},
      }),
      colors = await loadColorStore({
        file: path.join(dir, "colors.json"),
        onCommit: (snapshot) =>
          broadcast({ type: "broadcast_colors_update", ...snapshot }),
      });
    const writes = [];
    app.use(express.json());
    app.use((req, res, next) => {
      if (req.method !== "GET") writes.push(req.path);
      next();
    });
    installMatchRoutes(app, () => match);
    installRosterThemeRoutes(app, () => themes);
    installColorRoutes(app, () => colors);
    const brandingData = {
      schemaVersion: 1,
      patchLabel: "",
      casterNames: "",
      logoFile: "11111111-1111-4111-8111-111111111111.png",
    };
    app.get("/api/scoreboard-branding", (req, res) =>
      res.json({ data: brandingData, revision: '"fixture"' }),
    );
    app.get("/api/matchdraft", (req, res) => res.json({ draftdata: draft }));
    app.get("/database/herolist.json", (req, res) =>
      res.json([
        { name: "Alpha", img: "/Assets/HeroPick/alpha.gif" },
        { name: "Missing", img: "/Assets/HeroPick/missing.gif" },
      ]),
    );
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
        viewport: { width: 1920, height: 1080 },
      }),
      errors = [];
    const gif = process.env.MLBB_TEST_GIF
      ? await fs.readFile(process.env.MLBB_TEST_GIF)
      : Buffer.from(
          "R0lGODlhIAA0AIEAABh2ogAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAEQAAACwAAAAAIAA0AAAIRAABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFixgzatzIsaPHjyBDihxJsqTJkyhTqlzJsqXLlzBjypxJs6bNmzhzLgwIACH5BAERAAEALAAAAAAgADQAge9zMQAAAAAAAAAAAAhEAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWLGDNq3Mixo8ePIEOKHEmypMmTKFOqXMmypcuXMGPKnEmzps2bOHMuDAgAIfkEAREAAQAsAAAAACAANACBdyeiAAAAAAAAAAAACEQAAQgcSLCgwYMIEypcyLChw4cQI0qcSLGixYsYM2rcyLGjx48gQ4ocSbKkyZMoU6pcybKly5cwY8qcSbOmzZs4cy4MCAA7",
          "base64",
        );
    let missingPhotoAvailable = false;
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (url.pathname.startsWith("/scoreboard-branding/"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path d="M60 4L112 30V90L60 116L8 90V30Z" fill="#b49a42"/><path d="M60 20L96 39V81L60 100L24 81V39Z" fill="#172638"/></svg>',
        });
      if (url.pathname.includes("/Assets/Font/")) return route.continue();
      if (url.pathname === "/Assets/HeroPick/alpha.gif")
        return route.fulfill({ contentType: "image/gif", body: gif });
      if (url.pathname.toLowerCase().endsWith(".gif"))
        return route.fulfill({ status: 404, body: "missing" });
      if (
        !missingPhotoAvailable &&
        (url.pathname.includes("missing-photo") ||
          url.pathname.includes("No%20Photo"))
      )
        return route.fulfill({ status: 404, body: "missing player photo" });
      if (url.pathname.includes("/Assets/player/"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320"><circle cx="120" cy="73" r="49" fill="#c9a48c"/><path d="M28 320V191Q28 138 120 138Q212 138 212 191V320" fill="#274a75"/><path d="M77 144L120 185L163 144" fill="none" stroke="#eef3f8" stroke-width="12"/></svg>',
        });
      if (url.pathname.includes("/Assets/"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 390"><rect width="240" height="390" fill="#35566e"/><circle cx="120" cy="100" r="55" fill="#b8c9d6"/></svg>',
        });
      return route.continue();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function page(url) {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + url);
      return page;
    }
    const live = await page("/postdraft2.html"),
      pinned = await page("/postdraft2.html?theme=studio");
    const ready = (page, id) =>
      page.waitForFunction(
        (id) =>
          document.body.dataset.postdraftTheme === id &&
          document.body.dataset.postdraftReady === "true",
        id,
      );
    await ready(live, "classic");
    await ready(pinned, "studio");
    await live.locator("#pd-tournament-logo").waitFor({ state: "visible" });
    await live.waitForFunction(
      () =>
        document.getElementById("image-display-1").src.endsWith("/alpha.gif") &&
        !document.getElementById("image-display-1").hidden,
    );
    await live.waitForFunction(
      () =>
        document
          .getElementById("image-display-2")
          .src.endsWith("Missing.png") &&
        !document.getElementById("image-display-2").hidden,
    );
    assert.equal(await live.locator(".pd-card").count(), 10);
    assert.equal(
      await live.locator("#pd-red-bank .pd-player-name").first().textContent(),
      "Player 5",
    );
    await live.waitForFunction(() =>
      document
        .querySelector("#pd-blue-bank .pd-card")
        .classList.contains("has-photo"),
    );
    assert.ok(
      (
        await live
          .locator("#pd-blue-bank .pd-player")
          .first()
          .getAttribute("src")
      ).endsWith("custom-photo.png"),
    );
    const gifNode = live.locator("#image-display-1");
    await gifNode.evaluate((el) => {
      window.gifNode = el;
      window.sourceChanges = 0;
      new MutationObserver(
        (records) =>
          (window.sourceChanges += records.filter(
            (r) => r.attributeName === "src",
          ).length),
      ).observe(el, { attributes: true });
    });
    const box = await gifNode.boundingBox(),
      clip = { x: box.x + 30, y: box.y + 70, width: 70, height: 100 };
    const first = await live.screenshot({ clip });
    let animated = false;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 120));
      if (!(await live.screenshot({ clip })).equals(first)) {
        animated = true;
        break;
      }
    }
    assert.equal(
      animated,
      true,
      "GIF pixels change while the card layout is static",
    );
    broadcast({ type: "matchdata_update", data });
    broadcast({ type: "draftdata_update", data: draft });
    await live.waitForFunction(
      () => document.getElementById("name-box-3").textContent === "Player 1",
    );
    assert.equal(
      await live.evaluate(() => window.sourceChanges),
      0,
      "unchanged match/draft updates do not restart GIF src",
    );
    for (const id of ["classic", "arena", "studio"]) {
      await themes.select(id, themes.snapshot().revision);
      broadcast({ type: "roster_theme_update", ...themes.snapshot() });
      await ready(live, id);
      assert.equal(
        await live.evaluate(
          () =>
            window.gifNode === document.getElementById("image-display-1") &&
            window.sourceChanges === 0,
        ),
        true,
      );
      assert.equal(
        await live.locator("#pd-blue-bank .pd-player").first().isVisible(),
        true,
        "player photo remains visible beside selected hero",
      );
      const heroBox = await live.locator("#image-display-1").boundingBox(),
        photoBox = await live
          .locator("#pd-blue-bank .pd-player")
          .first()
          .boundingBox();
      assert.ok(
        photoBox.y < heroBox.y + heroBox.height &&
          photoBox.x < heroBox.x + heroBox.width,
        "player cutout overlays the lower hero area",
      );
      assert.equal(
        await live
          .locator("#pd-blue-bank .pd-card")
          .nth(2)
          .locator(".pd-player")
          .isHidden(),
        true,
      );
      assert.equal(
        await live.locator("#image-display-3").isVisible(),
        true,
        "missing photo keeps hero visible",
      );
      if (process.env.MLBB_CAPTURE_DIR) {
        await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
        await live.screenshot({
          omitBackground: true,
          path: path.join(process.env.MLBB_CAPTURE_DIR, `postdraft-${id}.png`),
        });
      }
    }
    const beforeBranding = await live.evaluate(() => window.sourceChanges);
    brandingData.logoFile = null;
    broadcast({ type: "scoreboard_branding_update", data: brandingData });
    await live.waitForFunction(
      () => document.getElementById("pd-tournament-logo").hidden,
    );
    brandingData.logoFile = "22222222-2222-4222-8222-222222222222.png";
    broadcast({ type: "scoreboard_branding_update", data: brandingData });
    await live.locator("#pd-tournament-logo").waitFor({ state: "visible" });
    assert.ok(
      (await live.locator("#pd-tournament-logo").getAttribute("src")).endsWith(
        brandingData.logoFile,
      ),
    );
    assert.equal(
      await live.evaluate(() => window.sourceChanges),
      beforeBranding,
      "tournament logo updates preserve hero playback",
    );
    missingPhotoAvailable = true;
    await live
      .locator("#pd-blue-bank .pd-player")
      .nth(2)
      .evaluate((el) => (el.dataset.retryAt = "0"));
    broadcast({ type: "matchdata_update", data });
    await live.waitForFunction(() =>
      document
        .querySelectorAll("#pd-blue-bank .pd-card")[2]
        .classList.contains("has-photo"),
    );
    assert.equal(
      await live.evaluate(() => window.sourceChanges),
      0,
      "recovering a player photo does not reset the hero GIF",
    );
    assert.equal(
      await pinned.locator("body").getAttribute("data-postdraft-theme"),
      "studio",
    );
    const admin = await page("/broadcast-themes.html");
    await admin.locator("#preview-output").selectOption("postdraft");
    await admin.waitForFunction(
      () =>
        document.getElementById("color-scope").textContent ===
          "Studio · Post-draft" &&
        document
          .getElementById("theme-status")
          .textContent.startsWith("Preview ready"),
    );
    await admin.locator("#color-hex-left").fill("#228844");
    const frame = admin.frames().find((frame) => frame !== admin.mainFrame());
    await frame.waitForFunction(
      () =>
        getComputedStyle(document.body).getPropertyValue("--pd-left").trim() ===
        "#228844",
    );
    assert.notEqual(
      await live.evaluate(() =>
        getComputedStyle(document.body).getPropertyValue("--pd-left").trim(),
      ),
      "#228844",
    );
    await admin.locator("#save-colors").click();
    await live.waitForFunction(
      () =>
        getComputedStyle(document.body).getPropertyValue("--pd-left").trim() ===
        "#228844",
    );
    assert.deepEqual(colors.snapshot().data.palettes.studio, {
      postdraft: { left: "#228844" },
    });
    draft.blueside.pick[0].hero = "";
    broadcast({ type: "draftdata_update", data: draft });
    await live.waitForFunction(
      () =>
        !document
          .querySelector("#pd-blue-bank .pd-card")
          .classList.contains("has-hero"),
    );
    assert.equal(await gifNode.isHidden(), true);
    assert.equal(
      await live.locator("#pd-blue-bank .pd-player").first().isVisible(),
      true,
    );
    for (const client of wss.clients) client.close();
    await live.reload();
    await ready(live, "studio");
    assert.equal(
      await live.locator("#display-game-text").textContent(),
      "GAME 3",
    );
    assert.equal(
      await live.evaluate(() =>
        getComputedStyle(document.body).getPropertyValue("--pd-left").trim(),
      ),
      "#228844",
    );
    assert.deepEqual(writes, ["/api/broadcast-colors"]);
    assert.deepEqual(errors, []);
  },
);
