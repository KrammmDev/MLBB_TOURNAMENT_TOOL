"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const express = require("express"),
  { chromium } = require("playwright"),
  { WebSocketServer } = require("ws"),
  { fixture } = require("./fixtures");
const { createUSBCapture, installUSBRoutes } = require("../lib/usb-capture"),
  { loadOCRStore, installOCRRoutes } = require("../lib/ocr-store");
test(
  "USB phone → native calibration → live paired gold → unplug, with no OBS or camera access",
  { timeout: 60000 },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "usb-browser-")),
      app = express(),
      server = http.createServer(app),
      wss = new WebSocketServer({ server });
    const browser = await chromium.launch({
      executablePath: process.env.MLBB_TEST_BROWSER || undefined,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 1000 },
      }),
      panel = await context.newPage(),
      errors = [],
      writes = [],
      commands = [];
    panel.on("pageerror", (e) => errors.push(e.message));
    const png = Buffer.from(
      await panel.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 1920;
        c.height = 1080;
        const x = c.getContext("2d");
        x.fillStyle = "white";
        x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = "black";
        x.font = "bold 38px Arial";
        x.fillText("50.5k", 200, 45);
        x.fillText("49.0k", 1300, 45);
        return c.toDataURL().split(",")[1];
      }),
      "base64",
    );
    let store,
      badRed = false,
      unplugged = false,
      index = 0;
    const usb = createUSBCapture({
      onStop: (id) => store?.usbStopped(id),
      run: async (args) => {
        commands.push(args);
        if (args[0] === "devices")
          return Buffer.from(
            "List of devices attached\nPHONE1 device usb:1 model:Android_Test\nPHONE2 unauthorized usb:2 model:Other_Phone\n",
          );
        if (unplugged)
          throw Object.assign(Error("Phone disconnected. Reconnect USB."), {
            status: 503,
          });
        return png;
      },
    });
    const data = fixture(),
      before = JSON.stringify(data);
    store = await loadOCRStore({
      file: path.join(directory, "ocr.json"),
      getMatch: () => data,
      usb,
      engine: {
        recognize: async () => {
          const red = index++ % 2 === 1;
          return {
            rawText: red ? (badRed ? "" : "49.0k") : badRed ? "50.6k" : "50.5k",
            score: 99,
          };
        },
      },
      onChange: (state) => {
        for (const client of wss.clients)
          client.send(JSON.stringify({ type: "ocr_update", data: state }));
      },
    });
    app.use(express.json({ limit: "20mb" }));
    app.use((req, res, next) => {
      if (req.method !== "GET") writes.push(req.path);
      next();
    });
    installUSBRoutes(app, () => usb);
    installOCRRoutes(app, () => store);
    app.get("/api/matchdata", (req, res) => res.json(data));
    app.use(express.static(path.join(__dirname, "../public")));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
      await browser.close();
      usb.close();
      await store.close();
      for (const client of wss.clients) client.terminate();
      await new Promise((r) => wss.close(r));
      await new Promise((r) => server.close(r));
      await fs.rm(directory, { recursive: true, force: true });
    });
    await context.route("https://fonts.googleapis.com/**", (r) =>
      r.fulfill({ body: "" }),
    );
    await context.route("http://localhost:14337/MLBB.json", (r) =>
      r.fulfill({ json: {}, headers: { "Access-Control-Allow-Origin": "*" } }),
    );
    await panel.addInitScript(() => {
      window.cameraCalls = 0;
      if (navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async () => {
          window.cameraCalls++;
          throw Error("USB should not use a browser camera");
        };
    });
    await panel.goto(origin + "/ocr-control.html");
    await panel.locator("#usb-detect").click();
    await panel.waitForFunction(
      () => document.querySelector("#usb-device").value === "PHONE1",
    );
    assert.equal(
      await panel
        .locator('#usb-device option[value="PHONE2"]')
        .evaluate((option) => option.disabled),
      true,
    );
    await panel.locator("#usb-start").click();
    await panel.waitForFunction(() =>
      document
        .querySelector("#capture-info")
        .textContent.includes("USB ADB • native 1920"),
    );
    async function region(field, x) {
      await panel.locator("#field").selectOption(field);
      await panel.locator("#preview").scrollIntoViewIfNeeded();
      const b = await panel.locator("#preview").boundingBox();
      await panel.mouse.move(
        b.x + (x / 1920) * b.width,
        b.y + (3 / 1080) * b.height,
      );
      await panel.mouse.down();
      await panel.mouse.move(
        b.x + ((x + 150) / 1920) * b.width,
        b.y + (60 / 1080) * b.height,
      );
      await panel.mouse.up();
    }
    await region("blueGold", 195);
    await region("redGold", 1295);
    await panel.locator("#save").click();
    await panel.waitForFunction(() =>
      document
        .querySelector("#message")
        .textContent.includes("Calibration saved"),
    );
    assert.equal(store.settings().data.profile.reference.kind, "usb");
    await panel.locator("#start").click();
    await panel.waitForFunction(
      () =>
        document.querySelector('tr[data-field="redGold"] [data-key="accepted"]')
          .textContent === "49.0K",
    );
    assert.equal(store.state().fields.blueGold.value, null);
    const overlay = await context.newPage();
    overlay.on("pageerror", (e) => errors.push(e.message));
    await overlay.goto(origin + "/scoreboardocr.html");
    await panel.locator("#live").click();
    await overlay.waitForFunction(
      () =>
        document.querySelector("#bluegold").textContent === "50.5K" &&
        !document.querySelector("#goldLead").hidden,
    );
    assert.equal(
      await overlay.locator("#goldleadValue").textContent(),
      "+1.5K",
    );
    badRed = true;
    await overlay.waitForFunction(
      () =>
        document.querySelector("#bluegold").textContent === "50.6K" &&
        document.querySelector("#goldLead").hidden,
    );
    assert.equal(
      store.state().fields.redGold.accepted,
      49000,
      "old individual value may remain briefly, but mixed-frame lead is hidden",
    );
    unplugged = true;
    await panel.waitForFunction(() =>
      document
        .querySelector("#message")
        .textContent.includes("Phone disconnected"),
    );
    assert.equal(store.state().active, false);
    await overlay.waitForFunction(
      () => document.querySelector("#bluegold").textContent === "--",
    );
    assert.equal(await panel.evaluate(() => window.cameraCalls), 0);
    assert.ok(
      commands.some((c) => c.join(" ") === "-s PHONE1 exec-out screencap -p"),
    );
    assert.ok(writes.every((p) => p.startsWith("/api/ocr/")));
    assert.equal(JSON.stringify(data), before);
    assert.deepEqual(errors, []);
  },
);
