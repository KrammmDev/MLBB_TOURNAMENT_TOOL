/* One roster renderer for every preset and both legacy entry points. */
(function (root) {
  "use strict";
  const model = root.RosterModel,
    catalog = root.RosterThemes;
  const lanes = {
    gold: "gold",
    junggle: "junggle",
    jungle: "junggle",
    mid: "mid",
    roam: "roam",
    exp: "exp",
  };
  const brandingKeys = [
    "tournament-title",
    "tournament-subtitle",
    "anniversary-text",
    "bottom-logo",
    "bottom-text",
    "sponsor-label",
    "sponsor-name",
    "sponsor-image",
    "countdown-target",
  ];
  let mounted = false;
  function start(options = {}) {
    if (mounted) return;
    mounted = true;
    const params = new URLSearchParams(location.search);
    const pinned = options.themeId || params.get("theme");
    let latest = null,
      pairs = [],
      index = 0,
      slidesKey = "",
      target = 0,
      theme = root.RosterThemes.themes[0];
    let stopMatch = null,
      themePoll = null,
      tickTimer = null,
      slideTimer = null,
      stopped = false,
      themeReadGeneration = 0;
    const branding = Object.create(null),
      leaveTimers = new Map();
    const el = (id) => document.getElementById(id);
    const text = (id, value) => {
      const node = el(id);
      if (node) node.textContent = value;
    };
    function stored(key, fallback = "") {
      if (Object.hasOwn(branding, key)) return branding[key] || fallback;
      try {
        return localStorage.getItem(key) || fallback;
      } catch {
        return fallback;
      }
    }
    function image(node, candidates) {
      const list = [...new Set(candidates.filter(Boolean))];
      let next = 0;
      node.style.visibility = "";
      node.onerror = () => {
        if (next < list.length) node.src = list[next++];
        else {
          node.onerror = null;
          node.style.visibility = "hidden";
        }
      };
      node.src = list[next++] || model.transparent;
    }
    function brandingView() {
      text("tournament-title", stored("tournament-title", "MLBB"));
      const subtitle = stored("tournament-subtitle");
      text("tournament-subtitle", subtitle);
      el("tournament-subtitle").style.display = subtitle
        ? "inline-block"
        : "none";
      const badge = stored("anniversary-text");
      text("anniversary-text", badge);
      document.querySelector(".badge-block").style.display = badge
        ? ""
        : "none";
      text("bottom-logo", stored("bottom-logo", "MLBB"));
      text("bottom-text", stored("bottom-text", "BROADCAST OVERLAY"));
      text("sponsor-label", stored("sponsor-label", "PARTNER IN ESPORTS"));
      const sponsor = stored("sponsor-name"),
        src = model.safeImage(stored("sponsor-image")),
        holder = el("sponsor-name");
      if (src) {
        if (holder.firstElementChild?.getAttribute("data-source") !== src) {
          const img = document.createElement("img");
          img.alt = sponsor || "Sponsor";
          img.dataset.source = src;
          image(img, [src, model.transparent]);
          holder.replaceChildren(img);
        }
      } else holder.textContent = sponsor;
      const block = document.querySelector(".sponsor-block");
      block.classList.toggle("has-image", Boolean(src));
      block.style.display = src || sponsor ? "" : "none";
      const candidate = Number(stored("countdown-target"));
      target = Number.isFinite(candidate) ? candidate : 0;
      tick();
    }
    function tick() {
      const seconds = Math.max(0, Math.floor((target - Date.now()) / 1000));
      text(
        "countdown-timer",
        String(Math.floor(seconds / 60)).padStart(2, "0") +
          ":" +
          String(seconds % 60).padStart(2, "0"),
      );
    }
    function card(player, solo) {
      const card = document.createElement("div");
      card.className = "player-card " + player.side + (solo ? " solo" : "");
      const wrapper = document.createElement("div");
      wrapper.className = "player-image-wrapper";
      const photo = document.createElement("img");
      photo.className = "player-image";
      photo.alt = player.name;
      image(photo, player.images);
      wrapper.append(photo);
      const bar = document.createElement("div");
      bar.className = "player-name-bar";
      const box = document.createElement("div");
      box.className = "player-name-box";
      const name = document.createElement("span");
      name.className = "player-name-text";
      name.textContent = player.name;
      box.append(name);
      if (lanes[player.lane]) {
        const lane = document.createElement("img");
        lane.className = "player-lane-icon";
        lane.alt = player.lane.toUpperCase();
        image(lane, [
          "/Assets/lane/" + lanes[player.lane] + ".png",
          model.transparent,
        ]);
        box.append(lane);
      }
      bar.append(box);
      card.append(wrapper, bar);
      return card;
    }
    function show(next) {
      const slides = el("player-slideshow").querySelectorAll(".player-slide");
      slides.forEach((slide, i) => {
        clearTimeout(leaveTimers.get(slide));
        leaveTimers.delete(slide);
        if (i === next) {
          slide.classList.remove("leaving");
          slide.classList.add("active");
        } else if (slide.classList.contains("active")) {
          slide.classList.remove("active");
          slide.classList.add("leaving");
          leaveTimers.set(
            slide,
            setTimeout(() => {
              slide.classList.remove("leaving");
              leaveTimers.delete(slide);
            }, theme.exitMs),
          );
        }
      });
    }
    function render(data) {
      latest = data;
      brandingView();
      const blue = data.teamdata?.blueteam || {},
        red = data.teamdata?.redteam || {};
      text("team1-code", blue.teamname || blue.name || "BLUE");
      text("team2-code", red.teamname || red.name || "RED");
      text("blue-score", parseInt(blue.score, 10) || 0);
      text("red-score", parseInt(red.score, 10) || 0);
      text("coach-blue", blue.coach || "-");
      text("coach-red", red.coach || "-");
      text("match-label", data.matchInfo?.match || "MATCH 1");
      text(
        "match-format",
        "BO" + String(data.matchFormat || 3).replace(/^bo/i, ""),
      );
      for (const [id, src] of [
        ["team1-logo", blue.logo],
        ["team2-logo", red.logo],
      ]) {
        const safe = model.safeImage(src) || model.transparent;
        if (el(id).dataset.source !== safe) {
          el(id).dataset.source = safe;
          image(el(id), [safe, model.transparent]);
        }
      }
      const nextPairs = model.pairs(data),
        key = JSON.stringify(nextPairs.map(model.key));
      if (key === slidesKey) return;
      slidesKey = key;
      pairs = nextPairs;
      index = Math.min(index, Math.max(0, pairs.length - 1));
      for (const timer of leaveTimers.values()) clearTimeout(timer);
      leaveTimers.clear();
      const container = el("player-slideshow");
      container.replaceChildren();
      if (!pairs.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No Players";
        container.append(empty);
      }
      for (const pair of pairs) {
        const slide = document.createElement("div");
        slide.className = "player-slide";
        for (const player of [pair.blue, pair.red])
          if (player) slide.append(card(player, !(pair.blue && pair.red)));
        container.append(slide);
      }
      show(index);
      if (params.has("debug")) {
        let box = el("debug-box");
        if (!box) {
          box = document.createElement("pre");
          box.id = "debug-box";
          box.style.cssText =
            "position:absolute;top:0;left:0;z-index:100;background:#000;color:#0f0;font:14px monospace;max-width:1000px;white-space:pre-wrap;";
          el("stage").append(box);
        }
        box.textContent = JSON.stringify(pairs, null, 2);
      }
    }
    function fit() {
      const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
      el("stage").style.transform = `scale(${scale})`;
    }
    async function select(id) {
      try {
        const result = await root.RosterThemeClient.apply(id);
        if (result) {
          theme = result;
          for (const timer of leaveTimers.values()) clearTimeout(timer);
          leaveTimers.clear();
          for (const slide of el("player-slideshow").querySelectorAll(
            ".leaving",
          ))
            slide.classList.remove("leaving");
        }
      } catch (error) {
        console.error("Roster retained previous theme:", error.message);
      } finally {
        if (!stopped) el("stage").style.visibility = "";
      }
    }
    async function refreshTheme() {
      if (pinned || stopped) return;
      const request = ++themeReadGeneration;
      try {
        const response = await fetch("/api/roster-theme", {
          cache: "no-store",
        });
        if (!response.ok) throw Error("Theme settings unavailable");
        const snapshot = await response.json();
        if (request === themeReadGeneration && !stopped)
          await select(snapshot.data.themeId);
      } catch (error) {
        console.error(error.message);
        if (!stopped) el("stage").style.visibility = "";
      }
    }
    function onMessage(message) {
      if (message.type === "roster_theme_update" && !pinned) {
        themeReadGeneration++;
        select(message.data.themeId);
      }
      if (message.type === "init" || message.type === "update") {
        const source = message.data || {};
        let changed = false;
        for (const key of brandingKeys)
          if (Object.hasOwn(source, key)) {
            branding[key] =
              typeof source[key] === "string" ? source[key] : null;
            changed = true;
          }
        if (changed) brandingView();
      } else if (message.type === "clear") {
        for (const key of brandingKeys) branding[key] = null;
        brandingView();
      }
    }
    function transport() {
      stopped = false;
      stopMatch = root.MatchDataClient.subscribe(
        (snapshot) => render(snapshot.data),
        (status) => {
          if (status === "connected") refreshTheme();
        },
        { onMessage },
      );
      tickTimer = setInterval(tick, 1000);
      slideTimer = setInterval(() => {
        if (pairs.length > 1) {
          index = (index + 1) % pairs.length;
          show(index);
        }
      }, 6000);
      themePoll = setInterval(refreshTheme, 15000);
      if (pinned) select(pinned);
      else refreshTheme();
    }
    function stop() {
      stopped = true;
      themeReadGeneration++;
      stopMatch?.();
      root.RosterThemeClient.cancel();
      clearInterval(tickTimer);
      clearInterval(slideTimer);
      clearInterval(themePoll);
      for (const timer of leaveTimers.values()) clearTimeout(timer);
      leaveTimers.clear();
    }
    root.addEventListener("resize", fit);
    root.addEventListener("storage", (event) => {
      if (event.key === null) {
        for (const key of brandingKeys) delete branding[key];
        brandingView();
      } else if (brandingKeys.includes(event.key)) {
        branding[event.key] = event.newValue;
        brandingView();
      }
    });
    root.addEventListener("pagehide", stop);
    root.addEventListener("pageshow", (event) => {
      if (event.persisted && stopped) transport();
    });
    root.updateOverlay = root.updateDisplay = () => {
      if (latest) render(latest);
    };
    fit();
    transport();
    root.RosterOverlay.state = () => ({
      themeId: document.body.dataset.rosterTheme,
      index,
      pairs: pairs.length,
    });
  }
  root.RosterOverlay = { start };
})(window);
