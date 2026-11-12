"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const express = require("express");
const multer = require("multer");
const { atomicWrite } = require("./match-store");
const defaults = () => ({
  schemaVersion: 1,
  enabled: true,
  intervalSeconds: 5,
  logos: [],
});
const filename = /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;
function valid(data) {
  if (
    !data ||
    data.schemaVersion !== 1 ||
    typeof data.enabled !== "boolean" ||
    !Number.isInteger(data.intervalSeconds) ||
    data.intervalSeconds < 2 ||
    data.intervalSeconds > 60 ||
    !Array.isArray(data.logos) ||
    data.logos.length > 20 ||
    new Set(data.logos.map((x) => x?.id)).size !== data.logos.length ||
    data.logos.some(
      (x) =>
        !x ||
        typeof x.id !== "string" ||
        !filename.test(x.file) ||
        x.id !== x.file.split(".")[0] ||
        typeof x.name !== "string" ||
        x.name.length > 120,
    )
  )
    throw Object.assign(Error("Invalid sponsor settings"), { status: 400 });
}
function createSponsorStore({
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
    change(update, revision) {
      const task = tail.then(async () => {
        if (!revision)
          throw Object.assign(Error("Reload sponsor settings before saving"), {
            status: 428,
          });
        if (revision !== snapshot().revision)
          throw Object.assign(
            Error("Sponsor settings changed. Reload before retrying."),
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
          console.error("Sponsor notification failed:", error.message);
        }
        return result;
      });
      tail = task.catch(() => {});
      return task;
    },
  };
}
async function loadSponsorStore(options) {
  let initial;
  try {
    initial = JSON.parse(await fs.readFile(options.file, "utf8"));
    valid(initial);
  } catch (error) {
    if (error.code !== "ENOENT")
      throw Error("Cannot load sponsor settings safely: " + error.message);
    initial = defaults();
    await fs.mkdir(path.dirname(options.file), { recursive: true });
    await atomicWrite(options.file, JSON.stringify(initial, null, 2));
  }
  return createSponsorStore({ ...options, initial });
}
function imageType(buffer) {
  if (
    buffer.length >= 24 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buffer.toString("ascii", 12, 16) === "IHDR" &&
    buffer.readUInt32BE(16) &&
    buffer.readUInt32BE(20)
  )
    return "png";
  if (
    buffer.length >= 4 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255
  )
    return "jpg";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  if (buffer.length >= 10 && /GIF8[79]a/.test(buffer.toString("ascii", 0, 6)))
    return "gif";
  return null;
}
function installSponsorRoutes(app, getStore, directory) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0 },
  });
  const fail = (res, error) => {
    if (!error.status) console.error("Sponsor save failed:", error.message);
    res
      .status(error.status || 503)
      .json({
        message: error.status
          ? error.message
          : "Sponsors could not be saved. Reload settings and retry.",
      });
  };
  app.use(
    "/broadcast-sponsors",
    express.static(directory, {
      dotfiles: "deny",
      index: false,
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.get("/api/broadcast-sponsors", (req, res) =>
    res.set("Cache-Control", "no-store").json(getStore().snapshot()),
  );
  app.post("/api/broadcast-sponsors/logos", (req, res) => {
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
        if (!req.file)
          throw Object.assign(Error("Choose a sponsor logo"), { status: 400 });
        const type = imageType(req.file.buffer);
        if (!type)
          throw Object.assign(Error("Use a PNG, JPEG, WebP or GIF image"), {
            status: 400,
          });
        const id = randomUUID(),
          file = `${id}.${type}`;
        const name = path.basename(req.file.originalname).slice(0, 120);
        destination = path.join(directory, file);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(destination, req.file.buffer, { flag: "wx" });
        // Failed settings commits clean up their unpublished file.
        const result = await getStore().change((data) => {
          if (data.logos.length >= 20)
            throw Object.assign(Error("You can add up to 20 sponsor logos"), {
              status: 400,
            });
          data.logos.push({ id, file, name });
          return data;
        }, req.get("If-Match"));
        res.status(201).set("Cache-Control", "no-store").json(result);
      } catch (error) {
        if (destination) await fs.unlink(destination).catch(() => {});
        fail(res, error);
      }
    });
  });
  app.put("/api/broadcast-sponsors", async (req, res) => {
    let removed = [];
    try {
      const body = req.body;
      const result = await getStore().change((data) => {
        if (
          !body ||
          !Array.isArray(body.logoIds) ||
          new Set(body.logoIds).size !== body.logoIds.length ||
          body.logoIds.some((id) => !data.logos.some((logo) => logo.id === id))
        )
          throw Object.assign(Error("Invalid sponsor order"), { status: 400 });
        removed = data.logos.filter((logo) => !body.logoIds.includes(logo.id));
        return {
          ...data,
          enabled: body.enabled,
          intervalSeconds: body.intervalSeconds,
          logos: body.logoIds.map((id) =>
            data.logos.find((logo) => logo.id === id),
          ),
        };
      }, req.get("If-Match"));
      res.set("Cache-Control", "no-store").json(result);
      for (const logo of removed)
        await fs.unlink(path.join(directory, logo.file)).catch(() => {});
    } catch (error) {
      fail(res, error);
    }
  });
}
module.exports = {
  defaults,
  createSponsorStore,
  loadSponsorStore,
  installSponsorRoutes,
};
