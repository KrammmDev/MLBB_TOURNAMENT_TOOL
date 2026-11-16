"use strict";
const { spawn } = require("node:child_process"),
  { randomUUID } = require("node:crypto"),
  fs = require("node:fs"),
  path = require("node:path");
const failure = (status, message) =>
  Object.assign(new Error(message), { status });
function adbPath(root = path.join(__dirname, "..")) {
  if (process.env.MLBB_ADB_PATH) return process.env.MLBB_ADB_PATH;
  const bundled = path.join(
    root,
    "tools",
    "platform-tools",
    process.platform === "win32" ? "adb.exe" : "adb",
  );
  return fs.existsSync(bundled) ? bundled : "adb";
}
// Fixed argv only; no shell, user-supplied commands, APK install or global kill-server.
function createADBRunner({
  executable = adbPath(),
  spawnProcess = spawn,
  timeoutMs = 8000,
  maxBytes = 32 * 1024 * 1024,
} = {}) {
  const children = new Set();
  let closed = false;
  const run = (args, signal) =>
    new Promise((resolve, reject) => {
      if (closed) return reject(failure(503, "ADB runner is closed"));
      if (signal?.aborted) return reject(failure(409, "USB capture cancelled"));
      let child,
        chunks = [],
        bytes = 0,
        stderr = "",
        error,
        settled = false;
      const finish = (problem, output) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        problem ? reject(problem) : resolve(output);
      };
      const abort = () => {
        error = failure(409, "USB capture cancelled");
        child?.kill();
      };
      const timeout = setTimeout(() => {
        error = failure(
          504,
          "ADB capture timed out. Check the USB cable, unlocked phone and debugging authorization.",
        );
        child?.kill();
      }, timeoutMs);
      try {
        child = spawnProcess(
          executable,
          ["-H", "127.0.0.1", "-P", "5037", ...args],
          {
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
      } catch (e) {
        finish(failure(503, `Cannot start ADB: ${e.message}`));
        return;
      }
      children.add(child);
      child.once("close", () => children.delete(child));
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          error = failure(413, "ADB frame exceeds the capture size limit");
          child.kill();
        } else chunks.push(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-1200);
      });
      child.once("error", (e) =>
        finish(
          failure(
            503,
            e.code === "ENOENT"
              ? "ADB not found. Extract Android Platform Tools into tools/platform-tools, or set MLBB_ADB_PATH to adb.exe, then restart the server."
              : `Cannot run ADB (${e.code || "process error"}). Check Platform Tools and USB drivers.`,
          ),
        ),
      );
      child.once("close", (code) =>
        finish(
          error ||
            (code !== 0
              ? failure(
                  503,
                  `ADB failed. Check phone authorization/connection. ${stderr.trim()}`,
                )
              : null),
          Buffer.concat(chunks),
        ),
      );
    });
  run.close = () => {
    closed = true;
    for (const child of children) child.kill();
  };
  return run;
}
function parseDevices(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const m =
      /^([A-Za-z0-9._-]{1,128})\s+(device|unauthorized|offline|recovery|sideload|no permissions)\b(.*)$/.exec(
        line.trim(),
      );
    if (!m || m[1].startsWith("emulator-") || m[1].includes("_adb-tls-"))
      return [];
    const model =
      /\bmodel:(\S+)/.exec(m[3])?.[1]?.replace(/_/g, " ") || "Android device";
    return [{ serial: m[1], state: m[2], model }];
  });
}
function pngSize(png) {
  if (
    !Buffer.isBuffer(png) ||
    png.length < 33 ||
    png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    png.toString("ascii", 12, 16) !== "IHDR"
  )
    throw failure(
      502,
      "Android returned no valid PNG. Unlock the phone and verify screen capture is available.",
    );
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  if (
    width < 180 ||
    height < 180 ||
    width > 7680 ||
    height > 4320 ||
    width * height > 33177600
  )
    throw failure(422, "Unsupported USB screen dimensions");
  return { width, height };
}
function createUSBCapture({
  run = createADBRunner(),
  now = Date.now,
  onStop = () => {},
} = {}) {
  let active = null,
    generation = randomUUID(),
    busy = false,
    closed = false;
  function clear() {
    const old = active;
    active = null;
    generation = randomUUID();
    old?.controller?.abort();
    if (old) onStop(old.id);
  }
  function check() {
    if (active && now() - active.lastRequest > 15000) clear();
  }
  function status() {
    check();
    return { generation, active: Boolean(active), busy, transport: "adb-png" };
  }
  function own(id) {
    check();
    if (!active || active.id !== id)
      throw failure(
        409,
        "USB capture expired. Detect the phone and start USB capture again.",
      );
    return active;
  }
  async function exclusive(action) {
    if (closed) throw failure(503, "USB capture is closed");
    if (busy)
      throw failure(429, "ADB is busy. Wait for the current operation.");
    busy = true;
    try {
      return await action();
    } finally {
      busy = false;
    }
  }
  async function devices() {
    return exclusive(async () => ({
      ...status(),
      devices: parseDevices((await run(["devices", "-l"])).toString("utf8")),
    }));
  }
  async function start(body) {
    return exclusive(async () => {
      check();
      if (body?.generation !== generation)
        throw failure(409, "USB state changed. Detect devices again.");
      if (active)
        throw failure(
          409,
          "USB capture is already in use. Disconnect its capture panel first, or wait for its lease to expire.",
        );
      const before = generation;
      const found = parseDevices(
        (await run(["devices", "-l"])).toString("utf8"),
      ).find((d) => d.serial === body.serial);
      if (before !== generation)
        throw failure(409, "USB state changed during detection");
      if (!found)
        throw failure(
          404,
          "Phone not found. Use a USB data cable and enable USB debugging.",
        );
      if (found.state !== "device")
        throw failure(
          409,
          found.state === "unauthorized"
            ? "Unlock the phone and tap Allow USB debugging, then Detect phones again."
            : `Phone is ${found.state}. Reconnect the USB cable and authorize debugging.`,
        );
      active = {
        id: randomUUID(),
        serial: found.serial,
        lastRequest: now(),
        sequence: 0,
        size: null,
      };
      generation = randomUUID();
      return {
        captureId: active.id,
        serial: found.serial,
        model: found.model,
        ...status(),
      };
    });
  }
  async function frame(id) {
    return exclusive(async () => {
      const source = own(id),
        capturedAt = now();
      source.lastRequest = now();
      source.controller = new AbortController();
      try {
        const png = await run(
          ["-s", source.serial, "exec-out", "screencap", "-p"],
          source.controller.signal,
        );
        own(id);
        if (now() - capturedAt > 4000)
          throw failure(
            504,
            "USB screenshot took over four seconds; stale frame discarded. Check USB speed or reduce phone display resolution, then restart capture.",
          );
        const size = pngSize(png);
        if (
          source.size &&
          (source.size.width !== size.width ||
            source.size.height !== size.height)
        )
          throw failure(
            409,
            "Phone rotation/resolution changed. Start USB capture again and recalibrate.",
          );
        source.size = size;
        return {
          png,
          ...size,
          capturedAt,
          frameId: ++source.sequence,
          latencyMs: now() - capturedAt,
        };
      } catch (error) {
        if (active === source) clear();
        throw error;
      } finally {
        source.controller = null;
      }
    });
  }
  const lease = setInterval(check, 5000);
  lease.unref?.();
  return {
    status,
    devices,
    start,
    frame,
    owns(id, serial) {
      check();
      return Boolean(active && active.id === id && active.serial === serial);
    },
    stop(id) {
      own(id);
      clear();
      return status();
    },
    close() {
      closed = true;
      clearInterval(lease);
      clear();
      run.close?.();
    },
  };
}
function installUSBRoutes(app, getCapture) {
  // USB belongs to the server PC. Never expose device commands or screenshots to LAN viewers.
  app.use("/api/ocr/usb", (req, res, next) => {
    const ip = req.socket.remoteAddress,
      loopback =
        ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    const host = req.get("host") || "",
      origin = req.get("origin");
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
    if (
      !loopback ||
      !localHost ||
      (origin && origin !== `${req.protocol}://${host}`) ||
      req.get("sec-fetch-site") === "cross-site"
    )
      return res.status(403).json({
        message:
          "Open the USB capture panel at http://localhost:3000/ocr-control.html on the PC connected to the phone.",
      });
    res.set("Cache-Control", "no-store");
    next();
  });
  const send = (handler) => async (req, res) => {
    try {
      const value = await handler(getCapture(), req);
      if (value.png)
        res
          .set({
            "Content-Type": "image/png",
            "X-USB-Captured-At": String(value.capturedAt),
            "X-USB-Frame-Id": String(value.frameId),
            "X-USB-Latency-Ms": String(value.latencyMs),
          })
          .send(value.png);
      else res.json(value);
    } catch (e) {
      res
        .status(e.status || 500)
        .json({ message: e.status ? e.message : "USB capture failed" });
    }
  };
  app.get(
    "/api/ocr/usb/devices",
    send((c) => c.devices()),
  );
  app.post(
    "/api/ocr/usb/start",
    send((c, r) => c.start(r.body)),
  );
  app.post(
    "/api/ocr/usb/frame",
    send((c, r) => c.frame(r.body?.captureId)),
  );
  app.post(
    "/api/ocr/usb/stop",
    send((c, r) => c.stop(r.body?.captureId)),
  );
}
module.exports = {
  adbPath,
  createADBRunner,
  parseDevices,
  pngSize,
  createUSBCapture,
  installUSBRoutes,
};
