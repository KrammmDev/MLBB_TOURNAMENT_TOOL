(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id),
    params = new URLSearchParams(location.search),
    pinned = params.get("theme");
  let shared = {},
    legacy = false,
    api = {},
    page = 0,
    pages = [],
    key = "",
    clock,
    clockAnchor,
    stopped = false,
    reading = false,
    feedVersion = 0;
  const timers = [];
  const safe = root.RosterModel.safeImage;
  function parse(value) {
    try {
      return typeof value === "string" ? JSON.parse(value) : value;
    } catch {
      return null;
    }
  }
  function picture(node, value) {
    const src = safe(value);
    node.hidden = !src;
    if (src && node.dataset.source !== src) {
      node.dataset.source = src;
      node.onerror = () => {
        node.hidden = true;
      };
      node.src = src;
    }
  }
  function branding() {
    const title = shared["tournament-title"];
    $("schedule-event").textContent =
      typeof title === "string" && title.trim() ? title : "MATCH DAY";
  }
  function rebuild() {
    const entries = [];
    let casters = "";
    for (let i = 1; i <= 8; i++) {
      const d = parse(
        legacy ? shared["schedule-" + i] : api[i] || api["schedule-" + i],
      );
      if (!d || typeof d !== "object") continue;
      if (d.show === true) entries.push({ num: i, data: d });
      if (!casters && d.showCasters === true) casters = safe(d.castersImg);
    }
    pages = [];
    for (let i = 0; i < entries.length; i += 4)
      pages.push({ type: "matches", entries: entries.slice(i, i + 4) });
    if (casters && pages.length) pages.push({ type: "casters", src: casters });
    page = pages.length ? page % pages.length : 0;
    draw();
  }
  function draw() {
    const current = pages[page] || null,
      next = JSON.stringify(current);
    if (next === key) return;
    key = next;
    const host = $("schedule-cards");
    host.replaceChildren();
    $("schedule-empty").hidden = !!current;
    $("schedule-casters").hidden = current?.type !== "casters";
    $("schedule-heading").textContent =
      current?.type === "casters" ? "CASTERS" : "TODAY'S SCHEDULE";
    if (current?.type === "casters")
      picture($("schedule-casters"), current.src);
    for (const entry of current?.entries || []) {
      const d = entry.data,
        card = document.createElement("article");
      card.className = "schedule-card";
      const meta = document.createElement("div");
      meta.className = "schedule-meta";
      meta.textContent = d.time || "MATCH " + entry.num;
      const row = document.createElement("div");
      row.className = "schedule-versus";
      for (let i = 1; i <= 2; i++) {
        const team = document.createElement("div");
        team.className = "schedule-team";
        const img = document.createElement("img");
        img.alt = "";
        picture(img, d["logo" + i]);
        const name = document.createElement("span");
        name.textContent = d["team" + i] || "TBD";
        team.append(img, name);
        row.append(team);
        if (i === 1) {
          const score = document.createElement("div");
          score.className = "schedule-score";
          score.textContent =
            String(d.score1 || "0") + " – " + String(d.score2 || "0");
          row.append(score);
        }
      }
      card.append(meta, row);
      host.append(card);
    }
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      host.animate(
        [
          { opacity: 0, transform: "translateY(12px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" },
      );
  }
  async function theme() {
    if (stopped) return;
    try {
      let id = pinned;
      if (!id) {
        const r = await fetch("/api/broadcast-theme", { cache: "no-store" });
        if (!r.ok) return;
        id = RosterThemes.selection((await r.json()).data, "schedule").themeId;
      }
      await BroadcastThemeClient.apply(id, "schedule");
      if (!stopped) $("schedule-stage").hidden = false;
    } catch {
      /* Keep loaded style during a disconnect. */
    }
  }
  function tick() {
    if (!clock) return;
    $("schedule-timer").textContent = ProductionTimer.text(
      clock.data,
      clock.serverNow + performance.now() - clockAnchor,
    );
    $("schedule-timer-label").textContent = clock.data.label;
  }
  async function refresh() {
    if (stopped || reading) return;
    reading = true;
    const version = feedVersion;
    await Promise.allSettled([
      (async () => {
        const r = await fetch("/api/schedule", { cache: "no-store" });
        if (r.ok && !stopped) {
          const value = await r.json();
          if (!stopped && version === feedVersion) {
            const next = value && typeof value === "object" ? value : {};
            const changed = JSON.stringify(next) !== JSON.stringify(api);
            api = next;
            if (changed && !legacy) rebuild();
          }
        }
      })(),
      (async () => {
        const r = await fetch("/api/production-panel", { cache: "no-store" });
        if (r.ok && !stopped) {
          const value = await r.json();
          if (!stopped) {
            clock = value;
            clockAnchor = performance.now();
            $("schedule-footer").textContent = value.data.headline || "";
            tick();
          }
        }
      })(),
      (async () => {
        const r = await fetch("/api/scoreboard-branding", {
          cache: "no-store",
        });
        if (r.ok && !stopped) {
          const d = (await r.json()).data;
          const file = d?.logoFile;
          if (
            typeof file === "string" &&
            /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(file)
          ) {
            const img = $("schedule-brand");
            const src = "/scoreboard-logos/" + file;
            if (img.getAttribute("src") !== src) {
              img.hidden = true;
              img.onload = () => {
                img.hidden = false;
              };
              img.onerror = () => {
                img.hidden = true;
              };
              img.src = src;
            } else img.hidden = !(img.complete && img.naturalWidth > 0);
          } else $("schedule-brand").hidden = true;
        }
      })(),
    ]);
    reading = false;
  }
  function message(m) {
    if (m.type === "init" || m.type === "update") {
      feedVersion++;
      if (m.type === "init") {
        shared = {};
        legacy = false;
      }
      for (const [k, v] of Object.entries(m.data || {})) {
        if (/^schedule-[1-8]$/.test(k)) legacy = true;
        if (v === null) delete shared[k];
        else shared[k] = v;
      }
      branding();
      rebuild();
    } else if (m.type === "clear") {
      feedVersion++;
      shared = {};
      legacy = true;
      branding();
      rebuild();
    } else if (m.type === "schedule_update") {
      feedVersion++;
      api = m.data || {};
      legacy = false;
      rebuild();
    } else if (m.type === "roster_theme_update" && !pinned) theme();
    SponsorSlideshow.accept(m);
    BroadcastColorClient.accept(m);
  }
  function fit() {
    $("schedule-stage").style.transform =
      `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
  }
  try {
    for (let i = 1; i <= 8; i++) {
      const value = localStorage.getItem("schedule-" + i);
      if (value) {
        shared["schedule-" + i] = value;
        legacy = true;
      }
    }
    for (const k of ["tournament-title", "tournament-subtitle"]) {
      const value = localStorage.getItem(k);
      if (value) shared[k] = value;
    }
  } catch {}
  fit();
  branding();
  rebuild();
  SponsorSlideshow.start($("schedule-sponsors"));
  const stopMatch = MatchDataClient.subscribe(
    ({ data }) => {
      $("schedule-context").textContent = [
        data.matchInfo?.stage,
        data.matchInfo?.group || data.week,
      ]
        .filter(Boolean)
        .join(" / ");
    },
    () => {},
    { onMessage: message },
  );
  theme();
  refresh();
  timers.push(
    setInterval(refresh, 1000),
    setInterval(tick, 100),
    setInterval(theme, 15000),
    setInterval(() => {
      if (pages.length > 1) {
        page = (page + 1) % pages.length;
        draw();
      }
    }, 8000),
  );
  addEventListener("resize", fit);
  addEventListener("storage", (e) => {
    if (e.key === null) message({ type: "clear" });
    else if (/^schedule-[1-8]$/.test(e.key))
      message({ type: "update", data: { [e.key]: e.newValue } });
  });
  addEventListener("pagehide", () => {
    stopped = true;
    timers.forEach(clearInterval);
    stopMatch();
    BroadcastThemeClient.cancel();
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });
})(window);
