"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const { atomicWrite } = require("./match-store");
const model = require("../public/script/broadcast-color-model");
const defaults = () => ({ schemaVersion: 1, palettes: {} });
function valid(data) {
  if (
    !data ||
    data.schemaVersion !== 1 ||
    !data.palettes ||
    typeof data.palettes !== "object" ||
    Array.isArray(data.palettes)
  )
    throw Error("Invalid saved color settings");
  for (const [id, outputs] of Object.entries(data.palettes)) {
    if (
      !model.themes.includes(id) ||
      !outputs ||
      typeof outputs !== "object" ||
      Array.isArray(outputs)
    )
      throw Error("Invalid saved color theme");
    for (const [output, colors] of Object.entries(outputs))
      if (!model.validScope(id, output) || !model.validColors(colors))
        throw Error("Invalid saved palette");
  }
}
function createColorStore({
  initial = defaults(),
  file,
  persist = atomicWrite,
  onCommit = () => {},
}) {
  valid(initial);
  let data = structuredClone(initial),
    version = 0,
    tail = Promise.resolve();
  const epoch = randomUUID();
  const snapshot = () => ({
    data: structuredClone(data),
    revision: `"${epoch}:${version}"`,
  });
  return {
    snapshot,
    save(id, output, colors, revision) {
      const task = tail.then(async () => {
        if (!revision)
          throw Object.assign(Error("Reload saved colors before saving"), {
            status: 428,
          });
        if (revision !== snapshot().revision)
          throw Object.assign(
            Error(
              "Colors changed in another panel. Reload saved colors before retrying.",
            ),
            { status: 409 },
          );
        if (!model.validScope(id, output) || !model.validColors(colors))
          throw Object.assign(
            Error("Use valid theme/output colors in #RRGGBB format"),
            { status: 400 },
          );
        const next = structuredClone(data);
        next.palettes[id] = {
          ...next.palettes[id],
          [output]: Object.fromEntries(
            Object.entries(colors).map(([key, value]) => [
              key,
              value.toLowerCase(),
            ]),
          ),
        };
        await persist(file, JSON.stringify(next, null, 2));
        data = next;
        version++;
        const result = snapshot();
        try {
          onCommit(result);
        } catch (error) {
          console.error("Color notification failed:", error.message);
        }
        return result;
      });
      tail = task.catch(() => {});
      return task;
    },
  };
}
async function loadColorStore(options) {
  let initial;
  try {
    initial = JSON.parse(await fs.readFile(options.file, "utf8"));
    valid(initial);
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error("Cannot load broadcast colors safely: " + error.message);
    initial = defaults();
    await fs.mkdir(path.dirname(options.file), { recursive: true });
    await atomicWrite(options.file, JSON.stringify(initial, null, 2));
  }
  return createColorStore({ ...options, initial });
}
function installColorRoutes(app, getStore) {
  app.get("/api/broadcast-colors", (req, res) =>
    res.set("Cache-Control", "no-store").json(getStore().snapshot()),
  );
  app.put("/api/broadcast-colors", async (req, res) => {
    try {
      res
        .set("Cache-Control", "no-store")
        .json(
          await getStore().save(
            req.body?.themeId,
            req.body?.output,
            req.body?.colors,
            req.get("If-Match"),
          ),
        );
    } catch (error) {
      if (!error.status) console.error("Color save failed:", error.message);
      res
        .status(error.status || 503)
        .json({
          message: error.status
            ? error.message
            : "Colors could not be saved. Your previous colors are retained.",
        });
    }
  });
}
module.exports = { createColorStore, loadColorStore, installColorRoutes };
