"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  { spawn } = require("node:child_process"),
  http = require("node:http"),
  express = require("express");
const {
  createADBRunner,
  createUSBCapture,
  installUSBRoutes,
  parseDevices,
  pngSize,
} = require("../lib/usb-capture");
function png(width = 1920, height = 1080) {
  const p = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(p);
  p.write("IHDR", 12);
  p.writeUInt32BE(width, 16);
  p.writeUInt32BE(height, 20);
  return p;
}
const listing = (state) =>
  Buffer.from(
    `List of devices attached\nPHONE1 ${state} usb:1-2 product:test model:Android_Test transport_id:1\n`,
  );
test("device discovery excludes emulator/network entries and preserves authorization states", () => {
  assert.deepEqual(parseDevices(listing("device").toString()), [
    { serial: "PHONE1", state: "device", model: "Android Test" },
  ]);
  assert.equal(
    parseDevices(
      "emulator-5554 device\n192.168.1.2:5555 device\nmalicious;command device\n",
    ).length,
    0,
  );
  assert.equal(
    parseDevices(listing("unauthorized").toString())[0].state,
    "unauthorized",
  );
  assert.throws(() => pngSize(Buffer.from("bad")), /valid PNG/);
});
test("USB capture binds one device, bounds batches, rejects rotations and expires leases", async (t) => {
  let clock = 100000,
    state = "unauthorized",
    width = 1920,
    stopped = 0,
    calls = [];
  const capture = createUSBCapture({
    now: () => clock,
    onStop: () => stopped++,
    run: async (args) => {
      calls.push(args);
      return args[0] === "devices" ? listing(state) : png(width);
    },
  });
  t.after(() => capture.close());
  const detect = await capture.devices();
  await assert.rejects(
    capture.start({ serial: "PHONE1", generation: detect.generation }),
    /Allow USB debugging/,
  );
  state = "device";
  await assert.rejects(
    capture.start({
      serial: "not-found",
      generation: capture.status().generation,
    }),
    /not found/,
  );
  const session = await capture.start({
    serial: "PHONE1",
    generation: capture.status().generation,
  });
  assert.equal(capture.owns(session.captureId, "PHONE1"), true);
  const frame = await capture.frame(session.captureId);
  assert.equal(frame.width, 1920);
  assert.equal(frame.capturedAt, clock);
  assert.equal(frame.frameId, 1);
  assert.deepEqual(calls.at(-1), [
    "-s",
    "PHONE1",
    "exec-out",
    "screencap",
    "-p",
  ]);
  await assert.rejects(capture.frame("old"), /expired/);
  await assert.rejects(
    capture.start({ serial: "PHONE1", generation: session.generation }),
    /already in use/,
  );
  width = 1080;
  await assert.rejects(capture.frame(session.captureId), /rotation/);
  assert.equal(capture.status().active, false);
  assert.equal(stopped, 1);
  const next = await capture.start({
    serial: "PHONE1",
    generation: capture.status().generation,
  });
  clock += 15001;
  assert.equal(capture.owns(next.captureId, "PHONE1"), false);
  assert.equal(stopped, 2);
});
test("delayed/cancelled/slow USB frames never escape into the next capture", async (t) => {
  let clock = 100000,
    resolveFrame;
  const capture = createUSBCapture({
    now: () => clock,
    run: async (args) =>
      args[0] === "devices"
        ? listing("device")
        : new Promise((resolve) => {
            resolveFrame = resolve;
          }),
  });
  t.after(() => capture.close());
  const source = await capture.start({
      serial: "PHONE1",
      generation: capture.status().generation,
    }),
    reading = capture.frame(source.captureId);
  await assert.rejects(capture.frame(source.captureId), /busy/);
  capture.stop(source.captureId);
  resolveFrame(png());
  await assert.rejects(reading, /expired/);
  const next = await capture.start({
      serial: "PHONE1",
      generation: capture.status().generation,
    }),
    slow = capture.frame(next.captureId);
  clock += 4001;
  resolveFrame(png());
  await assert.rejects(slow, /stale frame/);
  assert.equal(capture.status().active, false);
});
test("ADB runner preserves binary PNG bytes, uses argv, and bounds process failures", async () => {
  const expected = Buffer.concat([png(), Buffer.from([13, 10, 0, 255])]);
  let invocation;
  const run = createADBRunner({
    executable: "adb.exe",
    spawnProcess: (file, args, options) => {
      invocation = { file, args, options };
      return spawn(
        process.execPath,
        [
          "-e",
          `process.stdout.write(Buffer.from('${expected.toString("base64")}','base64'))`,
        ],
        options,
      );
    },
  });
  assert.deepEqual(
    await run(["-s", "PHONE1", "exec-out", "screencap", "-p"]),
    expected,
  );
  assert.equal(invocation.options.shell, false);
  assert.deepEqual(invocation.args.slice(0, 4), [
    "-H",
    "127.0.0.1",
    "-P",
    "5037",
  ]);
  await assert.rejects(
    createADBRunner({ executable: "/tmp/missing-mlbb-adb" })(["devices", "-l"]),
    /ADB not found/,
  );
  const hang = (options) =>
    createADBRunner({
      ...options,
      spawnProcess: (_file, _args, opts) =>
        spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], opts),
    });
  await assert.rejects(hang({ timeoutMs: 30 })(["devices", "-l"]), /timed out/);
  const controller = new AbortController(),
    pending = hang({ timeoutMs: 1000 })(["devices", "-l"], controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  const overflow = createADBRunner({
    maxBytes: 10,
    spawnProcess: (_file, _args, opts) =>
      spawn(
        process.execPath,
        ["-e", "process.stdout.write(Buffer.alloc(1000))"],
        opts,
      ),
  });
  await assert.rejects(overflow(["devices", "-l"]), /size limit/);
  const closing = hang({ timeoutMs: 1000 }),
    pendingClose = closing(["devices", "-l"]);
  closing.close();
  await assert.rejects(pendingClose, /ADB failed/);
  await assert.rejects(closing(["devices", "-l"]), /closed/);
});
test("USB HTTP access is local/same-origin and provides no arbitrary command endpoint", async (t) => {
  let calls = 0;
  const c = createUSBCapture({
      run: async () => {
        calls++;
        return listing("device");
      },
    }),
    app = express(),
    server = http.createServer(app);
  app.use(express.json());
  installUSBRoutes(app, () => c);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    c.close();
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (
      await fetch(base + "/api/ocr/usb/devices", {
        headers: { origin: "https://other.example" },
      })
    ).status,
    403,
  );
  assert.equal(calls, 0);
  const nonLocalHost = await new Promise((resolve, reject) => {
    http
      .get(
        base + "/api/ocr/usb/devices",
        { headers: { host: "192.168.1.10:3000" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(nonLocalHost, 403);
  const detected = await (await fetch(base + "/api/ocr/usb/devices")).json();
  assert.equal(detected.devices[0].serial, "PHONE1");
  const start = await (
    await fetch(base + "/api/ocr/usb/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serial: "PHONE1",
        generation: detected.generation,
      }),
    })
  ).json();
  const frame = await fetch(base + "/api/ocr/usb/frame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ captureId: start.captureId }),
  });
  // Fake runner returned listing instead of PNG: fail closed, never send fake pixels.
  assert.equal(frame.status, 502);
  assert.equal(c.status().active, false);
});
