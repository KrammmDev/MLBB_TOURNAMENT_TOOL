"use strict";
const { timer } = require("../public/script/draft-model");
// Keep REST/reconnect snapshots current without adding a draft-file write for each clock tick.
function mirrorDraftTimer(current, tick) {
  if (
    !current?.draftdata ||
    !tick ||
    typeof tick !== "object" ||
    Array.isArray(tick)
  )
    return current;
  const value = timer(tick.timer);
  if (value === null || typeof tick.timer_running !== "boolean") return current;
  return {
    ...current,
    draftdata: {
      ...current.draftdata,
      timer: String(value),
      timer_running: tick.timer_running,
      ...(timer(tick.timer_duration) > 0 ? { timer_duration: Number(tick.timer_duration) } : {}),
    },
  };
}
module.exports = { mirrorDraftTimer };
