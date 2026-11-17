(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.ProductionTimer = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function milliseconds(state, now = Date.now()) {
    const elapsed = state.running ? Math.max(0, now - state.startedAt) : 0;
    return state.mode === "countup"
      ? state.valueMs + elapsed
      : Math.max(0, state.valueMs - elapsed);
  }
  function text(state, now = Date.now()) {
    const ms = milliseconds(state, now);
    if (state.mode === "countdown" && state.running && ms === 0)
      return state.endText;
    const sec = Math.floor(ms / 1000),
      hours = Math.floor(sec / 3600),
      minutes = state.format.includes("%0h")
        ? Math.floor(sec / 60) % 60
        : Math.floor(sec / 60);
    return state.format
      .replaceAll("%0h", String(hours).padStart(2, "0"))
      .replaceAll("%0m", String(minutes).padStart(2, "0"))
      .replaceAll("%0s", String(sec % 60).padStart(2, "0"));
  }
  return { milliseconds, text };
});
