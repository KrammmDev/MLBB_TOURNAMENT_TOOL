"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { atomicWrite } = require("./match-store");

const themes = ["classic", "arena", "studio"];
const defaults = () => ({ schemaVersion: 1, backgrounds: Object.fromEntries(themes.map(id => [id, true])) });
function valid(data) {
  return data && data.schemaVersion === 1 &&
    data.backgrounds && typeof data.backgrounds === "object" &&
    !Array.isArray(data.backgrounds) &&
    themes.every(id => typeof data.backgrounds[id] === "boolean") &&
    Object.keys(data.backgrounds).every(id => themes.includes(id));
}
function createScoreboardBackgroundStore({ initial = defaults(), file, persist = atomicWrite, onCommit = () => {} }) {
  if (!valid(initial)) throw Error("Invalid Scoreboard background settings");
  let data = structuredClone(initial), version = 0, tail = Promise.resolve();
  const epoch = randomUUID();
  const snapshot = () => ({ data: structuredClone(data), revision: `"${epoch}:${version}"` });
  const save = (themeId, enabled, revision) => {
    const task = tail.then(async () => {
      if (!revision) throw Object.assign(Error("Reload the Scoreboard background settings before saving"), { status: 428 });
      if (revision !== snapshot().revision)
        throw Object.assign(Error("Scoreboard background settings changed. Reload and retry."), { status: 409 });
      if (!themes.includes(themeId) || typeof enabled !== "boolean")
        throw Object.assign(Error("Invalid Scoreboard theme/background switch"), { status: 400 });
      if (data.backgrounds[themeId] === enabled) return snapshot();
      const next = structuredClone(data);
      next.backgrounds[themeId] = enabled;
      await persist(file, JSON.stringify(next, null, 2));
      data = next;
      version++;
      const result = snapshot();
      try { onCommit(result); } catch (error) { console.error("Scoreboard background notification failed:",error.message); }
      return result;
    });
    tail = task.catch(() => {});
    return task;
  };
  return { snapshot, save };
}
async function loadScoreboardBackgroundStore(options) {
  let initial;
  try {
    initial = JSON.parse(await fs.readFile(options.file, "utf8"));
    if (!valid(initial)) throw Error("Invalid Scoreboard background settings");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    initial = defaults();
    await fs.mkdir(path.dirname(options.file), { recursive:true });
    await atomicWrite(options.file, JSON.stringify(initial, null, 2));
  }
  return createScoreboardBackgroundStore({ ...options, initial });
}
function installScoreboardBackgroundRoutes(app, getStore) {
  app.get("/api/scoreboard-background", (_req,res) =>
    res.set("Cache-Control","no-store").json(getStore().snapshot()));
  app.put("/api/scoreboard-background", async (req,res) => {
    try {
      res.set("Cache-Control","no-store").json(await getStore().save(
        req.body?.themeId, req.body?.enabled, req.get("If-Match")));
    } catch (error) {
      if (!error.status) console.error("Scoreboard background save failed:",error.message);
      res.status(error.status || 503).json({message:error.status ? error.message : "Could not save Scoreboard background setting."});
    }
  });
}
module.exports = { themes, defaults, valid, createScoreboardBackgroundStore, loadScoreboardBackgroundStore, installScoreboardBackgroundRoutes };
