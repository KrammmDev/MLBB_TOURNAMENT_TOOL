"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  path = require("node:path"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
test(
  "online caster controls show live names, independent themes/colors and transparent camera windows",
  { timeout: 40000 },
  async (t) => {
    const app = express(),
      server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const wss = new WebSocketServer({ server }),
      broadcast = (m) => {
        for (const s of wss.clients) s.send(JSON.stringify(m));
      },
      writes = [];
    wss.on("connection", (s) => {
      s.send(
        JSON.stringify({
          type: "init",
          data: { "tournament-title": "LCUAA ONLINE DESK" },
        }),
      );
      s.on("message", (raw) => writes.push(String(raw)));
    });
    app.use(express.json());
    const {
        createCasterStore,
        installCasterRoutes,
      } = require("../lib/caster-panel"),
      {
        createRosterThemeStore,
        installRosterThemeRoutes,
      } = require("../lib/roster-theme-store"),
      {
        createColorStore,
        installColorRoutes,
      } = require("../lib/broadcast-colors");
    const casters = createCasterStore({
        persist: async () => {},
        onCommit: (s) => broadcast({ type: "caster_panel_update", ...s }),
      }),
      theme = createRosterThemeStore({
        initial: {
          schemaVersion: 1,
          themeId: "classic",
          previousThemeId: null,
        },
        persist: async () => {},
        onCommit: (s) => broadcast({ type: "roster_theme_update", ...s }),
      }),
      colors = createColorStore({
        persist: async () => {},
        onCommit: (s) => broadcast({ type: "broadcast_colors_update", ...s }),
      });
    installCasterRoutes(app, () => casters);
    installRosterThemeRoutes(app, () => theme);
    installColorRoutes(app, () => colors);
    app.get("/api/matchdata", (q, s) =>
      s.json(require("./fixtures").fixture()),
    );
    app.get("/api/scoreboard-branding", (q, s) =>
      s.json({
        data: {
          schemaVersion: 1,
          patchLabel: "",
          casterNames: "",
          logoFile: null,
        },
        revision: '"0"',
      }),
    );
    app.use(express.static(path.join(__dirname, "../public")));
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
    const ctx = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      }),
      overlay = await ctx.newPage(),
      control = await ctx.newPage(),
      errors = [];
    overlay.on("pageerror", (e) => errors.push(e.message));
    control.on("pageerror", (e) => errors.push(e.message));
    let feedLoads = 0;
    await ctx.route("https://vdo.ninja/**", async (route) => {
      feedLoads++;
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body>Test receiver feed</body></html>",
      });
    });
    const base = "http://127.0.0.1:" + server.address().port;
    await overlay.goto(base + "/casters.html");
    await overlay.waitForFunction(
      () => document.body.dataset.castersReady === "true",
    );
    await overlay.locator("#casterFrame").waitFor({ state: "hidden" });
    await control.goto(base + "/broadcast-themes.html");
    await control.waitForFunction(
      () => !document.getElementById("caster-save").disabled,
    );
    await control.selectOption("#preview-output", "casters");
    await control.waitForFunction(() =>
      document
        .getElementById("theme-status")
        .textContent.includes("Preview ready"),
    );
    await control
      .frameLocator("#theme-preview")
      .locator("#casterFrame")
      .waitFor({ state: "visible" });
    assert.equal(
      casters.snapshot().data.visible,
      false,
      "theme preview never shows the live source",
    );
    await control.fill("#caster-1-name", "Athena");
    await control.fill("#caster-1-handle", "@athenakaph");
    await control.fill(
      "#caster-1-vdoUrl",
      "https://vdo.ninja/?view=athena-test&solo=1&room=Test123",
    );
    await control.fill("#caster-2-vdoUrl", "https://vdo.ninja/?view=wolf-test");
    await control.fill("#caster-2-name", "Wolf");
    await control.fill("#caster-2-handle", "@wolfcasts");
    await control.click("#caster-show");
    await overlay.locator("#casterFrame").waitFor({ state: "visible" });
    assert.equal(await overlay.locator("#casterName1").textContent(), "Athena");
    assert.equal(await overlay.locator("#casterName2").textContent(), "Wolf");
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 2,
    );
    await control
      .frameLocator("#theme-preview")
      .locator("#casterFrame")
      .waitFor({ state: "visible" });
    assert.equal(
      await control.frameLocator("#theme-preview").locator("iframe").count(),
      0,
      "preview cannot play duplicate VDO audio",
    );
    const loadsBeforeEdit = feedLoads;
    assert.equal(
      casters.snapshot().data.casters[0].name,
      "Athena",
      "Show frame saves current details without a separate Save click",
    );
    assert.equal(
      new URL(
        await overlay.locator("#casterWindow1 iframe").getAttribute("src"),
      ).searchParams.get("room"),
      "Test123",
    );
    assert.equal(
      await overlay.locator("#casterTournament").textContent(),
      "LCUAA ONLINE DESK",
    );
    for (const id of ["classic", "arena", "studio"]) {
      await control.click('.theme-card[data-theme-id="' + id + '"]');
      await control.waitForFunction(() =>
        document
          .getElementById("theme-status")
          .textContent.includes("Preview ready"),
      );
      if (
        theme.snapshot().data.selections?.casters?.themeId !== id &&
        !(id === "classic" && !theme.snapshot().data.selections?.casters)
      ) {
        await control.click("#activate-theme");
        await control.waitForFunction(
          () => !document.getElementById("preview-output").disabled,
        );
      }
      await overlay.waitForFunction(
        (id) =>
          document.body.dataset.castersTheme === id &&
          document.body.dataset.castersReady === "true",
        id,
      );
      for (const [selector, x] of [
        ["#casterWindow1", 90],
        ["#casterWindow2", 990],
      ]) {
        assert.deepEqual(await overlay.locator(selector).boundingBox(), {
          x,
          y: 230,
          width: 840,
          height: 560,
        });
        assert.equal(
          await overlay
            .locator(selector)
            .evaluate((e) => getComputedStyle(e).backgroundColor),
          "rgba(0, 0, 0, 0)",
        );
      }
      await overlay.screenshot({
        path: "/tmp/casters-" + id + ".png",
        omitBackground: true,
      });
    }
    await control.locator("#color-left").evaluate((e) => {
      e.value = "#11bb77";
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(
      colors.snapshot().data.palettes.studio?.casters,
      undefined,
      "color preview does not save",
    );
    await control.click("#save-colors");
    await overlay.waitForFunction(
      () =>
        getComputedStyle(document.body).getPropertyValue("--cc-left").trim() ===
        "#11bb77",
    );
    assert.equal(
      colors.snapshot().data.palettes.studio.casters.left,
      "#11bb77",
    );
    assert.equal(colors.snapshot().data.palettes.studio.schedule, undefined);
    assert.equal(
      require("../public/script/roster-themes").selection(
        theme.snapshot().data,
        "schedule",
      ).themeId,
      "classic",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-2-off-air").disabled,
    );
    await control.click("#caster-2-off-air");
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 1,
    );
    await overlay.locator("#casterWindow2").waitFor({ state: "hidden" });
    await overlay
      .locator("#casterWindow1")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    assert.deepEqual(await overlay.locator("#casterWindow1").boundingBox(), {
      x: 360,
      y: 230,
      width: 1200,
      height: 560,
    });
    for (const id of ["classic", "arena", "studio"]) {
      await theme.select(id, theme.snapshot().revision, "casters");
      await overlay.waitForFunction(
        (id) =>
          document.body.dataset.castersTheme === id &&
          document.body.dataset.castersReady === "true",
        id,
      );
      assert.equal(
        (await overlay.locator("#casterWindow1").boundingBox()).x,
        360,
        "solo camera stays centered in every theme",
      );
    }
    assert.equal(
      await overlay.locator("#casterWindow2 iframe").count(),
      0,
      "off-air unloads its entire audio/video document",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-2-on-air").disabled,
    );
    await control.click("#caster-2-on-air");
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 2,
    );
    await overlay.locator("#casterWindow2").waitFor({ state: "visible" });
    await control.waitForFunction(
      () => !document.getElementById("caster-1-off-air").disabled,
    );
    await control.click("#caster-1-off-air");
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 1,
    );
    await overlay
      .locator("#casterWindow2")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    assert.equal(
      (await overlay.locator("#casterWindow2").boundingBox()).x,
      360,
      "right caster also centers when left is off-air",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-2-off-air").disabled,
    );
    await control.click("#caster-2-off-air");
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 0,
    );
    assert.equal(
      await overlay.locator("#casterStage").getAttribute("data-active-count"),
      "0",
    );
    for (const id of [1, 2]) {
      await control.waitForFunction(
        (id) => !document.getElementById("caster-" + id + "-on-air").disabled,
        id,
      );
      await control.click("#caster-" + id + "-on-air");
    }
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 2,
    );
    await overlay.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await overlay
        .locator(".cc-nameplate")
        .first()
        .evaluate((e) => getComputedStyle(e).transitionDuration),
      "0s",
    );
    await control.fill("#caster-1-name", "<b>NEW CASTER</b>");
    await control.click("#caster-save");
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterName1").textContent ===
        "<b>NEW CASTER</b>",
    );
    assert.equal(await overlay.locator("#casterName1 b").count(), 0);
    await control.waitForFunction(
      () => !document.getElementById("caster-names-hide").disabled,
    );
    await control.click("#caster-names-hide");
    await overlay.locator("#casterNames").waitFor({ state: "hidden" });
    await control.waitForFunction(
      () => !document.getElementById("caster-names-show").disabled,
    );
    await control.click("#caster-names-show");
    await overlay.locator("#casterNames").waitFor({ state: "visible" });
    await control.waitForFunction(
      () => !document.getElementById("caster-hide").disabled,
    );
    await control.fill("#caster-1-vdoUrl", "https://invalid.example/?view=x");
    await control.click("#caster-hide");
    await overlay.locator("#casterFrame").waitFor({ state: "hidden" });
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 0,
    );
    assert.deepEqual(writes, [], "overlay has no state writes");
    assert.deepEqual(errors, []);
  },
);
