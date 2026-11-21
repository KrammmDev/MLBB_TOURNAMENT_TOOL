"use strict";
const fs = require("node:fs/promises"),
  { randomUUID } = require("node:crypto"),
  { isDeepStrictEqual: equal } = require("node:util");
const model = require("../public/script/ocr-model"),
  { atomicWrite } = require("./match-store");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const clone = (value) => structuredClone(value);
async function loadOCRStore({
  file,
  getMatch,
  engine,
  persist = atomicWrite,
  onChange = () => {},
  now = Date.now,
}) {
  let config = { schemaVersion: 1, source: "legacy", profile: null };
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    if (
      saved.schemaVersion !== 1 ||
      !["legacy", "custom"].includes(saved.source)
    )
      throw Error("Invalid OCR configuration");
    config = {
      schemaVersion: 1,
      source: saved.source,
      profile: saved.profile ? model.validateProfile(saved.profile) : null,
    };
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        `Cannot load OCR config; original file preserved: ${error.message}`,
      );
  }
  let revision = 0,
    generation = randomUUID(),
    session = null,
    busy = false,
    fields = {},
    tail = Promise.resolve(),
    engineError = "";
  const epoch = randomUUID(),
    configRevision = () => `"${epoch}:${revision}"`;
  function clear(reason) {
    generation = randomUUID();
    session = null;
    fields = {};
    engineError = reason || "";
  }
  function check() {
    if (session && now() - session.lastRead > 15000)
      clear("Capture lease expired. Start a new session.");
    if (session && !equal(session.context, model.context(getMatch())))
      clear(
        "Match or teams changed. Verify the lineup and start a new OCR session.",
      );
  }
  function state() {
    check();
    const current = now();
    return {
      source: config.source,
      generation,
      active: Boolean(session),
      preview: session?.preview ?? true,
      busy,
      engineError,
      context: model.context(getMatch()),
      profileRevision: configRevision(),
      fields: Object.fromEntries(
        model.fields.map((spec) => {
          const value = fields[spec.id] || {};
          const ageMs =
            value.acceptedAt === undefined ? null : current - value.acceptedAt;
          const visible =
            session &&
            !session.preview &&
            (value.locked || (ageMs !== null && ageMs <= 4000));
          return [
            spec.id,
            {
              value: visible ? (value.accepted ?? null) : null,
              accepted: value.accepted ?? null,
              rawText: value.rawText || "",
              score: value.score ?? null,
              capturedAt: value.capturedAt ?? null,
              acceptedAt: value.acceptedAt ?? null,
              parsed: value.parsed ?? null,
              status:
                !value.locked && ageMs !== null && ageMs > 4000
                  ? "stale"
                  : value.status || "unknown",
              reason:
                !value.locked && ageMs !== null && ageMs > 4000
                  ? "Reading expired; waiting for a valid fresh frame"
                  : value.reason || "No reading",
              ageMs,
              locked: Boolean(value.locked),
            },
          ];
        }),
      ),
    };
  }
  const emit = () => onChange(state());
  const settings = () => ({ data: clone(config), revision: configRevision() });
  function configure(body, expected) {
    const task = tail.then(async () => {
      if (!expected) fail(428, "Reload OCR settings before saving");
      if (expected !== configRevision())
        fail(409, "OCR settings changed. Reload settings.");
      if (!body || typeof body !== "object") fail(400, "Invalid OCR settings");
      const next = clone(config);
      if (body.source !== undefined) {
        if (!["legacy", "custom"].includes(body.source))
          fail(400, "Invalid OCR output source");
        next.source = body.source;
      }
      if (body.profile !== undefined) {
        try {
          next.profile = model.validateProfile(body.profile);
        } catch (error) {
          fail(400, error.message);
        }
      }
      if (next.source === "custom" && !next.profile)
        fail(400, "Save a calibration before selecting custom OCR");
      if (equal(next, config)) return settings();
      await fs.mkdir(require("node:path").dirname(file), { recursive: true });
      try {
        await persist(file, JSON.stringify(next, null, 2));
      } catch {
        fail(503, "OCR settings could not be saved");
      }
      const profileChanged = !equal(next.profile, config.profile);
      config = next;
      revision++;
      if (profileChanged) clear("Calibration changed. Start a new session.");
      emit();
      return settings();
    });
    tail = task.catch(() => {});
    return task;
  }
  function start(body) {
    check();
    if (body?.generation !== generation)
      fail(409, "OCR session changed. Reload its state before starting.");
    if (busy) fail(409, "Wait for the current OCR read to finish");
    if (!config.profile) fail(409, "Save a calibration first");
    if (!equal(body?.expected, model.context(getMatch())))
      fail(409, "Match changed. Reload before starting OCR.");
    if (!equal(body?.reference, config.profile.reference))
      fail(409, "Capture geometry/device differs from the saved calibration");
    clear();
    session = {
      id: randomUUID(),
      context: model.context(getMatch()),
      preview: true,
      sequence: -1,
      lastRead: now(),
    };
    emit();
    return { sessionId: session.id, generation, state: state() };
  }
  function own(id) {
    check();
    if (!session || session.id !== id)
      fail(409, "OCR session expired. Verify source and start again.");
    return session;
  }
  function live(id) {
    const active = own(id);
    if (config.profile.reference.kind === "image")
      fail(409, "Image samples are preview-only. Select a live source.");
    active.preview = false;
    fields = {};
    emit();
    return state();
  }
  function stop(id) {
    own(id);
    clear("Capture stopped");
    emit();
    return state();
  }
  function manual(body) {
    check();
    if (body?.generation !== generation || !session || session.preview)
      fail(409, "OCR game/session changed. Reload before correcting.");
    if (!model.field(body.field)) fail(400, "Unknown OCR field");
    if (body.value === null) {
      delete fields[body.field];
      emit();
      return state();
    }
    const spec = model.field(body.field),
      value =
        spec.kind === "timer" && typeof body.value === "number"
          ? body.value
          : model.parse(body.field, body.value);
    if (!Number.isSafeInteger(value) || value < 0 || value > spec.max)
      fail(400, "Invalid manual value");
    fields[body.field] = {
      accepted: value,
      acceptedAt: now(),
      locked: true,
      status: "manual",
      reason: "Manual override",
    };
    emit();
    return state();
  }
  function sample(id, raw, at) {
    const spec = model.field(id),
      roi = config.profile.regions[id],
      previous = fields[id] || {};
    if (previous.locked) return;
    const value = model.parseOCR(id, raw.rawText),
      score = Number(raw.score);
    const record = {
      ...previous,
      rawText: String(raw.rawText || "").slice(0, 128),
      score,
      capturedAt: at,
      parsed: value,
      status: "rejected",
      reason: "Unreadable or ambiguous",
    };
    fields[id] = record;
    if (value === null || !Number.isFinite(score)) {
      delete record.pending;
      return;
    }
    if (score < roi.minScore) {
      delete record.pending;
      record.reason = "Engine score below calibration threshold";
      return;
    }
    const baseline =
      previous.accepted ??
      (spec.kind === "count" ? undefined : previous.pending);
    const elapsed = Math.max(
      0,
      (at - (previous.acceptedAt ?? previous.pendingAt ?? at)) / 1000,
    );
    if (
      baseline !== undefined &&
      (value < baseline ||
        (spec.kind === "timer" && value - baseline > elapsed + 3) ||
        (spec.kind === "gold" &&
          value - baseline > Math.max(2500, elapsed * 800)))
    ) {
      delete record.pending;
      record.reason = "Unexpected decrease/jump; check HUD or start a new game";
      return;
    }
    let confirmed;
    if (spec.kind === "count") confirmed = previous.pending === value;
    else
      confirmed =
        previous.pending !== undefined || previous.accepted !== undefined;
    record.pending = value;
    record.pendingAt = at;
    if (!confirmed) {
      record.status = "confirming";
      record.reason = "Waiting for another consistent reading";
      return;
    }
    record.accepted = value;
    record.acceptedAt = at;
    record.status = "accepted";
    record.reason = "Validated reading";
  }
  async function read(body) {
    const active = own(body?.sessionId),
      startedGeneration = generation,
      profileRevision = configRevision();
    if (busy) fail(429, "OCR is busy; obsolete frames are not queued");
    if (
      !Number.isSafeInteger(body.sequence) ||
      body.sequence <= active.sequence
    )
      fail(409, "Old or duplicate frame");
    if (
      !Number.isFinite(body.capturedAt) ||
      now() - body.capturedAt > 5000 ||
      body.capturedAt - now() > 2000
    )
      fail(409, "Capture timestamp is stale");
    if (!equal(body.reference, config.profile.reference))
      fail(409, "Capture geometry changed. Recalibrate.");
    const expectedFields = Object.keys(config.profile.regions);
    if (
      !Array.isArray(body.crops) ||
      body.crops.length !== expectedFields.length ||
      new Set(body.crops.map((crop) => crop.field)).size !==
        expectedFields.length
    )
      fail(400, "Send exactly the calibrated regions");
    const images = body.crops.map((crop) => {
      const roi = config.profile.regions[crop.field];
      if (
        !roi ||
        typeof crop.png !== "string" ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(crop.png) ||
        crop.png.length > 3000000
      )
        fail(400, "Invalid OCR crop");
      const image = Buffer.from(crop.png.split(",")[1], "base64"),
        rect = model.cropRect(roi, body.reference.width, body.reference.height);
      if (
        image.length < 24 ||
        image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        image.readUInt32BE(16) !== rect.width * roi.scale + 16 ||
        image.readUInt32BE(20) !== rect.height * roi.scale + 16
      )
        fail(400, "Crop dimensions do not match calibration");
      return { field: crop.field, image };
    });
    active.sequence = body.sequence;
    active.lastRead = now();
    busy = true;
    engineError = "";
    try {
      const observations = [];
      for (const crop of images) {
        if (
          generation !== startedGeneration ||
          configRevision() !== profileRevision
        )
          fail(409, "OCR session/calibration changed during recognition");
        observations.push({
          field: crop.field,
          ...(await engine.recognize(crop.image)),
        });
      }
      check();
      if (
        generation !== startedGeneration ||
        configRevision() !== profileRevision ||
        now() - body.capturedAt > 5000
      )
        fail(409, "Recognition belongs to an old/stale frame or game");
      for (const observation of observations)
        sample(observation.field, observation, body.capturedAt);
      busy = false;
      emit();
      return { observations, state: state() };
    } catch (error) {
      if (!error.status) {
        engineError = error.message;
        fail(503, error.message);
      }
      throw error;
    } finally {
      busy = false;
    }
  }
  return {
    settings,
    configure,
    start,
    live,
    stop,
    manual,
    read,
    state,
    matchChanged() {
      const before = generation;
      check();
      if (before !== generation) emit();
    },
    close: () => engine.close?.(),
  };
}
function installOCRRoutes(app, getStore) {
  const send = (handler) => async (req, res) => {
    try {
      res.set("Cache-Control", "no-store").json(await handler(getStore(), req));
    } catch (error) {
      res
        .status(error.status || 500)
        .json({ message: error.status ? error.message : "OCR request failed" });
    }
  };
  app.get(
    "/api/ocr/config",
    send((store) => store.settings()),
  );
  app.put(
    "/api/ocr/config",
    send((store, req) => store.configure(req.body, req.get("If-Match"))),
  );
  app.get(
    "/api/ocr/state",
    send((store) => store.state()),
  );
  app.post(
    "/api/ocr/session",
    send((store, req) => store.start(req.body)),
  );
  app.post(
    "/api/ocr/live",
    send((store, req) => store.live(req.body.sessionId)),
  );
  app.post(
    "/api/ocr/stop",
    send((store, req) => store.stop(req.body.sessionId)),
  );
  app.post(
    "/api/ocr/read",
    send((store, req) => store.read(req.body)),
  );
  app.post(
    "/api/ocr/manual",
    send((store, req) => store.manual(req.body)),
  );
}
module.exports = { loadOCRStore, installOCRRoutes };
