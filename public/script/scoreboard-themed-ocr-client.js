/* Read-only OCR telemetry for the three existing scoreboard themes.
   Match metadata and theme selection remain owned by scoreboard-renderer.js. */
(() => {
  "use strict";
  const M = window.OCRModel;
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  const requested = query.get("ocr");
  const pinnedSource = ["custom", "legacy"].includes(requested) ? requested : null;
  const targets = Object.freeze({
    blueKills: "ocr-blue-kills", redKills: "ocr-red-kills",
    blueGold: "ocr-blue-gold", redGold: "ocr-red-gold",
    blueTower: "ocr-blue-tower", redTower: "ocr-red-tower",
    blueLord: "ocr-blue-lord", redLord: "ocr-red-lord",
    timer: "ocr-timer",
  });
  let telemetry = null, received = 0, context = null,
    legacy = {}, legacyAt = 0, fallbackHost = null,
    stopped = false, busy = false;
  const source = () => pinnedSource || telemetry?.source || "legacy";
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const count = (n, max) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
  function render() {
    const now = Date.now();
    const activeCustom = source() === "custom" && telemetry?.active &&
      !telemetry.preview && now - received < 4000 &&
      (!context || equal(context, telemetry.context));
    for (const [field,id] of Object.entries(targets)) {
      let value = null;
      if (source() === "custom") {
        const item = telemetry?.fields?.[field];
        if (activeCustom && item && item.value !== null && item.value !== undefined)
          value = item.value;
      } else if (now - legacyAt < 4000)
        value = legacy[field] ?? null;
      $(id).textContent = M.format(field, value);
    }
    const visible = telemetry?.showTurtles === true;
    document.querySelectorAll(".sb-ocr-turtle").forEach(el => { el.hidden = !visible; });
    document.documentElement.dataset.ocrSource = source();
  }
  function accept(snapshot) {
    if (!snapshot) return;
    telemetry = snapshot;
    received = Date.now();
    render();
  }
  function match(data) {
    context = M.context(data);
    for (const side of ["blue", "red"]) {
      const team = data.teamdata?.[side + "team"] || {};
      $("ocr-" + side + "-turtle").textContent =
        String(count(team.turtles ?? team.turtle, 3));
    }
    render();
  }
  async function json(url) {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(1600) });
    if (!res.ok) throw new Error("Unavailable");
    return res.json();
  }
  async function readLegacy() {
    let values;
    try { values = await json("http://localhost:14337/MLBB.json"); }
    catch {
      if (!fallbackHost) {
        const response = await fetch("/serverip.txt", {
          cache: "no-store", signal: AbortSignal.timeout(1600),
        });
        if (!response.ok) throw new Error("Legacy host unavailable");
        fallbackHost = (await response.text()).trim();
        if (!/^[a-zA-Z0-9.-]+$/.test(fallbackHost)) throw new Error("Invalid legacy host");
      }
      values = await json(`http://${fallbackHost}:14337/MLBB.json`);
    }
    if (source() !== "legacy" || stopped) return;
    legacy = Object.fromEntries(M.fields.map(f => [f.id,M.parse(f.id, values[f.legacy])]));
    legacyAt = Date.now();
  }
  async function poll() {
    if (busy || stopped) return;
    busy = true;
    try {
      try { accept(await json("/api/ocr/state")); }
      catch { /* Do not let a disconnected OCR API display obsolete scores. */ }
      if (source() === "legacy") {
        try { await readLegacy(); } catch { /* Blank after legacy freshness expires. */ }
      }
    } finally {
      busy = false;
      if (!stopped) render();
    }
  }
  const stopMatch = window.MatchDataClient.subscribe(
    ({ data }) => match(data),
    () => {},
    { onMessage(message) {
      if (message.type === "ocr_update") accept(message.data);
    } },
  );
  const polling = setInterval(poll, 1000);
  const expiry = setInterval(render, 250);
  window.addEventListener("pagehide", () => {
    stopped = true;
    clearInterval(polling);
    clearInterval(expiry);
    stopMatch();
  });
  render();
  poll();
})();
