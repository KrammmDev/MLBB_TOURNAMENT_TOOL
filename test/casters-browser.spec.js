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
    const blankSide = () => ({
      pick: Array.from({ length: 5 }, () => ({})),
      ban: Array.from({ length: 5 }, () => ({})),
    });
    app.get("/api/matchdraft", (q, s) =>
      s.json({
        draftdata: {
          current_phase: 6,
          timer: "18",
          timer_running: false,
          blueside: blankSide(),
          redside: blankSide(),
        },
      }),
    );
    app.get("/database/herolist.json", (q, s) => s.json([]));
    app.get("/api/herostats", (q, s) => s.json({ heroes: {} }));
    app.get("/api/mapdraw", (q, s) =>
      s.json({
        drawdata: { status: "finished", result: "GoldenTurret", timestamp: 0 },
      }),
    );
    let brandingLogo = "11111111-1111-4111-8111-111111111111.png";
    app.get(/^\/scoreboard-branding\//, (q, s) =>
      s
        .type("svg")
        .send(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>',
        ),
    );
    app.get("/api/scoreboard-branding", (q, s) =>
      s.json({
        data: {
          schemaVersion: 1,
          patchLabel: "",
          casterNames: "",
          logoFile: brandingLogo,
        },
        revision: '"0"',
      }),
    );
    app.get(/^\/Assets\/map\//, (q, s) =>
      s
        .type("svg")
        .send(
          '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="112"><rect width="720" height="112" fill="white"/><path d="M0 0H120L160 56L120 112H0Z" fill="orange"/><text x="190" y="72" font-size="40">GOLDEN TURRET</text></svg>',
        ),
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
        body: `<!doctype html><html><body>Test receiver feed<script>window.muteMessages=[];addEventListener("message",e=>{if(typeof e.data?.mute === "boolean") {window.muteMessages.push(e.data.mute);document.body.dataset.muted=String(e.data.mute);}});</script></body></html>`,
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
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.sceneTransition ===
        "true",
    );
    assert.equal(
      await overlay
        .locator(".cc-top")
        .evaluate((e) => getComputedStyle(e).height),
      "1080px",
      "Show frame retains opaque backing while fading in",
    );
    assert.equal(await overlay.locator("#casterName1").textContent(), "Athena");
    assert.equal(await overlay.locator("#casterName2").textContent(), "Wolf");
    await overlay.waitForFunction(() =>
      Array.from(document.querySelectorAll(".cc-tournament-logo")).every(
        (i) => !i.hidden && i.naturalWidth > 0,
      ),
    );
    assert.equal(await overlay.locator(".cc-mark").first().textContent(), "");
    brandingLogo = "22222222-2222-4222-8222-222222222222.png";
    broadcast({
      type: "scoreboard_branding_update",
      data: { logoFile: brandingLogo },
    });
    await overlay.waitForFunction(
      (file) =>
        Array.from(document.querySelectorAll(".cc-tournament-logo")).every(
          (i) => i.getAttribute("src").endsWith(file) && !i.hidden,
        ),
      brandingLogo,
    );
    broadcast({
      type: "scoreboard_branding_update",
      data: { logoFile: "../../bad.png" },
    });
    assert.ok(
      (
        await overlay.locator(".cc-tournament-logo").first().getAttribute("src")
      ).endsWith(brandingLogo),
    );

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
      await overlay.locator("#casterWindow1 iframe").getAttribute("src"),
      "https://vdo.ninja/?view=athena-test&solo=1&room=Test123",
    );
    assert.equal(
      await overlay.locator("#casterWindow2 iframe").getAttribute("src"),
      "https://vdo.ninja/?view=wolf-test",
    );
    const receiverBox = await overlay
      .locator("#casterWindow1 iframe")
      .boundingBox();
    assert.equal(receiverBox.width, 840);
    assert.equal(receiverBox.height, 560);

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
          y: id === "studio" ? 340 : id === "classic" ? 160 : 230,
          width: 840,
          height: id === "studio" ? 472.5 : 560,
        });
        assert.equal(
          await overlay
            .locator(selector)
            .evaluate((e) => getComputedStyle(e).backgroundColor),
          "rgba(0, 0, 0, 0)",
        );
      }
      await overlay
        .locator("#casterFrame")
        .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
      await overlay.waitForFunction(() =>
        Array.from(document.querySelectorAll(".cc-camera iframe")).every(
          (f) => f.contentWindow,
        ),
      );
      if (id === "classic") {
        await overlay.locator(".cc-header").waitFor({ state: "hidden" });
        await overlay.locator(".cc-footer").waitFor({ state: "hidden" });
        for (const [cameraId, plateClass] of [
          ["#casterWindow1", ".cc-one"],
          ["#casterWindow2", ".cc-two"],
        ]) {
          const camera = await overlay.locator(cameraId).boundingBox();
          const plate = await overlay.locator(plateClass).boundingBox();
          assert.equal(
            plate.x,
            camera.x + (plateClass === ".cc-two" ? camera.width / 2 : 0),
          );
          assert.equal(plate.width, camera.width / 2);
          assert.equal(
            plate.y + plate.height,
            camera.y + camera.height,
            "Classic name holders sit inside the camera's lower edge",
          );
          assert.ok(plate.y >= camera.y);
          assert.notEqual(
            await overlay
              .locator(plateClass)
              .evaluate((e) => getComputedStyle(e).clipPath),
            "none",
          );
        }
      }
      if (id === "studio") {
        const logo = await overlay.locator(".cc-header-logo").boundingBox();
        assert.equal(
          logo.x + logo.width / 2,
          960,
          "Studio tournament logo is centered",
        );
        for (const [cameraId, plateClass] of [
          ["#casterWindow1", ".cc-one"],
          ["#casterWindow2", ".cc-two"],
        ]) {
          const camera = await overlay.locator(cameraId).boundingBox();
          const plate = await overlay.locator(plateClass).boundingBox();
          assert.equal(
            plate.x,
            camera.x,
            "Studio name tab starts at the camera's left edge",
          );
          assert.equal(
            plate.y + plate.height,
            camera.y + camera.height,
            "name tab sits inside the camera's lower edge",
          );
          assert.ok(plate.width < camera.width / 2);
        }
      }
      await overlay.screenshot({
        path: "/tmp/casters-" + id + ".png",
        omitBackground: true,
      });
    }
    brandingLogo = null;
    broadcast({ type: "scoreboard_branding_update", data: { logoFile: null } });
    await overlay.waitForFunction(() =>
      Array.from(document.querySelectorAll(".cc-tournament-logo")).every(
        (i) => i.hidden && !i.hasAttribute("src"),
      ),
    );
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
      () => document.getElementById("casterStage").dataset.activeCount === "1",
    );
    assert.equal(
      await overlay
        .locator("#casterWindow1")
        .evaluate((e) =>
          e.getAnimations().some((a) => a.effect.getTiming().duration === 650),
        ),
      true,
      "solo layout uses a compositor transition",
    );
    assert.equal(
      await overlay.locator("#casterWindow2 iframe").count(),
      1,
      "feed stays attached during its exit animation",
    );
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 1,
    );
    await overlay.locator("#casterWindow2").waitFor({ state: "hidden" });
    await overlay
      .locator("#casterWindow1")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    assert.deepEqual(await overlay.locator("#casterWindow1").boundingBox(), {
      x: 360,
      y: 340,
      width: 1200,
      height: 472.5,
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
      if (id === "classic") {
        const camera = await overlay.locator("#casterWindow1").boundingBox();
        const plate = await overlay.locator(".cc-one").boundingBox();
        assert.equal(plate.y + plate.height, camera.y + camera.height);
        assert.equal(plate.x, camera.x);
        assert.equal(plate.width, camera.width / 2);
      }
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
    await theme.select("classic", theme.snapshot().revision, "casters");
    await overlay.waitForFunction(
      () => document.body.dataset.castersTheme === "classic",
    );
    const soloRightCamera = await overlay
      .locator("#casterWindow2")
      .boundingBox();
    const soloRightPlate = await overlay.locator(".cc-two").boundingBox();
    assert.equal(soloRightPlate.width, soloRightCamera.width / 2);
    assert.equal(
      soloRightPlate.x + soloRightPlate.width,
      soloRightCamera.x + soloRightCamera.width,
      "right solo holder remains at the video's right edge",
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
    await control.waitForFunction(
      () => !document.getElementById("caster-2-off-air").disabled,
    );
    await control.click("#caster-2-off-air");
    await overlay.waitForFunction(
      () => document.getElementById("casterStage").dataset.activeCount === "1",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-2-on-air").disabled,
    );
    await control.click("#caster-2-on-air");
    await overlay.waitForFunction(
      () => document.getElementById("casterStage").dataset.activeCount === "2",
    );
    await overlay.waitForTimeout(750);
    assert.equal(
      await overlay.locator(".cc-camera iframe").count(),
      2,
      "rapid reversal cancels pending feed removal",
    );
    // Draft is the actual display renderer below both cameras, without reconnecting VDO.
    const loadsBeforeDraft = feedLoads;
    await overlay.evaluate(() => {
      window.savedCasterFeeds = Array.from(
        document.querySelectorAll(".cc-camera iframe"),
      );
    });
    await control.waitForFunction(
      () => !document.getElementById("caster-draft-show").disabled,
    );
    await control.click("#caster-draft-show");
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.draftVisible === "true",
    );
    await overlay
      .locator("#casterDesk")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    await overlay
      .frameLocator("#casterDraft iframe")
      .locator(".mainbox")
      .waitFor({ state: "visible" });
    await overlay
      .frameLocator("#casterDraft iframe")
      .locator("#timer")
      .filter({ hasText: "18" })
      .waitFor();
    broadcast({
      type: "update",
      data: { draftdata: { timer: "17", timer_running: false } },
    });
    await overlay
      .frameLocator("#casterDraft iframe")
      .locator("#timer")
      .filter({ hasText: "17" })
      .waitFor();
    await theme.select("classic", theme.snapshot().revision, "casters");
    await overlay.waitForFunction(
      () => document.body.dataset.castersTheme === "classic",
    );
    const compactClassicCamera = await overlay
      .locator("#casterWindow1")
      .boundingBox();
    const compactClassicPlate = await overlay.locator(".cc-one").boundingBox();
    assert.ok(
      Math.abs(
        compactClassicPlate.y +
          compactClassicPlate.height -
          compactClassicCamera.y -
          compactClassicCamera.height,
      ) < 1,
      "Classic holder stays inside video in combined draft mode",
    );
    await overlay.screenshot({ path: "/tmp/classic-inset-draft.png" });
    assert.ok(
      Math.abs(compactClassicPlate.width - compactClassicCamera.width / 2) < 1,
      "Classic draft-mode name holder stays half width",
    );
    // Every saved draft look must fit, including Arena's taller team header.
    await theme.select("arena", theme.snapshot().revision, "casters");
    await overlay.waitForFunction(
      () => document.body.dataset.castersTheme === "arena",
    );
    for (const draftTheme of ["classic", "arena", "studio"]) {
      await theme.select(draftTheme, theme.snapshot().revision, "draft");
      const embedded = overlay
        .frames()
        .find((f) => f.url().includes("/draft-display.html"));
      await embedded.waitForFunction(
        (id) =>
          document.body.dataset.draftTheme === id &&
          document.body.dataset.draftReady === "true",
        draftTheme,
      );
      const host = await overlay.locator("#casterDraft").boundingBox();
      await embedded.locator(".mapdraw-label").waitFor({ state: "visible" });
      const mapBounds = await embedded.locator(".mapdraw-label").boundingBox();
      assert.ok(
        mapBounds.y >= host.y &&
          mapBounds.y + mapBounds.height <= host.y + host.height,
        "map result remains inside the caster draft viewport",
      );
      for (const selector of draftTheme === "arena"
        ? [".mainbox", ".upperlowermid .teamlogo-wrap"]
        : [".mainbox"]) {
        for (const box of await embedded.locator(selector).all()) {
          const bounds = await box.boundingBox();
          assert.ok(
            bounds.y >= host.y - 1,
            draftTheme + " " + selector + " top is not clipped",
          );
          assert.ok(
            bounds.y + bounds.height <= host.y + host.height + 1,
            draftTheme + " bottom is not clipped",
          );
        }
      }
      const names = await overlay.locator(".cc-one").boundingBox();
      assert.ok(
        names.y + names.height <=
          (await embedded.locator(".mainbox").boundingBox()).y,
        "nameplates stay above " + draftTheme + " draft",
      );
      await overlay.screenshot({
        path: "/tmp/casters-draft-fit-" + draftTheme + ".png",
      });
    }
    const cameraDraft = await overlay.locator("#casterWindow1").boundingBox();
    const plateDraft = await overlay.locator(".cc-one").boundingBox();
    const draftBounds = await overlay
      .frameLocator("#casterDraft iframe")
      .locator(".mainbox")
      .boundingBox();
    assert.ok(cameraDraft.width < 840 && cameraDraft.y < 100);
    assert.ok(
      plateDraft.y + plateDraft.height < draftBounds.y,
      "draft sits below camera nameplates",
    );
    assert.equal(
      await overlay.locator("#casterDraft iframe").getAttribute("src"),
      "/draft-display.html?audio=0&context=casters",
    );
    assert.equal(
      feedLoads,
      loadsBeforeDraft,
      "showing draft never reconnects caster feeds",
    );
    assert.ok(
      await overlay.evaluate(() =>
        window.savedCasterFeeds.every(
          (e, i) => e === document.querySelectorAll(".cc-camera iframe")[i],
        ),
      ),
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-draft-hide").disabled,
    );
    await control.click("#caster-draft-hide");
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.sceneTransition ===
        "true",
    );
    assert.equal(
      await overlay
        .locator(".cc-top")
        .evaluate((e) => getComputedStyle(e).height),
      "1080px",
      "opaque backing stays across camera holes during restoration",
    );
    assert.ok(
      await overlay.evaluate(
        () =>
          Number(
            getComputedStyle(document.getElementById("casterDraft")).zIndex,
          ) <
          Number(
            getComputedStyle(document.getElementById("casterDesk")).zIndex,
          ),
      ),
      "fading draft stays behind moving cameras",
    );
    await overlay.screenshot({ path: "/tmp/caster-draft-hide-transition.png" });
    await overlay.locator("#casterDraft").waitFor({ state: "hidden" });
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.sceneTransition ===
        "false",
    );
    assert.equal(
      await overlay
        .locator(".cc-top")
        .evaluate((e) => getComputedStyle(e).height),
      "230px",
      "normal transparent camera layout returns after movement",
    );
    await overlay
      .locator("#casterDesk")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    assert.equal(
      (await overlay.locator("#casterWindow1").boundingBox()).width,
      840,
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-draft-show").disabled,
    );
    await control.click("#caster-draft-show");
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.draftVisible === "true",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-2-off-air").disabled,
    );
    await control.click("#caster-2-off-air");
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 1,
    );
    await overlay
      .locator("#casterDesk")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    await overlay
      .locator("#casterWindow1")
      .evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
    const soloDraft = await overlay.locator("#casterWindow1").boundingBox();
    assert.ok(
      Math.abs(soloDraft.x + soloDraft.width / 2 - 960) < 1,
      "single caster centers above draft",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-2-on-air").disabled,
    );
    await control.click("#caster-2-on-air");
    await control.waitForFunction(
      () => !document.getElementById("caster-draft-hide").disabled,
    );
    await control.click("#caster-draft-hide");
    await overlay.locator("#casterDraft").waitFor({ state: "hidden" });
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 2,
    );
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.sceneTransition ===
        "false",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-names-hide").disabled,
    );
    await control.click("#caster-names-hide");
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.sceneTransition ===
        "true",
    );
    assert.equal(
      await overlay
        .locator(".cc-top")
        .evaluate((e) => getComputedStyle(e).height),
      "1080px",
      "name visibility changes retain backing",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-names-show").disabled,
    );
    await control.click("#caster-names-show");
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.sceneTransition ===
        "false",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-2-off-air").disabled,
    );
    await control.click("#caster-2-off-air");
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.sceneTransition ===
        "true",
    );
    assert.equal(
      await overlay
        .locator(".cc-top")
        .evaluate((e) => getComputedStyle(e).height),
      "1080px",
      "caster Off Air retains backing during solo motion",
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-2-on-air").disabled,
    );
    await control.click("#caster-2-on-air");
    await overlay.waitForFunction(
      () =>
        document.getElementById("casterStage").dataset.sceneTransition ===
        "false",
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
    assert.equal(
      await overlay.locator(".cc-camera iframe").count(),
      2,
      "Hide frame retains receivers",
    );
    for (const receiver of overlay
      .frames()
      .filter((f) => f.url().startsWith("https://vdo.ninja/")))
      await receiver.waitForFunction(
        () => document.body.dataset.muted === "true",
      );
    const warmLoads = feedLoads;
    await overlay.evaluate(() => {
      window.warmFeeds = Array.from(
        document.querySelectorAll(".cc-camera iframe"),
      );
    });
    await control.fill(
      "#caster-1-vdoUrl",
      casters.snapshot().data.casters[0].vdoUrl,
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-show").disabled,
    );
    await control.click("#caster-show");
    await overlay.locator("#casterFrame").waitFor({ state: "visible" });
    for (const receiver of overlay
      .frames()
      .filter((f) => f.url().startsWith("https://vdo.ninja/")))
      await receiver.waitForFunction(
        () => document.body.dataset.muted === "false",
      );
    assert.equal(
      feedLoads,
      warmLoads,
      "Show frame reuses warm receiver connections",
    );
    assert.ok(
      await overlay.evaluate(() =>
        window.warmFeeds.every(
          (f, i) => f === document.querySelectorAll(".cc-camera iframe")[i],
        ),
      ),
    );
    await control.waitForFunction(
      () => !document.getElementById("caster-hide").disabled,
    );
    await control.click("#caster-hide");
    for (const id of [1, 2]) {
      await control.waitForFunction(
        (id) => !document.getElementById("caster-" + id + "-off-air").disabled,
        id,
      );
      await control.click("#caster-" + id + "-off-air");
    }
    await overlay.waitForFunction(
      () => document.querySelectorAll(".cc-camera iframe").length === 0,
    );
    assert.deepEqual(writes, [], "overlay has no state writes");
    assert.deepEqual(errors, []);
  },
);
