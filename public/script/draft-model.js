/* Display-only formats. Array order mirrors each existing controller, including its adjustment phase. */
(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.DraftModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const order = {
    normal: [
      ["ban-left-1"],
      ["ban-right-1"],
      ["ban-left-2"],
      ["ban-right-2"],
      ["ban-left-3"],
      ["ban-right-3"],
      ["pick-left-1"],
      ["pick-right-1", "pick-right-2"],
      ["pick-left-2", "pick-left-3"],
      ["pick-right-3"],
      ["ban-right-4"],
      ["ban-left-4"],
      ["ban-right-5"],
      ["ban-left-5"],
      ["pick-right-4"],
      ["pick-left-4", "pick-left-5"],
      ["pick-right-5"],
      [],
    ],
    six: [
      ["ban-left-1"],
      ["ban-right-1"],
      ["ban-left-2"],
      ["ban-right-2"],
      ["pick-left-1"],
      ["pick-right-1", "pick-right-2"],
      ["pick-left-2", "pick-left-3"],
      ["pick-right-3"],
      ["ban-right-3"],
      ["ban-left-3"],
      ["pick-right-4"],
      ["pick-left-4", "pick-left-5"],
      ["pick-right-5"],
      [],
    ],
  };
  const formats = Object.fromEntries(
    Object.entries(order).map(([id, phases]) => [
      id,
      {
        id,
        banCount: id === "six" ? 3 : 5,
        defaultTimer: 50,
        phases: phases.map((slots) => ({
          slots,
          type: !slots.length
            ? "ADJUSTMENT"
            : slots[0].startsWith("ban")
              ? "BANNING"
              : "PICKING",
          side: !slots.length
            ? "both"
            : slots[0].includes("-left-")
              ? "blue"
              : "red",
        })),
      },
    ]),
  );
  function timer(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 600
      ? number
      : null;
  }
  function phase(data, format = "normal") {
    const config = formats[format] || formats.normal;
    const parsed = Number(data?.current_phase),
      index = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
    return {
      ...config.phases[Math.min(index, config.phases.length - 1)],
      index,
    };
  }
  function slots(data) {
    const result = [];
    for (const [team, offset] of [
      ["blueside", 0],
      ["redside", 5],
    ])
      for (const [kind, start] of [
        ["pick", 1],
        ["ban", 11],
      ]) {
        for (let i = 0; i < 5; i++)
          result.push({
            id: start + offset + i,
            team,
            kind,
            index: i,
            hero:
              typeof data?.[team]?.[kind]?.[i]?.hero === "string"
                ? data[team][kind][i].hero
                : "",
          });
      }
    return result;
  }
  const filename = (value) =>
    String(value || "")
      .split(/[?#]/)[0]
      .split("/")
      .pop()
      .replace(/\.[^.]+$/, "")
      .toLowerCase();
  function hero(raw, list) {
    return (
      list.find((h) => h.img === raw || filename(h.img) === filename(raw)) ||
      null
    );
  }
  function valid(data) {
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      timer(data.timer) === null ||
      typeof data.timer_running !== "boolean"
    )
      return false;
    const index = Number(data.current_phase);
    if (!Number.isInteger(index) || index < 0) return false;
    return ["blueside", "redside"].every(
      (side) =>
        data[side] &&
        Array.isArray(data[side].pick) &&
        Array.isArray(data[side].ban),
    );
  }
  return { formats, timer, phase, slots, hero, valid };
});
