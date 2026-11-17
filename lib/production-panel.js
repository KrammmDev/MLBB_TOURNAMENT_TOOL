"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { atomicWrite } = require("./match-store");
const timer = require("../public/script/production-timer-model");
const defaults = () => ({
  schemaVersion: 1,
  mode: "countdown",
  durationSeconds: 300,
  format: "%0m:%0s",
  endText: "STARTING SOON",
  label: "SHOW STARTS IN",
  headline: "",
  ticker: "",
  tickerSeconds: 25,
  showSponsors: true,
  showTicker: true,
  background: "#101820",
  text: "#ffffff",
  accent: "#5ed7ef",
  valueMs: 300000,
  startedAt: null,
  running: false,
});
const settings = [
  "mode",
  "durationSeconds",
  "format",
  "endText",
  "label",
  "headline",
  "ticker",
  "tickerSeconds",
  "showSponsors",
  "showTicker",
  "background",
  "text",
  "accent",
];
function valid(d) {
  if (
    !d ||
    d.schemaVersion !== 1 ||
    !["countdown", "countup"].includes(d.mode) ||
    !Number.isInteger(d.durationSeconds) ||
    d.durationSeconds < 1 ||
    d.durationSeconds > 604800 ||
    !Number.isFinite(d.valueMs) ||
    d.valueMs < 0 ||
    typeof d.running !== "boolean" ||
    (d.startedAt !== null &&
      (!Number.isFinite(d.startedAt) || d.startedAt < 0)) ||
    (d.running && d.startedAt === null) ||
    !Number.isInteger(d.tickerSeconds) ||
    d.tickerSeconds < 5 ||
    d.tickerSeconds > 300 ||
    ["showSponsors", "showTicker"].some((k) => typeof d[k] !== "boolean") ||
    ["background", "text", "accent"].some(
      (k) => !/^#[a-f0-9]{6}$/i.test(d[k]),
    ) ||
    [
      ["format", 80],
      ["endText", 120],
      ["label", 120],
      ["headline", 240],
      ["ticker", 2000],
    ].some(([k, max]) => typeof d[k] !== "string" || d[k].length > max) ||
    !/%0[hms]/.test(d.format)
  )
    throw Object.assign(Error("Invalid panel settings"), { status: 400 });
}
function createPanelStore({
  initial = defaults(),
  file,
  persist = atomicWrite,
  now = Date.now,
}) {
  initial = { ...initial, headline: initial?.headline ?? "" };
  valid(initial);
  let data = structuredClone(initial),
    version = 0,
    tail = Promise.resolve();
  const epoch = randomUUID();
  const snapshot = () => ({
    data: structuredClone(data),
    revision: `"${epoch}:${version}"`,
    serverNow: now(),
  });
  return {
    snapshot,
    change(body, revision) {
      const task = tail.then(async () => {
        if (!revision)
          throw Object.assign(Error("Reload settings first"), { status: 428 });
        if (revision !== snapshot().revision)
          throw Object.assign(
            Error("Panel changed. Reload settings before retrying."),
            { status: 409 },
          );
        let next = structuredClone(data);
        const time = now();
        if (body.action === "settings") {
          if (
            !body.settings ||
            Object.keys(body.settings).some((k) => !settings.includes(k))
          )
            throw Object.assign(Error("Unknown setting"), { status: 400 });
          Object.assign(next, body.settings);
          valid(next);
          if (
            next.mode !== data.mode ||
            next.durationSeconds !== data.durationSeconds
          ) {
            next.running = false;
            next.startedAt = null;
            next.valueMs =
              next.mode === "countup" ? 0 : next.durationSeconds * 1000;
          }
        } else if (body.action === "start") {
          if (
            !next.running ||
            (next.mode === "countdown" && timer.milliseconds(next, time) === 0)
          ) {
            if (
              next.mode === "countdown" &&
              timer.milliseconds(next, time) === 0
            )
              next.valueMs = next.durationSeconds * 1000;
            next.running = true;
            next.startedAt = time;
          }
        } else if (body.action === "pause") {
          next.valueMs = timer.milliseconds(next, time);
          next.running = false;
          next.startedAt = null;
        } else if (body.action === "reset") {
          next.valueMs =
            next.mode === "countup" ? 0 : next.durationSeconds * 1000;
          next.running = false;
          next.startedAt = null;
        } else
          throw Object.assign(Error("Unknown panel action"), { status: 400 });
        valid(next);
        await persist(file, JSON.stringify(next, null, 2));
        data = next;
        version++;
        return snapshot();
      });
      tail = task.catch(() => {});
      return task;
    },
  };
}
async function loadPanelStore(options) {
  let initial;
  try {
    initial = JSON.parse(await fs.readFile(options.file, "utf8"));
    initial = { ...initial, headline: initial?.headline ?? "" };
    valid(initial);
  } catch (e) {
    if (e.code !== "ENOENT")
      throw Error("Cannot load production panel safely: " + e.message);
    initial = defaults();
    await fs.mkdir(path.dirname(options.file), { recursive: true });
    await atomicWrite(options.file, JSON.stringify(initial, null, 2));
  }
  return createPanelStore({ ...options, initial });
}
function installPanelRoutes(app, getStore) {
  app.get("/api/production-panel", (req, res) =>
    res.set("Cache-Control", "no-store").json(getStore().snapshot()),
  );
  app.put("/api/production-panel", async (req, res) => {
    try {
      res
        .set("Cache-Control", "no-store")
        .json(await getStore().change(req.body || {}, req.get("If-Match")));
    } catch (e) {
      res.status(e.status || 503).json({
        message: e.status
          ? e.message
          : "Panel could not be saved. Reload and retry.",
      });
    }
  });
}
module.exports = { createPanelStore, loadPanelStore, installPanelRoutes };
