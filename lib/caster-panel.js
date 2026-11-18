"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto"),
  { atomicWrite } = require("./match-store");
const vdo = require("../public/script/caster-vdo-model");
const normalize = (data) => ({
  ...data,
  casters: data.casters.map((c) => ({
    ...c,
    onAir: c.onAir !== false,
    vdoUrl: c.vdoUrl || "",
  })),
});
const defaults = () => ({
  schemaVersion: 1,
  visible: false,
  namesVisible: true,
  casters: [
    { name: "", handle: "", role: "SHOUTCASTER", onAir: true, vdoUrl: "" },
    { name: "", handle: "", role: "ANALYST", onAir: true, vdoUrl: "" },
  ],
});
function valid(data) {
  if (Array.isArray(data?.casters))
    data.casters.forEach((c, i) => {
      if (
        typeof c?.vdoUrl === "string" &&
        c.vdoUrl.trim() &&
        !vdo.safeURL(c.vdoUrl)
      )
        throw Object.assign(
          Error(
            "Caster " +
              (i + 1) +
              ": use an HTTPS VDO.Ninja receive link containing ?view=... (room parameters are supported).",
          ),
          { status: 400 },
        );
    });
  if (
    !data ||
    data.schemaVersion !== 1 ||
    typeof data.visible !== "boolean" ||
    typeof data.namesVisible !== "boolean" ||
    !Array.isArray(data.casters) ||
    data.casters.length !== 2 ||
    data.casters.some(
      (c) =>
        !c ||
        Object.keys(c).some(
          (k) => !["name", "handle", "role", "onAir", "vdoUrl"].includes(k),
        ) ||
        (c.onAir !== undefined && typeof c.onAir !== "boolean") ||
        (c.vdoUrl !== undefined &&
          (typeof c.vdoUrl !== "string" ||
            (c.vdoUrl.trim() && !vdo.safeURL(c.vdoUrl)))) ||
        ["name", "handle", "role"].some(
          (k) => typeof c[k] !== "string" || c[k].length > 64,
        ),
    )
  )
    throw Object.assign(
      Error(
        "Provide two caster names, handles and roles (64 characters maximum).",
      ),
      { status: 400 },
    );
}
function createCasterStore({
  initial = defaults(),
  file,
  persist = atomicWrite,
  onCommit = () => {},
}) {
  valid(initial);
  let data = normalize(structuredClone(initial)),
    version = 0,
    tail = Promise.resolve();
  const epoch = randomUUID(),
    snapshot = () => ({
      data: structuredClone(data),
      revision: `"${epoch}:${version}"`,
    });
  return {
    snapshot,
    save(next, revision) {
      const task = tail.then(async () => {
        if (!revision)
          throw Object.assign(Error("Reload caster settings before saving."), {
            status: 428,
          });
        if (revision !== snapshot().revision)
          throw Object.assign(
            Error("Caster settings changed. Reload before retrying."),
            { status: 409 },
          );
        valid(next);
        const clean = {
          schemaVersion: 1,
          visible: next.visible,
          namesVisible: next.namesVisible,
          casters: next.casters.map((c) => ({
            ...Object.fromEntries(
              ["name", "handle", "role"].map((k) => [k, c[k].trim()]),
            ),
            onAir: c.onAir !== false,
            vdoUrl: vdo.safeURL(c.vdoUrl || ""),
          })),
        };
        await persist(file, JSON.stringify(clean, null, 2));
        data = clean;
        version++;
        const result = snapshot();
        try {
          onCommit(result);
        } catch (error) {
          console.error("Caster notification failed:", error.message);
        }
        return result;
      });
      tail = task.catch(() => {});
      return task;
    },
  };
}
async function loadCasterStore(options) {
  let initial;
  try {
    initial = JSON.parse(await fs.readFile(options.file, "utf8"));
    valid(initial);
  } catch (e) {
    if (e.code !== "ENOENT")
      throw Error("Cannot load caster settings safely: " + e.message);
    initial = defaults();
    await fs.mkdir(path.dirname(options.file), { recursive: true });
    await atomicWrite(options.file, JSON.stringify(initial, null, 2));
  }
  return createCasterStore({ ...options, initial });
}
function installCasterRoutes(app, getStore) {
  app.get("/api/caster-panel", (q, s) =>
    s.set("Cache-Control", "no-store").json(getStore().snapshot()),
  );
  app.put("/api/caster-panel", async (q, s) => {
    try {
      s.set("Cache-Control", "no-store").json(
        await getStore().save(q.body, q.get("If-Match")),
      );
    } catch (e) {
      s.status(e.status || 500).json({ message: e.message });
    }
  });
}
module.exports = {
  defaults,
  valid,
  createCasterStore,
  loadCasterStore,
  installCasterRoutes,
};
