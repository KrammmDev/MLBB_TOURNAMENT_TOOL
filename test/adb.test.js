"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createADBCapture, listDevices, validSerial, local } = require("../lib/adb-capture");

function screenshot(width = 2400, height = 1080) {
  const data = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(data);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}
test("ADB device listing preserves authorization status", () => {
  assert.deepEqual(listDevices("List of devices attached\n93d2c5a7 device product:sapphire\nother unauthorized transport_id:2\n"), [
    { serial: "93d2c5a7", status: "device" },
    { serial: "other", status: "unauthorized" },
  ]);
  assert.equal(validSerial("93d2c5a7"), true);
  assert.equal(validSerial("-s bad; echo x"), false);
});
test("ADB routes reject nonloopback request addresses", () => {
  assert.equal(local({ socket: { remoteAddress: "::1" } }), true);
  assert.equal(local({ socket: { remoteAddress: "::ffff:127.0.0.1" } }), true);
  assert.equal(local({ socket: { remoteAddress: "192.168.1.5" } }), false);
});
test("Capture validates authorized device, PNG and landscape resolution", async () => {
  const calls = [];
  const service = createADBCapture({ run: async (_bin, args) => {
    calls.push(args);
    return args[0] === "devices"
      ? { stdout: "List of devices attached\n93d2c5a7 device product:sapphire\n" }
      : { stdout: screenshot() };
  } });
  const frame = await service.capture("93d2c5a7");
  assert.equal(frame.width, 2400);
  assert.equal(frame.height, 1080);
  assert.deepEqual(calls[1], ["-s", "93d2c5a7", "exec-out", "screencap", "-p"]);
  await assert.rejects(service.capture("bad;arg"), /Select a valid ADB device/);
});
test("Unauthorized device cannot capture frames", async () => {
  const service = createADBCapture({ run: async () =>
    ({ stdout: "List of devices attached\n93d2c5a7 unauthorized\n" }) });
  await assert.rejects(service.capture("93d2c5a7"), /disconnected or not authorized/);
});
test("Invalid screenshot is rejected and busy state always resets", async () => {
  let invalid = true;
  const service = createADBCapture({ run: async (_bin, args) =>
    args[0] === "devices"
      ? { stdout: "List of devices attached\nserial device\n" }
      : { stdout: invalid ? Buffer.alloc(24) : screenshot() },
  });
  await assert.rejects(service.capture("serial"), /invalid PNG/);
  assert.equal(service.state().busy, false);
  invalid = false;
  assert.equal((await service.capture("serial")).width, 2400);
});
test("Overlapping capture is rejected rather than queued", async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const service = createADBCapture({ run: async (_bin, args) =>
    args[0] === "devices"
      ? { stdout: "List of devices attached\nserial device\n" }
      : (await held, { stdout: screenshot() }),
  });
  const first = service.capture("serial");
  await assert.rejects(service.capture("serial"), /busy/);
  release();
  await first;
  assert.equal(service.state().busy, false);
});
