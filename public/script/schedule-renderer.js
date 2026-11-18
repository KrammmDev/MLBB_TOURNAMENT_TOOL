(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id),
    params = new URLSearchParams(location.search),
    pinned = params.get("theme");
  let shared = {},
    legacy = false,
    api = {},
    sponsors = [],
    page = 0,
    pages = [],
    key = "",
    clock,
    clockAnchor,
    stopped = false,
    reading = false,
    feedVersion = 0,
    tickerKey = "",
    sponsorIndex = 0,
    drawnTheme = null;
  const timers = [];
  const PAGE_HOLD_MS = 8000,
    PAN_MS = 450;
  let panAnimation = null,
    panVersion = 0;
  const CARD_STAGGER_MS = 200;
  function panTargets(current, changePanel) {
    if (current?.type === "matches") {
      const cards = [...$("schedule-cards").children];
      // The title stays fixed across match pages, and only moves for a panel change.
      return changePanel ? [$("schedule-heading"), ...cards] : cards;
    }
    return [
      current?.type === "talents"
        ? $("schedule-talents")
        : document.querySelector(".schedule-sidebar"),
    ];
  }
  function pan(nodes, entering) {
    const axis = document.body.dataset.scheduleTheme === "arena" ? "Y" : "X";
    const animations = nodes.map((node, index) =>
      node.animate(
        entering
          ? [
              { opacity: 0, transform: `translate${axis}(50px)` },
              { opacity: 1, transform: `translate${axis}(0)` },
            ]
          : [
              { opacity: 1, transform: `translate${axis}(0)` },
              { opacity: 0, transform: `translate${axis}(-50px)` },
            ],
        {
          duration: PAN_MS,
          delay: index * CARD_STAGGER_MS,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: entering ? "backwards" : "forwards",
        },
      ),
    );
    return {
      finished: Promise.all(animations.map((a) => a.finished)),
      cancel: () => animations.forEach((a) => a.cancel()),
    };
  }
  async function advancePage() {
    if (stopped || pages.length < 2 || panAnimation) return;
    const version = panVersion;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextPage = (page + 1) % pages.length;
    const changePanel = pages[page]?.type !== pages[nextPage]?.type;
    if (!reduced) {
      panAnimation = pan(panTargets(pages[page], changePanel), false);
      try {
        await panAnimation.finished;
      } catch {
        return;
      }
      if (stopped || version !== panVersion) return;
    }
    page = nextPage;
    draw();
    if (!reduced && !stopped) {
      panAnimation = pan(panTargets(pages[page], changePanel), true);
      const animation = panAnimation;
      try {
        await animation.finished;
      } catch {
        return;
      }
      if (panAnimation === animation) panAnimation = null;
    }
  }
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
    if (node.dataset.source === src && src) return;
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
      typeof title === "string" && title.trim()
        ? title
        : "15TH LCUAA ESPORTS MLBB";
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
    picture($("schedule-casters"), casters);
    $("schedule-talents").hidden = !casters;
    pages = [];
    const pageSize = document.body.dataset.scheduleTheme === "studio" ? 4 : 3;
    for (let i = 0; i < entries.length; i += pageSize)
      pages.push({ type: "matches", entries: entries.slice(i, i + pageSize) });
    if (
      ["studio", "classic"].includes(document.body.dataset.scheduleTheme) &&
      casters
    )
      pages.push({ type: "talents" });
    page = pages.length ? page % pages.length : 0;
    draw();
  }
  function draw() {
    const current = pages[page] || null,
      next = JSON.stringify(current);
    const studio = ["studio", "classic"].includes(
      document.body.dataset.scheduleTheme,
    );
    if (["classic", "arena"].includes(document.body.dataset.scheduleTheme))
      document.querySelector("#schedule-talents h2").textContent = "CASTERS";
    else document.querySelector("#schedule-talents h2").textContent = "TALENTS";
    document.body.dataset.schedulePanel =
      studio && current?.type === "talents" ? "talents" : "matches";
    const themeId = document.body.dataset.scheduleTheme;
    if (next + themeId === key) return;
    const initialArena = themeId === "arena" && drawnTheme !== themeId;
    drawnTheme = themeId;
    panVersion++;
    if (panAnimation) {
      panAnimation.cancel();
      panAnimation = null;
    }
    key = next + themeId;
    const host = $("schedule-cards");
    host.replaceChildren();
    $("schedule-empty").hidden = !!current;
    $("schedule-heading").textContent =
      current?.type === "partners" ? "PARTNERS" : "TODAY'S SCHEDULE";
    host.hidden = current?.type === "partners";
    const partners = $("schedule-partners");
    partners.hidden = current?.type !== "partners";
    partners.replaceChildren();
    for (const logo of current?.logos || []) {
      const img = document.createElement("img");
      img.alt = logo.name || "Partner";
      img.src = "/broadcast-sponsors/" + logo.file;
      img.onerror = () => {
        img.hidden = true;
      };
      partners.append(img);
    }
    for (const entry of current?.entries || []) {
      const d = entry.data,
        card = document.createElement("article");
      card.className = "schedule-card";
      const meta = document.createElement("div");
      meta.className = "schedule-meta";
      const matchLabel = String(d.time || "MATCH " + entry.num);
      const series = matchLabel.match(/\bBO\s*([1-9][0-9]?)\b/i);
      meta.textContent =
        document.body.dataset.scheduleTheme === "classic" && series
          ? matchLabel
              .replace(series[0], "")
              .replace(/\s*[·|–-]\s*$/, "")
              .trim() || "MATCH " + entry.num
          : matchLabel;
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
      if (document.body.dataset.scheduleTheme === "classic") {
        const format = document.createElement("span");
        format.className = "schedule-series";
        format.textContent = series ? "BO" + series[1] : "";
        format.hidden = !series;
        card.append(format);
        // Reuse the safe logo URL as a subtle team watermark.
        for (let i = 1; i <= 2; i++) {
          const mark = document.createElement("img");
          mark.className = "schedule-watermark schedule-watermark-" + i;
          mark.alt = "";
          mark.setAttribute("aria-hidden", "true");
          picture(mark, d["logo" + i]);
          card.prepend(mark);
        }
      }
      host.append(card);
    }
    if (
      initialArena &&
      host.children.length &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      panAnimation = pan([...host.children], true);
      const animation = panAnimation;
      animation.finished
        .then(() => {
          if (panAnimation === animation) panAnimation = null;
        })
        .catch(() => {});
    }
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
      if (!stopped) {
        $("schedule-stage").hidden = false;
        rebuild();
      }
    } catch {
      /* Keep loaded style during a disconnect. */
    }
  }
  function acceptSponsors(data) {
    if (!data || !Array.isArray(data.logos)) return;
    const next = data.enabled
      ? data.logos
          .filter(
            (logo) =>
              logo &&
              typeof logo.file === "string" &&
              /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(logo.file),
          )
          .slice(0, 20)
      : [];
    if (JSON.stringify(next) !== JSON.stringify(sponsors)) {
      sponsors = next;
      sponsorIndex = 0;
      sponsorLogo();
      rebuild();
    }
  }
  function sponsorLogo() {
    const logo = sponsors[sponsorIndex % sponsors.length];
    $("schedule-sponsor").hidden = !logo;
    if (logo) {
      const img = $("schedule-sponsor-logo");
      const src = "/broadcast-sponsors/" + logo.file;
      if (img.getAttribute("src") !== src) {
        img.hidden = true;
        img.onload = () => {
          img.hidden = false;
        };
        img.onerror = () => {
          img.hidden = true;
        };
        img.src = src;
      }
    }
  }
  function ticker(data) {
    const text = typeof data.ticker === "string" ? data.ticker.trim() : "";
    const next = JSON.stringify([
      text,
      data.tickerSeconds,
      document.body.dataset.scheduleTheme,
    ]);
    $("schedule-ticker").hidden = !text;
    if (tickerKey === next) return;
    tickerKey = next;
    const track = $("schedule-ticker-track");
    track.replaceChildren();
    if (!text) return;
    // Two identical groups cover the viewport and meet at an exact loop boundary.
    const group = document.createElement("span");
    const copy = text + "   •   ";
    group.textContent = copy;
    track.append(group);
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = getComputedStyle(group).font || "24px Arial";
    while (measure.measureText(group.textContent).width < 1920)
      group.textContent += copy;
    track.append(group.cloneNode(true));
    track.style.animationDuration =
      Math.max(5, Math.min(300, Number(data.tickerSeconds) || 25)) + "s";
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
        const r = await fetch("/api/broadcast-sponsors", { cache: "no-store" });
        if (r.ok && !stopped) acceptSponsors((await r.json()).data);
      })(),
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
            ticker(value.data);
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
    if (m.type === "broadcast_sponsors_update") acceptSponsors(m.data);
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
    setInterval(() => {
      sponsorIndex++;
      sponsorLogo();
    }, 8000),
    setInterval(tick, 100),
    setInterval(theme, 15000),
    setInterval(advancePage, PAGE_HOLD_MS + (PAN_MS + CARD_STAGGER_MS * 4) * 2),
  );
  addEventListener("resize", fit);
  addEventListener("storage", (e) => {
    if (e.key === null) message({ type: "clear" });
    else if (/^schedule-[1-8]$/.test(e.key))
      message({ type: "update", data: { [e.key]: e.newValue } });
  });
  addEventListener("pagehide", () => {
    stopped = true;
    panVersion++;
    if (panAnimation) panAnimation.cancel();
    timers.forEach(clearInterval);
    stopMatch();
    BroadcastThemeClient.cancel();
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });
})(window);
