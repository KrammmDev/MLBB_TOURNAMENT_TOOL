/* Shared OCR telemetry grammar and calibration. Unknown pixels never mean zero. */
(function (root, factory) {
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  else root.OCRModel = value;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const fields = Object.freeze(
    [
      {
        id: "blueKills",
        label: "Blue kills",
        kind: "count",
        max: 199,
        legacy: "killscore1",
        target: "homescore-value",
      },
      {
        id: "redKills",
        label: "Red kills",
        kind: "count",
        max: 199,
        legacy: "killscore2",
        target: "awayscore-value",
      },
      {
        id: "blueGold",
        label: "Blue gold",
        kind: "gold",
        max: 1000000,
        legacy: "gold1",
        target: "bluegold",
      },
      {
        id: "redGold",
        label: "Red gold",
        kind: "gold",
        max: 1000000,
        legacy: "gold2",
        target: "redgold",
      },
      {
        id: "blueTower",
        label: "Blue towers",
        kind: "count",
        max: 11,
        legacy: "turret1",
        target: "bluetower",
      },
      {
        id: "redTower",
        label: "Red towers",
        kind: "count",
        max: 11,
        legacy: "turret2",
        target: "redtower",
      },
      {
        id: "timer",
        label: "Game timer",
        kind: "timer",
        max: 7200,
        legacy: "timer",
        target: "timer",
      },
      {
        id: "blueLord",
        label: "Blue lords (optional)",
        kind: "count",
        max: 20,
        legacy: "lord1",
        target: "bluelord",
      },
      {
        id: "redLord",
        label: "Red lords (optional)",
        kind: "count",
        max: 20,
        legacy: "lord2",
        target: "redlord",
      },
    ].map(Object.freeze),
  );
  const field = (id) => fields.find((item) => item.id === id);
  function parse(id, raw) {
    const spec = field(id);
    if (!spec || (typeof raw !== "string" && typeof raw !== "number"))
      return null;
    const text = String(raw).trim().replace(/\s/g, "");
    let value;
    if (spec.kind === "timer") {
      const match = /^(\d{1,3}):([0-5]\d)$/.exec(text);
      if (!match) return null;
      value = Number(match[1]) * 60 + Number(match[2]);
    } else if (spec.kind === "gold") {
      const match = /^(\d+(?:[.,]\d{1,2})?)([kKmM])$/.exec(text);
      if (match)
        value = Math.round(
          Number(match[1].replace(",", ".")) *
            (match[2].toLowerCase() === "k" ? 1000 : 1000000),
        );
      else if (/^\d+$/.test(text) || /^\d{1,3}(,\d{3})+$/.test(text))
        value = Number(text.replace(/,/g, ""));
      else return null;
    } else if (/^\d{1,3}$/.test(text)) value = Number(text);
    else return null;
    return Number.isSafeInteger(value) && value >= 0 && value <= spec.max
      ? value
      : null;
  }
  function format(id, value) {
    if (value === null || value === undefined)
      return id === "timer" ? "--:--" : "--";
    if (id === "timer")
      return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    if (field(id)?.kind === "gold" && value >= 1000)
      return `${(value / 1000).toFixed(1)}K`;
    return String(value);
  }
  const context = (data) => ({
    gameNumber: data?.game_number ?? null,
    matchInfo: data?.matchInfo || {},
    blue: String(
      data?.teamdata?.blueteam?.teamname ||
        data?.teamdata?.blueteam?.name ||
        "",
    ),
    red: String(
      data?.teamdata?.redteam?.teamname || data?.teamdata?.redteam?.name || "",
    ),
  });
  function validateProfile(profile) {
    const fail = () => {
      throw new Error(
        "Select a source and draw at least one valid native-resolution region.",
      );
    };
    if (
      !profile ||
      profile.schemaVersion !== 1 ||
      !profile.reference ||
      !profile.regions ||
      Array.isArray(profile.regions)
    )
      fail();
    const ref = profile.reference;
    if (
      !Number.isInteger(ref.width) ||
      !Number.isInteger(ref.height) ||
      ref.width < 320 ||
      ref.height < 180 ||
      ref.width > 7680 ||
      ref.height > 4320 ||
      !["camera", "screen", "image", "usb"].includes(ref.kind) ||
      typeof ref.sourceKey !== "string" ||
      !ref.sourceKey ||
      ref.sourceKey.length > 512
    )
      fail();
    const entries = Object.entries(profile.regions);
    if (!entries.length || entries.length > fields.length) fail();
    const regions = {};
    for (const [id, roi] of entries) {
      if (
        !field(id) ||
        !roi ||
        !["raw", "gray", "invert", "threshold"].includes(roi.mode) ||
        ![1, 2, 3].includes(roi.scale) ||
        !Number.isInteger(roi.threshold) ||
        roi.threshold < 0 ||
        roi.threshold > 255 ||
        !Number.isFinite(roi.minScore) ||
        roi.minScore < 50 ||
        roi.minScore > 100 ||
        ![roi.x, roi.y, roi.width, roi.height].every(Number.isFinite) ||
        roi.x < 0 ||
        roi.y < 0 ||
        roi.width <= 0 ||
        roi.height <= 0 ||
        roi.x + roi.width > 1.00001 ||
        roi.y + roi.height > 1.00001 ||
        roi.width > 0.4 ||
        roi.height > 0.2 ||
        roi.width * roi.height > 0.05 ||
        Math.round(roi.width * ref.width) < 8 ||
        Math.round(roi.height * ref.height) < 12
      )
        fail();
      regions[id] = {
        x: roi.x,
        y: roi.y,
        width: roi.width,
        height: roi.height,
        mode: roi.mode,
        scale: roi.scale,
        threshold: roi.threshold,
        minScore: roi.minScore,
      };
    }
    return {
      schemaVersion: 1,
      reference: {
        width: ref.width,
        height: ref.height,
        kind: ref.kind,
        sourceKey: ref.sourceKey,
      },
      regions,
    };
  }
  function cropRect(roi, width, height) {
    const x = Math.round(roi.x * width),
      y = Math.round(roi.y * height);
    return {
      x,
      y,
      width: Math.min(width - x, Math.round(roi.width * width)),
      height: Math.min(height - y, Math.round(roi.height * height)),
    };
  }
  function pixels(start, end, width, height) {
    const x = Math.min(start.x, end.x),
      y = Math.min(start.y, end.y);
    return {
      x: x / width,
      y: y / height,
      width: Math.abs(end.x - start.x) / width,
      height: Math.abs(end.y - start.y) / height,
    };
  }
  return Object.freeze({
    fields,
    field,
    parse,
    format,
    context,
    validateProfile,
    cropRect,
    pixels,
  });
});
