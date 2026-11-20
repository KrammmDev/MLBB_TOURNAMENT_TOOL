"use strict";
// ADB is intentionally exposed only to requests originating on the server PC.
// No shell, input injection, device writes, or unbounded screenshot queue.
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);
const binary = process.env.ADB_PATH || "adb";
const MAX_FRAME_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_BYTES = 64 * 1024;

function local(req) {
  const address = req.socket.remoteAddress || "";
  if (!(address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1")) return false;
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    const source = new URL(origin);
    return (source.hostname === "localhost" || source.hostname === "127.0.0.1" || source.hostname === "[::1]") &&
      source.host === req.headers.host;
  } catch { return false; }
}
function validSerial(serial) {
  return typeof serial === "string" && /^[a-zA-Z0-9_][a-zA-Z0-9._:-]{0,127}$/.test(serial);
}
function listDevices(output) {
  return output.split(/\r?\n/).slice(1).map(line => {
    const match = line.trim().match(/^([^\s]+)\s+(device|unauthorized|offline)(?:\s|$)/);
    return match ? { serial: match[1], status: match[2] } : null;
  }).filter(Boolean);
}
function createADBCapture({ run = exec, adb = binary } = {}) {
  let busy = false;
  let lastCaptureAt = 0;
  async function command(args, timeout = 5000, maxBuffer = MAX_TEXT_BYTES, encoding = "utf8") {
    return run(adb, args, { timeout, maxBuffer, encoding, windowsHide: true });
  }
  async function devices() {
    const result = await command(["devices", "-l"]);
    return listDevices(String(result.stdout));
  }
  async function capture(serial) {
    if (!validSerial(serial)) throw Object.assign(new Error("Select a valid ADB device"), { status: 400 });
    if (busy) throw Object.assign(new Error("ADB capture busy; retry next frame"), { status: 429 });
    busy = true;
    try {
      const connected = await devices();
      if (!connected.some(d => d.serial === serial && d.status === "device"))
        throw Object.assign(new Error("ADB device disconnected or not authorized"), { status: 409 });
      const { stdout } = await command(["-s", serial, "exec-out", "screencap", "-p"], 8000, MAX_FRAME_BYTES, "buffer");
      const png = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, "binary");
      if (png.length < 24 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
        throw Object.assign(new Error("ADB returned an invalid PNG"), { status: 502 });
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      if (width < 320 || height < 180 || width > 7680 || height > 4320)
        throw Object.assign(new Error("Unsupported ADB frame dimensions"), { status: 502 });
      lastCaptureAt = Date.now();
      return { png, width, height, capturedAt: lastCaptureAt };
    } finally {
      busy = false;
    }
  }
  return { devices, capture, state: () => ({ busy, lastCaptureAt }) };
}
function installADBRoutes(app, service = createADBCapture()) {
  const restrict = (req, res, next) => local(req) ? next() : res.status(403).json({ message: "ADB capture is restricted to localhost" });
  app.get("/api/adb/devices", restrict, async (req, res) => {
    try { res.json({ devices: await service.devices() }); }
    catch (e) { res.status(503).json({ message: "ADB unavailable. Install Platform Tools or configure ADB_PATH." }); }
  });
  app.get("/api/adb/frame", restrict, async (req, res) => {
    try {
      const frame = await service.capture(req.query.serial);
      res.set("Cache-Control", "no-store");
      res.set("X-ADB-Width", String(frame.width));
      res.set("X-ADB-Height", String(frame.height));
      res.type("png").send(frame.png);
    } catch (e) {
      res.status(e.status || 503).json({ message: e.status ? e.message : "ADB capture failed. Check device connection." });
    }
  });
  return service;
}
module.exports = { createADBCapture, installADBRoutes, listDevices, validSerial, local };
