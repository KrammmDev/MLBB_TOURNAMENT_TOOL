/* Display telemetry only. Match identity, series wins and turtles remain match data. */
(() => {
  "use strict";
  const M = window.OCRModel,
    $ = (id) => document.getElementById(id);
  const pinned = new URLSearchParams(location.search).get("ocr");
  let state,
    received = 0,
    matchContext,
    stopped = false,
    reading = false,
    version = 0,
    legacyHost;
  let legacy = {},
    legacyAt = 0;
  const source = () =>
    ["custom", "legacy"].includes(pinned) ? pinned : state?.source || "legacy";
  function accept(next) {
    if (!next) return;
    if (
      state?.source !== next.source ||
      state?.generation !== next.generation
    ) {
      version++;
      legacy = {};
      legacyAt = 0;
    }
    state = next;
    received = Date.now();
    render();
  }
  function render() {
    const values = {},
      custom = source() === "custom",
      elapsed = Date.now() - received;
    const sameGame =
      !matchContext ||
      JSON.stringify(matchContext) === JSON.stringify(state?.context);
    for (const spec of M.fields) {
      const item = state?.fields?.[spec.id];
      const value = custom
        ? sameGame &&
          state?.active &&
          !state.preview &&
          elapsed < 4000 &&
          item &&
          (item.locked || (item.ageMs !== null && item.ageMs + elapsed <= 4000))
          ? item.value
          : null
        : Date.now() - legacyAt < 4000
          ? (legacy[spec.id] ?? null)
          : null;
      values[spec.id] = value;
      const node = $(spec.target);
      if (node) node.textContent = M.format(spec.id, value);
    }
    const lead = $("goldLead"),
      value = $("goldleadValue");
    if (lead && value) {
      const known = values.blueGold !== null && values.redGold !== null,
        difference = known ? values.blueGold - values.redGold : 0;
      lead.hidden = !known;
      lead.classList.toggle("blue-lead", difference > 0);
      lead.classList.toggle("red-lead", difference < 0);
      lead.classList.toggle("even", difference === 0);
      value.textContent = difference
        ? `+${M.format("blueGold", Math.abs(difference))}`
        : "";
    }
    document.documentElement.dataset.ocrSource = source();
  }
  const count = (value, max) =>
    Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
  function metadata(data) {
    matchContext = M.context(data);
    const wins = { 1: 1, 3: 2, 5: 3, 7: 4 }[data.matchFormat] || 3;
    for (const [side, name, imgId] of [
      ["blue", "name-box-1", "displayImage1"],
      ["red", "name-box-8", "displayImage2"],
    ]) {
      const team = data.teamdata?.[side + "team"] || {};
      $(name).textContent = String(team.teamname || "");
      const img = $(imgId),
        src = window.RosterModel.safeImage(team.logo);
      if (img.dataset.source !== src) {
        img.dataset.source = src;
        img.style.visibility = src ? "visible" : "hidden";
        img.onerror = () => {
          img.style.visibility = "hidden";
        };
        if (src) img.src = src;
        else img.removeAttribute("src");
      }
      const dots = $(side + "-score-display");
      while (dots.children.length > wins) dots.lastChild.remove();
      while (dots.children.length < wins) {
        const dot = document.createElement("div");
        dot.className = "dot";
        dots.append(dot);
      }
      [...dots.children].forEach((dot, i) =>
        dot.classList.toggle("active", i < count(team.score, wins)),
      );
      const turtles = $(side + "-turtle-container"),
        total = count(team.turtles ?? team.turtle, 3);
      while (turtles.children.length > total) turtles.lastChild.remove();
      while (turtles.children.length < total) {
        const icon = document.createElement("img");
        icon.src = "Assets/Other/turtle-icon.png";
        icon.className = "turtle-icon-img";
        icon.alt = "Turtle";
        turtles.append(icon);
      }
    }
    $("matchinfo-main").textContent = String(
      data.matchInfo?.stage || data.season || "",
    ).toUpperCase();
    $("matchinfo-day").textContent = String(
      data.matchInfo?.group || data.week || "",
    ).toUpperCase();
    $("matchinfo-match").textContent = [
      data.matchInfo?.match,
      data.matchInfo?.game ||
        (data.game_number ? `GAME ${data.game_number}` : ""),
    ]
      .filter(Boolean)
      .join(" - ")
      .toUpperCase();
    render();
  }
  async function json(url) {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw Error("Unavailable");
    return response.json();
  }
  async function poll() {
    if (reading || stopped) return;
    reading = true;
    try {
      try {
        const next = await json("/api/ocr/state");
        if (!stopped) accept(next);
      } catch {
        /* Expire locally during a server outage. */
      }
      if (source() !== "legacy" || stopped) return;
      const started = version;
      let data;
      try {
        data = await json("http://localhost:14337/MLBB.json");
      } catch {
        if (!legacyHost) {
          const response = await fetch("/serverip.txt", {
            cache: "no-store",
            signal: AbortSignal.timeout(1500),
          });
          if (!response.ok) throw Error("No host");
          const host = (await response.text()).trim();
          if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw Error("Invalid host");
          legacyHost = host;
        }
        data = await json(`http://${legacyHost}:14337/MLBB.json`);
      }
      if (!stopped && started === version && source() === "legacy") {
        legacy = Object.fromEntries(
          M.fields.map((spec) => [
            spec.id,
            M.parse(spec.id, data[spec.legacy]),
          ]),
        );
        legacyAt = Date.now();
      }
    } catch {
      /* Unknown stays unknown; never synthesize zeros or a ticking game clock. */
    } finally {
      reading = false;
      render();
    }
  }
  const stopMatch = window.MatchDataClient.subscribe(
    ({ data }) => metadata(data),
    () => {},
    {
      onMessage(message) {
        if (message.type === "ocr_update") accept(message.data);
      },
    },
  );
  const interval = setInterval(poll, 1000),
    expiry = setInterval(render, 250);
  window.addEventListener("pagehide", () => {
    stopped = true;
    clearInterval(interval);
    clearInterval(expiry);
    stopMatch();
  });
  render();
  poll();
})();
