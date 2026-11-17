"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { atomicWrite } = require("./match-store");
const catalog = require("../public/script/roster-themes");
const allowed = new Set(catalog.themes.map((theme) => theme.id));
function valid(config) {
  if (
    !config ||
    config.schemaVersion !== 1 ||
    !allowed.has(config.themeId) ||
    (config.previousThemeId !== null && !allowed.has(config.previousThemeId))
  )
    throw Error("Invalid saved roster theme configuration");
  if (
    config.selections !== undefined &&
    (!config.selections ||
      typeof config.selections !== "object" ||
      Array.isArray(config.selections) ||
      Object.entries(config.selections).some(
        ([output, value]) =>
          !catalog.outputs.includes(output) ||
          !value ||
          !allowed.has(value.themeId) ||
          (value.previousThemeId !== null &&
            !allowed.has(value.previousThemeId)),
      ))
  )
    throw Error("Invalid saved output theme configuration");
}
function createRosterThemeStore({
  initial,
  file,
  persist = atomicWrite,
  onCommit = () => {},
}) {
  valid(initial);
  let config = { ...initial },
    version = 0,
    tail = Promise.resolve();
  const epoch = randomUUID();
  const snapshot = () => ({
    data: structuredClone(config),
    revision: `"${epoch}:${version}"`,
  });
  return {
    snapshot,
    select(themeId, expectedRevision, output) {
      const task = tail.then(async () => {
        if (!expectedRevision)
          throw Object.assign(
            Error("Read current settings before selecting a theme"),
            { status: 428 },
          );
        if (expectedRevision !== snapshot().revision)
          throw Object.assign(
            Error(
              "Theme selection changed. Reload settings before trying again.",
            ),
            { status: 409 },
          );
        if (!allowed.has(themeId))
          throw Object.assign(Error("Unknown roster theme"), { status: 400 });
        if (output !== undefined && !catalog.outputs.includes(output))
          throw Object.assign(Error("Unknown broadcast output"), {
            status: 400,
          });
        const current =
          output === undefined ? config : catalog.selection(config, output);
        if (themeId === current.themeId) return snapshot();
        const next = {
          schemaVersion: 1,
          themeId,
          previousThemeId: config.themeId,
        };
        if (output !== undefined) {
          const selections = Object.fromEntries(
            catalog.outputs.map((key) => [
              key,
              { ...catalog.selection(config, key) },
            ]),
          );
          selections[output] = { themeId, previousThemeId: current.themeId };
          Object.assign(next, config, { selections });
        }
        await persist(file, JSON.stringify(next, null, 2));
        config = next;
        version++;
        const result = snapshot();
        try {
          onCommit(result);
        } catch (error) {
          console.error("Roster theme notification failed:", error.message);
        }
        return result;
      });
      tail = task.catch(() => {});
      return task;
    },
  };
}
async function loadRosterThemeStore(options) {
  let initial;
  try {
    initial = JSON.parse(await fs.readFile(options.file, "utf8"));
    valid(initial);
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error(`Cannot load roster theme safely: ${error.message}`);
    initial = { schemaVersion: 1, themeId: "classic", previousThemeId: null };
    await fs.mkdir(path.dirname(options.file), { recursive: true });
    await atomicWrite(options.file, JSON.stringify(initial, null, 2));
  }
  return createRosterThemeStore({ ...options, initial });
}
function installRosterThemeRoutes(app, getStore) {
  app.get(["/api/roster-themes", "/api/broadcast-themes"], (req, res) =>
    res.set("Cache-Control", "no-store").json(catalog),
  );
  app.get(["/api/roster-theme", "/api/broadcast-theme"], (req, res) =>
    res.set("Cache-Control", "no-store").json(getStore().snapshot()),
  );
  app.put(["/api/roster-theme", "/api/broadcast-theme"], async (req, res) => {
    try {
      res
        .set("Cache-Control", "no-store")
        .json(
          await getStore().select(
            req.body?.themeId,
            req.get("If-Match"),
            req.body?.output,
          ),
        );
    } catch (error) {
      if (!error.status)
        console.error("Roster theme save failed:", error.message);
      res.status(error.status || 503).json({
        message: error.status
          ? error.message
          : "Theme could not be saved. Check storage and reload settings.",
      });
    }
  });
}
module.exports = {
  createRosterThemeStore,
  loadRosterThemeStore,
  installRosterThemeRoutes,
};
