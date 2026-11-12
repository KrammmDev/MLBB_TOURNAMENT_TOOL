/* One post-draft renderer; stable image nodes keep GIFs running across updates. */
(function (root) {
  "use strict";
  const el = (id) => document.getElementById(id),
    safe = root.RosterModel.safeImage,
    model = root.DraftModel;
  const pinned = new URLSearchParams(location.search).get("theme"),
    validTheme = (id) => root.RosterThemes.themes.some((t) => t.id === id);
  let match = {},
    draft = null,
    heroes = [],
    stopped = false,
    stopMatch,
    poll,
    draftVersion = 0,
    themeVersion = 0,
    readingDraft = false,
    readingTheme = false,
    readingHeroes = false,
    readingBranding = false,
    brandingVersion = 0;
  const cards = [];
  for (const [side, start, ids] of [
    ["blue", 3, [1, 2, 3, 4, 5]],
    ["red", 10, [5, 4, 3, 2, 1]],
  ]) {
    for (const position of ids) {
      const i = position - 1,
        card = document.createElement("article");
      card.className = "pd-card";
      card.dataset.index = i;
      card.innerHTML =
        '<img class="pd-art" alt="" hidden/><img class="pd-player" alt="" hidden/><img class="pd-lane" alt="" hidden/><div class="pd-label"><div class="pd-player-name"></div><div class="pd-hero-name"></div></div>';
      card.querySelector(".pd-art").id =
        "image-display-" + (side === "blue" ? position : 5 + position);
      card.querySelector(".pd-player-name").id = "name-box-" + (start + i);
      el("pd-" + side + "-bank").append(card);
      cards.push({ side, index: i, node: card });
    }
  }
  function image(node, candidates) {
    const sources = [...new Set(candidates.filter(Boolean))],
      key = JSON.stringify(sources);
    const retryPhoto =
      node.classList.contains("pd-player") &&
      sources.length &&
      node.hidden &&
      node.complete &&
      Date.now() >= Number(node.dataset.retryAt || Infinity);
    if (node.dataset.key === key && !retryPhoto) return;
    node.dataset.key = key;
    node.hidden = true;
    const photoCard = node.classList.contains("pd-player")
      ? node.closest(".pd-card")
      : null;
    photoCard?.classList.remove("has-photo");
    let next = 0;
    node.onload = () => {
      if (node.dataset.key === key && next > 0) {
        node.hidden = false;
        delete node.dataset.retryAt;
        photoCard?.classList.add("has-photo");
      }
    };
    node.onerror = () => {
      if (node.dataset.key !== key) return;
      if (next < sources.length) node.src = sources[next++];
      else {
        node.hidden = true;
        if (photoCard) node.dataset.retryAt = String(Date.now() + 15000);
        photoCard?.classList.remove("has-photo");
      }
    };
    if (sources.length) node.src = sources[next++];
    else node.removeAttribute("src");
  }
  function heroSources(raw) {
    const hero = model.hero(raw, heroes),
      source = safe(raw),
      catalog = safe(hero?.img),
      isGif = (value) => /\.gif(?:[?#]|$)/i.test(value || "");
    const gif = isGif(catalog)
      ? catalog
      : isGif(source)
        ? source
        : source?.replace(/\.(png|jpe?g|webp)(?=[?#]|$)/i, ".gif");
    const still = isGif(catalog)
      ? catalog.replace(/\.gif(?=[?#]|$)/i, ".png")
      : catalog;
    return { hero, sources: [gif, source, still, catalog].filter(Boolean) };
  }
  function render() {
    const wins = { 1: 1, 3: 2, 5: 3, 7: 4 }[match.matchFormat] || 2;
    for (const side of ["blue", "red"]) {
      const team =
        match.teamdata?.[side === "blue" ? "blueteam" : "redteam"] || {};
      el("name-box-" + (side === "blue" ? 1 : 8)).textContent =
        team.teamname || team.name || "";
      image(el("displayImage" + (side === "blue" ? 1 : 2)), [safe(team.logo)]);
      const host = el(side + "-score-display");
      while (host.children.length > wins) host.lastChild.remove();
      while (host.children.length < wins) {
        const dot = document.createElement("span");
        dot.className = "pd-win";
        host.append(dot);
      }
      [...host.children].forEach((dot, i) =>
        dot.classList.toggle("active", i < Number(team.score || 0)),
      );
    }
    el("display-match-text").textContent = match.matchInfo?.match || "";
    el("display-game-text").textContent = match.matchInfo?.game || "";
    const lanes = {
      gold: "gold",
      jungle: "junggle",
      junggle: "junggle",
      mid: "mid",
      exp: "exp",
      roam: "roam",
    };
    for (const { side, index, node } of cards) {
      const team =
          match.teamdata?.[side === "blue" ? "blueteam" : "redteam"] || {},
        player = team.playerlist?.[index] || {},
        raw =
          draft?.[side === "blue" ? "blueside" : "redside"]?.pick?.[index]
            ?.hero || "",
        resolved = heroSources(raw),
        selected = Boolean(raw && resolved.sources.length);
      node.classList.toggle("has-hero", selected);
      image(node.querySelector(".pd-art"), selected ? resolved.sources : []);
      const rawPhoto =
        player.image ||
        player.photo ||
        player.img ||
        player.picture ||
        player.playerImage ||
        "";
      let portrait = safe(rawPhoto);
      if (
        !portrait &&
        typeof rawPhoto === "string" &&
        rawPhoto.trim() &&
        !/[:/\\]/.test(rawPhoto.replace(/^\/?player\//i, ""))
      ) {
        let filename = rawPhoto.trim().replace(/^\/?player\//i, "");
        if (!/\.(png|jpe?g|gif|webp)$/i.test(filename)) filename += ".png";
        portrait = "/Assets/player/" + encodeURIComponent(filename);
      }
      const namedPhoto = player.name
        ? "/Assets/player/" + encodeURIComponent(player.name) + ".png"
        : "";
      image(node.querySelector(".pd-player"), [portrait, namedPhoto]);
      node.querySelector(".pd-player-name").textContent =
        player.name || player.ign || "";
      node.querySelector(".pd-hero-name").textContent = selected
        ? resolved.hero?.name || ""
        : "";
      const lane = lanes[String(player.lane || "").toLowerCase()];
      image(
        node.querySelector(".pd-lane"),
        lane ? ["/Assets/lane/" + lane + ".png"] : [],
      );
    }
  }
  async function readDraft() {
    if (stopped || readingDraft) return;
    readingDraft = true;
    const version = draftVersion;
    try {
      const response = await fetch("/api/matchdraft", { cache: "no-store" });
      if (response.ok) {
        const value = await response.json(),
          data = value.draftdata || value;
        if (!stopped && version === draftVersion && model.valid(data)) {
          draft = data;
          render();
        }
      }
    } catch {
    } finally {
      readingDraft = false;
    }
  }
  async function loadHeroes() {
    if (stopped || readingHeroes || heroes.length) return;
    readingHeroes = true;
    try {
      const response = await fetch("/database/herolist.json", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        if (!stopped && Array.isArray(data)) {
          heroes = data;
          render();
        }
      }
    } catch {
    } finally {
      readingHeroes = false;
    }
  }
  function branding(data) {
    const file = data?.logoFile;
    if (
      file === null ||
      (typeof file === "string" &&
        /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(file))
    )
      image(
        el("pd-tournament-logo"),
        file ? ["/scoreboard-branding/" + file] : [],
      );
  }
  async function readBranding() {
    if (stopped || readingBranding) return;
    readingBranding = true;
    const version = brandingVersion;
    try {
      const response = await fetch("/api/scoreboard-branding", {
        cache: "no-store",
      });
      if (response.ok) {
        const value = await response.json();
        if (!stopped && version === brandingVersion) branding(value.data);
      }
    } catch {
    } finally {
      readingBranding = false;
    }
  }
  async function apply(id) {
    if (stopped || !validTheme(id)) return;
    try {
      await root.BroadcastThemeClient.apply(id, "postdraft");
    } catch {}
  }
  async function readTheme() {
    if (pinned || stopped || readingTheme) return;
    readingTheme = true;
    const version = themeVersion;
    try {
      const response = await fetch("/api/broadcast-theme", {
        cache: "no-store",
      });
      if (response.ok) {
        const value = await response.json();
        if (!stopped && version === themeVersion)
          await apply(value.data?.themeId);
      }
    } catch {
    } finally {
      readingTheme = false;
    }
  }
  function start() {
    if (stopMatch) return;
    stopped = false;
    stopMatch = root.MatchDataClient.subscribe(
      ({ data }) => {
        match = data;
        render();
      },
      (status) => {
        if (status === "connected") {
          readDraft();
          readTheme();
          loadHeroes();
        }
      },
      {
        onMessage(message) {
          root.BroadcastColorClient.accept(message);
          if (message.type === "scoreboard_branding_update") {
            brandingVersion++;
            branding(message.data);
          }
          if (message.type === "roster_theme_update" && !pinned) {
            themeVersion++;
            apply(message.data?.themeId);
          }
          if (
            message.type === "draftdata_update" ||
            (message.type === "update" && message.data?.draftdata)
          ) {
            const data =
              message.type === "draftdata_update"
                ? message.data
                : message.data.draftdata;
            if (model.valid(data)) {
              draftVersion++;
              draft = data;
              render();
            } else if (message.type === "draftdata_update") readDraft();
          }
        },
      },
    );
    if (pinned) apply(validTheme(pinned) ? pinned : "classic");
    else {
      apply("classic");
      readTheme();
    }
    readDraft();
    loadHeroes();
    readBranding();
    poll = setInterval(() => {
      readDraft();
      readTheme();
      loadHeroes();
      readBranding();
    }, 5000);
  }
  function fit() {
    el("postdraft-stage").style.transform =
      `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
  }
  root.addEventListener("resize", fit);
  root.addEventListener("pagehide", () => {
    stopped = true;
    draftVersion++;
    themeVersion++;
    brandingVersion++;
    clearInterval(poll);
    stopMatch?.();
    stopMatch = null;
    root.BroadcastThemeClient.cancel();
  });
  root.addEventListener("pageshow", () => {
    if (stopped) start();
  });
  fit();
  start();
})(window);
