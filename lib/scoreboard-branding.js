"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto"),
  express = require("express"),
  multer = require("multer");
const { atomicWrite } = require("./match-store"),
  { imageType } = require("./broadcast-sponsors");
const filePattern = /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;
function valid(data) {
  if (
    !data ||
    data.schemaVersion !== 1 ||
    typeof data.patchLabel !== "string" ||
    data.patchLabel.length > 64 ||
    typeof data.casterNames !== "string" ||
    data.casterNames.length > 100 ||
    (data.logoFile !== null &&
      (typeof data.logoFile !== "string" || !filePattern.test(data.logoFile)))
  )
    throw Object.assign(Error("Invalid scoreboard details"), { status: 400 });
}
function createBrandingStore({
  initial = {
    schemaVersion: 1,
    patchLabel: "",
    casterNames: "",
    logoFile: null,
  },
  file,
  persist = atomicWrite,
  onCommit = () => {},
}) {
  valid(initial);
  let data = structuredClone(initial),
    version = 0,
    queue = Promise.resolve();
  const epoch = randomUUID();
  const snapshot = () => ({
    data: structuredClone(data),
    revision: `"${epoch}:${version}"`,
  });
  return {
    snapshot,
    change(update, revision) {
      const task = queue.then(async () => {
        if (!revision)
          throw Object.assign(
            Error("Reload scoreboard details before saving"),
            { status: 428 },
          );
        if (revision !== snapshot().revision)
          throw Object.assign(
            Error("Scoreboard details changed. Reload before retrying."),
            { status: 409 },
          );
        const next = update(structuredClone(data));
        valid(next);
        await persist(file, JSON.stringify(next, null, 2));
        data = next;
        version++;
        const result = snapshot();
        try {
          onCommit(result);
        } catch (error) {
          console.error(
            "Scoreboard details notification failed:",
            error.message,
          );
        }
        return result;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
async function loadBrandingStore(options) {
  let initial;
  try {
    initial = JSON.parse(await fs.readFile(options.file, "utf8"));
    valid(initial);
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error("Cannot load scoreboard details safely: " + error.message);
    initial = {
      schemaVersion: 1,
      patchLabel: "",
      casterNames: "",
      logoFile: null,
    };
    await fs.mkdir(path.dirname(options.file), { recursive: true });
    await atomicWrite(options.file, JSON.stringify(initial, null, 2));
  }
  return createBrandingStore({ ...options, initial });
}
function installBrandingRoutes(app, getStore, directory) {
  const fail = (res, error) => {
    if (!error.status)
      console.error("Scoreboard details save failed:", error.message);
    res
      .status(error.status || 503)
      .json({
        message: error.status
          ? error.message
          : "Scoreboard details could not be saved. Previous settings are retained.",
      });
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.use(
    "/scoreboard-branding",
    express.static(directory, {
      dotfiles: "deny",
      index: false,
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.get("/api/scoreboard-branding", (req, res) =>
    res.set("Cache-Control", "no-store").json(getStore().snapshot()),
  );
  app.put("/api/scoreboard-branding", async (req, res) => {
    try {
      const body = req.body;
      if (
        !body ||
        Object.keys(body).some(
          (key) => !["patchLabel", "casterNames"].includes(key),
        ) ||
        typeof body.patchLabel !== "string" ||
        typeof body.casterNames !== "string"
      )
        throw Object.assign(Error("Provide patch label and caster names"), {
          status: 400,
        });
      res
        .set("Cache-Control", "no-store")
        .json(
          await getStore().change(
            (data) => ({
              ...data,
              patchLabel: body.patchLabel.trim(),
              casterNames: body.casterNames.trim(),
            }),
            req.get("If-Match"),
          ),
        );
    } catch (error) {
      fail(res, error);
    }
  });
  app.post("/api/scoreboard-branding/logo", (req, res) =>
    upload.single("logo")(req, res, async (error) => {
      let destination;
      try {
        if (error)
          throw Object.assign(
            Error(
              error.code === "LIMIT_FILE_SIZE"
                ? "Logo must be 3 MB or smaller"
                : "Upload one logo at a time",
            ),
            { status: 400 },
          );
        const type = req.file && imageType(req.file.buffer);
        if (!type)
          throw Object.assign(
            Error("Choose a PNG, JPEG, WebP or GIF tournament logo"),
            { status: 400 },
          );
        const file = `${randomUUID()}.${type}`;
        await fs.mkdir(directory, { recursive: true });
        destination = path.join(directory, file);
        await fs.writeFile(destination, req.file.buffer, { flag: "wx" });
        const result = await getStore().change(
          (data) => ({ ...data, logoFile: file }),
          req.get("If-Match"),
        );
        res.status(201).set("Cache-Control", "no-store").json(result);
      } catch (error) {
        if (destination) await fs.unlink(destination).catch(() => {});
        fail(res, error);
      }
    }),
  );
  app.delete("/api/scoreboard-branding/logo", async (req, res) => {
    try {
      res
        .set("Cache-Control", "no-store")
        .json(
          await getStore().change(
            (data) => ({ ...data, logoFile: null }),
            req.get("If-Match"),
          ),
        );
    } catch (error) {
      fail(res, error);
    }
  });
}
module.exports = {
  createBrandingStore,
  loadBrandingStore,
  installBrandingRoutes,
};
