"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  express = require("express"),
  { WebSocketServer } = require("ws"),
  { chromium } = require("playwright");
const {
    createRosterThemeStore,
    installRosterThemeRoutes,
  } = require("../lib/roster-theme-store"),
  { loadColorStore, installColorRoutes } = require("../lib/broadcast-colors"),
  { createPanelStore, installPanelRoutes } = require("../lib/production-panel");
test(
  "schedule themes reuse live schedule controls, casters, timer and isolated theme/color selection",
  { timeout: 105000 },
  async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "schedule-test-"));
    const app = express(),
      server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const wss = new WebSocketServer({ server });
    const broadcast = (m) => {
      for (const c of wss.clients) c.send(JSON.stringify(m));
    };
    const shared = { "tournament-title": "FIXTURE CHAMPIONSHIP" };
    for (let i = 1; i <= 4; i++)
      shared["schedule-" + i] = JSON.stringify({
        show: true,
        time: "MATCH " + i + " · BO3",
        team1: "BLUE " + i,
        team2: "RED " + i,
        score1: "2",
        score2: "1",
        logo1: "Assets/Team/a.png",
        logo2: "Assets/Team/b.png",
        showCasters: i === 1,
        castersImg: i === 1 ? "Assets/casters.png" : "",
      });
    const themes = createRosterThemeStore({
        initial: { schemaVersion: 1, themeId: "studio", previousThemeId: null },
        persist: async () => {},
        onCommit: (s) => broadcast({ type: "roster_theme_update", ...s }),
      }),
      colors = await loadColorStore({
        file: path.join(dir, "colors.json"),
        onCommit: (s) => broadcast({ type: "broadcast_colors_update", ...s }),
      }),
      panel = createPanelStore({ persist: async () => {} });
    await panel.change(
      {
        action: "settings",
        settings: {
          durationSeconds: 90,
          label: "MATCH STARTS IN",
          headline: "THE NEXT CHAMPION",
          ticker: "FOLLOW THE TOURNAMENT",
        },
      },
      panel.snapshot().revision,
    );
    app.use(express.json());
    installRosterThemeRoutes(app, () => themes);
    installColorRoutes(app, () => colors);
    installPanelRoutes(app, () => panel);
    app.get("/api/schedule", (q, s) => s.json({}));
    app.get("/api/matchdata", (q, s) =>
      s.json(require("./fixtures").fixture()),
    );
    app.get("/api/scoreboard-branding", (q, s) =>
      s.json({
        data: {
          schemaVersion: 1,
          patchLabel: "",
          casterNames: "",
          logoFile: "00000000-0000-0000-0000-000000000002.png",
        },
        revision: '"branding"',
      }),
    );
    let sponsorLogos = [];
    app.get("/api/broadcast-sponsors", (q, s) =>
      s.json({
        data: {
          schemaVersion: 1,
          enabled: true,
          intervalSeconds: 5,
          logos: sponsorLogos,
        },
        revision: '"sponsors"',
      }),
    );
    app.get(/^\/Assets\/(?!Font\/)/, (q, s) =>
      s
        .type("svg")
        .send(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="teal"/></svg>',
        ),
    );
    app.use(express.static(path.join(__dirname, "../public")));
    wss.on("connection", (s) =>
      s.send(JSON.stringify({ type: "init", data: shared })),
    );
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
      args: ["--no-sandbox"],
    });
    t.after(async () => {
      await browser.close();
      for (const c of wss.clients) c.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      await fs.rm(dir, { recursive: true, force: true });
    });
    const ctx = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      }),
      page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const base = "http://127.0.0.1:" + server.address().port;
    await page.goto(base + "/scheduledisplay.html");
    await page.waitForFunction(
      () =>
        document.body.dataset.scheduleReady === "true" &&
        document.querySelectorAll(".schedule-card").length === 4,
    );
    assert.equal(await page.locator("#schedule-timer").textContent(), "01:30");
    assert.equal(
      await page.locator("#schedule-footer").textContent(),
      "THE NEXT CHAMPION",
    );
    for (const id of ["classic", "arena", "studio"]) {
      await themes.select(id, themes.snapshot().revision, "schedule");
      await page.reload();
      await page.waitForFunction(
        (id) =>
          document.body.dataset.scheduleTheme === id &&
          document.body.dataset.scheduleReady === "true",
        id,
      );
      const slot = await page.locator("#schedule-video-window").boundingBox();
      const composition = await page.evaluate(() => ({
        videoX: document.getElementById("schedule-video-window").offsetLeft,
        scheduleX: document.querySelector(".schedule-sidebar").offsetLeft,
        columns: getComputedStyle(document.getElementById("schedule-cards"))
          .gridTemplateColumns,
      }));
      assert.equal(
        composition.videoX,
        { classic: 730, arena: 680, studio: 650 }[id],
      );
      assert.equal(
        composition.scheduleX,
        { classic: 50, arena: 20, studio: 30 }[id],
      );
      if (id === "arena")
        assert.equal(composition.columns.split(" ").length, 3);
      if (id === "arena") {
        assert.equal(
          slot.x + slot.width,
          1900,
          "video keeps a 20px right margin",
        );
        assert.equal(await page.locator("footer").isVisible(), false);
        const crawl = await page.locator("#schedule-ticker").boundingBox();
        const bottomRow = await page.locator(".schedule-sidebar").boundingBox();
        assert.equal(crawl.x, 20);
        assert.equal(crawl.width, 1880);
        assert.equal(crawl.x + crawl.width, 1900);
        assert.ok(crawl.y >= bottomRow.y + bottomRow.height);
        assert.ok(crawl.y + crawl.height <= 1080);
        const arenaGroups = await page
          .locator("#schedule-ticker-track span")
          .allTextContents();
        assert.equal(arenaGroups.length, 2);
        assert.equal(arenaGroups[0], arenaGroups[1]);
        assert.ok(
          await page
            .locator("#schedule-ticker-track span")
            .first()
            .evaluate(
              (e) =>
                e.getBoundingClientRect().width >=
                document
                  .getElementById("schedule-ticker")
                  .getBoundingClientRect().width,
            ),
          "each ticker group fills the wider Arena strip",
        );
        await page
          .locator("#schedule-ticker-track")
          .evaluate((e) => (window.arenaCrawl = e.getAnimations()[0]));
        await page.waitForTimeout(1100);
        assert.equal(
          await page
            .locator("#schedule-ticker-track")
            .evaluate(
              (e) =>
                !!window.arenaCrawl &&
                e.getAnimations()[0] === window.arenaCrawl,
            ),
          true,
        );
        const reflection = await page
          .locator(".schedule-header")
          .evaluate((e) => {
            const animation = e
              .getAnimations({ subtree: true })
              .find((a) => a.animationName === "arena-metal-reflection");
            animation.pause();
            animation.currentTime = 500;
            const first = getComputedStyle(e, "::after").transform;
            animation.currentTime = 1800;
            const second = getComputedStyle(e, "::after").transform;
            animation.play();
            return {
              first,
              second,
              pointer: getComputedStyle(e, "::after").pointerEvents,
            };
          });
        assert.notEqual(
          reflection.first,
          reflection.second,
          "metal reflection travels across the panel",
        );
        assert.equal(reflection.pointer, "none");
        assert.equal(
          await page
            .locator("#schedule-video-window")
            .evaluate((e) => e.getAnimations().length),
          0,
        );
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(
          await page
            .locator(".schedule-header")
            .evaluate((e) => getComputedStyle(e, "::after").animationName),
          "none",
        );
        await page.emulateMedia({ reducedMotion: "no-preference" });
        const casters = await page.locator("#schedule-talents").boundingBox();
        assert.ok(casters.x + casters.width < slot.x);
        assert.equal(casters.width, 620);
        assert.equal(
          await page.locator("#schedule-talents h2").textContent(),
          "CASTERS",
        );
        await page.waitForFunction(
          () =>
            document
              .querySelector(".schedule-card")
              ?.getAnimations()
              .some(
                (a) =>
                  a.playState === "running" &&
                  a.effect
                    .getKeyframes()
                    .some((f) => f.transform === "translateY(-50px)"),
              ),
          null,
          { timeout: 12000 },
        );
        const upward = await page.evaluate(() => ({
          delays: [...document.querySelectorAll(".schedule-card")].map(
            (e) =>
              e
                .getAnimations()
                .find((a) =>
                  a.effect
                    .getKeyframes()
                    .some((f) => f.transform === "translateY(-50px)"),
                )
                ?.effect.getTiming().delay,
          ),
          heading: document.getElementById("schedule-heading").getAnimations()
            .length,
        }));
        assert.deepEqual(upward.delays, [0, 200, 400]);
        assert.equal(upward.heading, 0);
        await page.waitForFunction(
          () =>
            document
              .querySelector(".schedule-card")
              ?.getAnimations()
              .some((a) =>
                a.effect
                  .getKeyframes()
                  .some((f) => f.transform === "translateY(50px)"),
              ),
          null,
          { timeout: 3000 },
        );
        await page.reload();
        await page.waitForFunction(
          () =>
            document.body.dataset.scheduleTheme === "arena" &&
            document.querySelectorAll(".schedule-card").length === 3,
        );
        assert.ok(
          await page
            .locator(".schedule-card")
            .evaluateAll((nodes) =>
              nodes.some((e) =>
                e
                  .getAnimations()
                  .some((a) =>
                    a.effect
                      .getKeyframes()
                      .some((f) => f.transform === "translateY(50px)"),
                  ),
              ),
            ),
          "initial Arena display also rises in",
        );
        for (const selector of [
          ".schedule-header",
          ".schedule-countdown",
          ".schedule-card",
          "#schedule-sponsor",
        ]) {
          assert.equal(
            await page
              .locator(selector)
              .first()
              .evaluate((e) => getComputedStyle(e).backgroundImage),
            "none",
            "stationary diagonal metallic highlight is removed",
          );
        }
      }

      assert.equal(
        slot.width,
        { classic: 1140, arena: 1220, studio: 1248 }[id],
      );
      assert.equal(
        await page
          .locator("#schedule-video-window")
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        "rgba(0, 0, 0, 0)",
      );
      assert.equal(
        await page
          .locator("#schedule-stage")
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        "rgba(0, 0, 0, 0)",
      );
      assert.equal(
        await page
          .locator("#schedule-stage")
          .evaluate((e) => getComputedStyle(e).backgroundImage),
        "none",
      );
      if (id !== "studio") {
        await page.waitForFunction(
          () => document.querySelectorAll(".schedule-card").length === 3,
        );
        if (id === "classic")
          assert.equal(
            await page
              .locator(".schedule-card")
              .first()
              .evaluate((e) => getComputedStyle(e).borderRadius),
            "0px",
          );
        if (id === "classic") {
          const cardPaint = await page
            .locator(".schedule-card")
            .first()
            .evaluate((e) => ({
              bg: getComputedStyle(e).backgroundColor,
              image: getComputedStyle(e).backgroundImage,
              team: getComputedStyle(e.querySelector(".schedule-team"))
                .flexDirection,
              score: getComputedStyle(e.querySelector(".schedule-score"))
                .fontSize,
            }));
          assert.notEqual(cardPaint.bg, "rgba(0, 0, 0, 0)");
          assert.equal(cardPaint.image, "none");
          assert.equal(cardPaint.team, "column");
          assert.equal(cardPaint.score, "78px");
          assert.equal(
            await page.locator(".schedule-series").first().textContent(),
            "BO3",
          );
          assert.equal(
            await page.locator(".schedule-meta").first().textContent(),
            "MATCH 1",
          );
          assert.equal(await page.locator(".schedule-watermark").count(), 6);
        }
        const cardBoxes = await page
          .locator(".schedule-card")
          .evaluateAll((nodes) =>
            nodes.map((n) => ({ x: n.offsetLeft, y: n.offsetTop })),
          );
        if (id === "arena") assert.equal(cardBoxes[0].y, cardBoxes[2].y);
        else assert.ok(cardBoxes[2].y > cardBoxes[0].y);
      }
      if (process.env.MLBB_CAPTURE_DIR) {
        await fs.mkdir(process.env.MLBB_CAPTURE_DIR, { recursive: true });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        await page.screenshot({
          path: path.join(
            process.env.MLBB_CAPTURE_DIR,
            "schedule-" + id + ".png",
          ),
          omitBackground: true,
        });
      }
    }
    await page.waitForFunction(() => {
      const img = document.getElementById("schedule-brand");
      return img.getAttribute("src") && img.complete && img.naturalWidth === 0;
    });
    await page.waitForTimeout(1100);
    assert.equal(
      await page.locator("#schedule-brand").isVisible(),
      false,
      "failed branding stays hidden across polling",
    );
    shared["schedule-1"] = JSON.stringify({
      ...JSON.parse(shared["schedule-1"]),
      team1: "EDITED <b> NAME",
      score1: "3",
    });
    broadcast({ type: "update", data: { "schedule-1": shared["schedule-1"] } });
    await page.waitForFunction(
      () =>
        document.querySelector(".schedule-team span")?.textContent ===
        "EDITED <b> NAME",
    );
    assert.equal(await page.locator(".schedule-team b").count(), 0);
    assert.ok(
      (await page.locator(".schedule-score").first().textContent()).startsWith(
        "3",
      ),
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector(".schedule-card")
          .getAnimations()
          .some(
            (a) =>
              a.playState === "running" &&
              a.effect
                .getKeyframes()
                .some((f) => f.transform === "translateX(-50px)"),
          ),
      null,
      { timeout: 12000 },
    );
    assert.equal(
      await page
        .locator("#schedule-timer")
        .evaluate((e) => e.getAnimations().length),
      0,
      "page pan does not animate the clock",
    );
    await page
      .locator("#schedule-casters")
      .waitFor({ state: "visible", timeout: 12000 });
    await page
      .locator(".schedule-card")
      .first()
      .waitFor({ state: "visible", timeout: 12000 });
    shared["schedule-5"] = JSON.stringify({
      show: true,
      team1: "BLUE 5",
      team2: "RED 5",
    });
    broadcast({ type: "update", data: { "schedule-5": shared["schedule-5"] } });
    await page.waitForFunction(
      () =>
        document
          .querySelector(".schedule-card")
          ?.getAnimations()
          .some(
            (a) =>
              a.playState === "running" &&
              a.effect
                .getKeyframes()
                .some((f) => f.transform === "translateX(-50px)"),
          ),
      null,
      { timeout: 12000 },
    );
    const sequence = await page.evaluate(() => ({
      delays: [...document.querySelectorAll(".schedule-card")].map(
        (e) => e.getAnimations()[0]?.effect.getTiming().delay,
      ),
      heading: document.getElementById("schedule-heading").getAnimations()
        .length,
    }));
    assert.deepEqual(sequence.delays, [0, 200, 400, 600]);
    assert.equal(
      sequence.heading,
      0,
      "schedule heading stays still between match pages",
    );

    await page.waitForFunction(
      () =>
        document
          .getElementById("schedule-cards")
          .textContent.includes("BLUE 5"),
      null,
      { timeout: 12000 },
    );
    await page
      .locator("#schedule-casters")
      .waitFor({ state: "visible", timeout: 18000 });
    await themes.select("classic", themes.snapshot().revision, "schedule");
    await page.reload();
    await page.waitForFunction(
      () => document.body.dataset.scheduleTheme === "classic",
    );
    sponsorLogos = [
      {
        file: "00000000-0000-0000-0000-000000000003.png",
        name: "Fixture partner",
      },
    ];
    broadcast({
      type: "broadcast_sponsors_update",
      data: { enabled: true, logos: sponsorLogos },
    });
    await page
      .locator("#schedule-casters")
      .waitFor({ state: "visible", timeout: 30000 });
    assert.equal(
      await page.locator("#schedule-talents h2").textContent(),
      "CASTERS",
    );
    assert.equal(await page.locator(".schedule-sidebar").isVisible(), false);
    assert.equal(await page.locator("#schedule-partners img").count(), 0);
    assert.equal(await page.locator("#schedule-sponsor").isVisible(), true);
    assert.ok(
      (await page.locator("#schedule-casters").getAttribute("src")).endsWith(
        "Assets/casters.png",
      ),
    );
    for (const selector of [
      "#schedule-video-window",
      "#schedule-sponsor",
      "footer",
    ]) {
      assert.equal(
        await page
          .locator(selector)
          .first()
          .evaluate((e) => getComputedStyle(e).borderRadius),
        "0px",
      );
    }
    assert.equal(await page.locator("#schedule-ticker").isVisible(), true);
    const classicGroups = await page
      .locator("#schedule-ticker-track span")
      .allTextContents();
    assert.equal(classicGroups.length, 2);
    assert.equal(classicGroups[0], classicGroups[1]);
    const footerBox = await page.locator("footer").boundingBox();
    const tickerBox = await page.locator("#schedule-ticker").boundingBox();
    assert.equal(footerBox.x, tickerBox.x);
    assert.ok(footerBox.y + footerBox.height < tickerBox.y);
    assert.ok(tickerBox.y + tickerBox.height <= 1080);
    await page
      .locator("#schedule-ticker-track")
      .evaluate((e) => (window.classicCrawl = e.getAnimations()[0]));
    await page.waitForTimeout(1100);
    assert.equal(
      await page
        .locator("#schedule-ticker-track")
        .evaluate(
          (e) =>
            !!window.classicCrawl &&
            e.getAnimations()[0] === window.classicCrawl,
        ),
      true,
    );
    await themes.select("studio", themes.snapshot().revision, "schedule");
    await page.reload();
    await page.waitForFunction(
      () =>
        document.body.dataset.scheduleTheme === "studio" &&
        !document.getElementById("schedule-sponsor").hidden,
    );
    assert.equal(await page.locator("#schedule-sponsor").isVisible(), true);
    assert.ok(
      (
        await page.locator("#schedule-sponsor-logo").getAttribute("src")
      ).endsWith(sponsorLogos[0].file),
    );
    const groups = await page
      .locator("#schedule-ticker-track span")
      .allTextContents();
    assert.equal(groups.length, 2);
    assert.equal(groups[0], groups[1]);
    const animation = await page
      .locator("#schedule-ticker-track")
      .evaluate((e) => {
        window.fixtureCrawl = e.getAnimations()[0];
        return !!window.fixtureCrawl;
      });
    assert.equal(animation, true);
    await page.waitForTimeout(1200);
    assert.equal(
      await page
        .locator("#schedule-ticker-track")
        .evaluate((e) => e.getAnimations()[0] === window.fixtureCrawl),
      true,
      "polling preserves crawl animation",
    );
    const admin = await ctx.newPage();
    admin.on("pageerror", (e) => errors.push(e.message));
    await admin.goto(base + "/broadcast-themes.html");
    await admin.locator("#preview-output").selectOption("schedule");
    await admin.waitForFunction(() =>
      document
        .getElementById("theme-status")
        .textContent.startsWith("Preview ready"),
    );
    assert.equal(
      await admin.locator("#color-scope").textContent(),
      "Studio · Schedule",
    );
    await admin.locator("[data-theme-id=arena]").click();
    await admin.waitForFunction(
      () => !document.getElementById("activate-theme").disabled,
    );
    await admin.locator("#activate-theme").click();
    await admin.waitForFunction(() =>
      document
        .getElementById("theme-status")
        .textContent.includes("selection saved"),
    );
    assert.equal(themes.snapshot().data.selections.roster.themeId, "studio");
    assert.equal(themes.snapshot().data.selections.schedule.themeId, "arena");
    await admin.locator("#color-hex-left").fill("#cc44aa");
    await admin.locator("#save-colors").click();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.body).getPropertyValue("--sc-left").trim() ===
        "#cc44aa",
    );
    assert.deepEqual(colors.snapshot().data.palettes.arena.schedule, {
      left: "#cc44aa",
    });
    assert.equal(colors.snapshot().data.palettes.arena.scoreboard, undefined);
    await colors.save(
      "studio",
      "schedule",
      {
        background: "#123456",
        left: "#aa22cc",
        right: "#22aa44",
        text: "#fefefe",
        muted: "#bbccdd",
        border: "#dd8822",
      },
      colors.snapshot().revision,
    );
    await themes.select("studio", themes.snapshot().revision, "schedule");
    await page.reload();
    await page.waitForFunction(
      () =>
        document.body.dataset.scheduleTheme === "studio" &&
        getComputedStyle(document.body).getPropertyValue("--sc-left").trim() ===
          "#aa22cc",
    );
    const paints = await page.evaluate(() => {
      const style = (id) => getComputedStyle(document.querySelector(id));
      return {
        canvas: style("#schedule-stage").backgroundColor,
        canvasImage: style("#schedule-stage").backgroundImage,
        decoration: getComputedStyle(
          document.querySelector("#schedule-stage"),
          "::before",
        ).display,
        left: style(".schedule-team:first-child").backgroundImage,
        right: style(".schedule-team:last-child").backgroundImage,
        gold: style("#schedule-heading").backgroundImage,
        timer: style("#schedule-timer").color,
        muted: style("#schedule-timer-label").color,
        sponsor: style("#schedule-sponsor").backgroundImage,
        frame: style("#schedule-video-window").borderTopColor,
      };
    });
    assert.equal(paints.canvas, "rgba(0, 0, 0, 0)");
    assert.equal(paints.canvasImage, "none");
    assert.equal(paints.decoration, "none");
    assert.ok(paints.left.includes("170, 34, 204"));
    assert.ok(paints.right.includes("34, 170, 68"));
    assert.ok(paints.gold.includes("221, 136, 34"));
    assert.equal(paints.timer, "rgb(254, 254, 254)");
    assert.equal(paints.muted, "rgb(187, 204, 221)");
    assert.ok(paints.sponsor.includes("18, 52, 86"));
    assert.equal(paints.frame, "rgb(221, 136, 34)");
    assert.deepEqual(errors, []);
  },
);
