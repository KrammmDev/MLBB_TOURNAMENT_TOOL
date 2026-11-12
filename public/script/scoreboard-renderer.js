/* Read-only scoreboard: the current match remains its only competition authority. */
(function (root) {
  "use strict";
  const pinned = new URLSearchParams(location.search).get("theme"),
    valid = (id) => root.RosterThemes.themes.some((theme) => theme.id === id),
    el = (id) => document.getElementById(id);
  let stopped = false,
    stopMatch,
    poll,
    themeVersion = 0,
    reading = false;
  function fit() {
    el("scoreboard-stage").style.transform =
      `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
  }
  const count = (value, max) =>
    Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));
  function render(data) {
    const wins = { 1: 1, 3: 2, 5: 3, 7: 4 }[data.matchFormat] || 2;
    for (const [side, team] of [
      ["blue", data.teamdata?.blueteam],
      ["red", data.teamdata?.redteam],
    ]) {
      const value = team || {};
      el("sb-name-" + side).textContent = String(value.teamname || "");
      const img = el("sb-logo-" + side),
        src = root.RosterModel.safeImage(value.logo);
      if (img.dataset.source !== src) {
        img.dataset.source = src;
        img.style.visibility = src ? "visible" : "hidden";
        img.onerror = () => {
          img.style.visibility = "hidden";
        };
        if (src) img.src = src;
        else img.removeAttribute("src");
      }
      const dots = el("sb-wins-" + side),
        score = count(value.score, wins);
      while (dots.children.length > wins) dots.lastChild.remove();
      while (dots.children.length < wins) {
        const dot = document.createElement("span");
        dot.className = "sb-win";
        dots.append(dot);
      }
      [...dots.children].forEach((dot, i) =>
        dot.classList.toggle("active", i < score),
      );
      dots.setAttribute("aria-label", `${score} series wins`);
      const turtles = el("sb-turtles-" + side),
        total = count(value.turtles ?? value.turtle, 3);
      while (turtles.children.length > total) turtles.lastChild.remove();
      while (turtles.children.length < total) {
        const icon = document.createElement("img");
        icon.src = "/Assets/Other/turtle-icon.png";
        icon.alt = "Turtle";
        icon.onerror = () => {
          icon.style.visibility = "hidden";
        };
        turtles.append(icon);
      }
      turtles.setAttribute("aria-label", `${total} turtles`);
    }
    el("sb-match").textContent = String(data.matchInfo?.match || "");
    el("sb-game").textContent = String(
      data.matchInfo?.game ||
        (data.game_number ? `GAME ${data.game_number}` : ""),
    );
  }
  async function apply(id) {
    if (!valid(id) || stopped) return;
    try {
      await root.BroadcastThemeClient.apply(id, "scoreboard");
    } catch {
      /* Keep the previously loaded style set and retry on recovery. */
    }
  }
  async function readTheme() {
    if (pinned || stopped || reading) return;
    reading = true;
    const version = themeVersion;
    try {
      const response = await fetch("/api/broadcast-theme", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const snapshot = await response.json();
      if (!stopped && version === themeVersion)
        await apply(snapshot.data?.themeId);
    } catch {
      /* Retain current graphics during an outage. */
    } finally {
      reading = false;
    }
  }
  function start() {
    if (stopMatch) return;
    stopped = false;
    stopMatch = root.MatchDataClient.subscribe(
      ({ data }) => render(data),
      (status) => {
        if (status === "connected") readTheme();
      },
      {
        onMessage(message) {
          root.BroadcastColorClient.accept(message);
          if (message.type === "roster_theme_update" && !pinned) {
            themeVersion++;
            apply(message.data?.themeId);
          }
        },
      },
    );
    if (pinned) apply(valid(pinned) ? pinned : "classic");
    else {
      apply("classic");
      readTheme();
    }
    poll = setInterval(readTheme, 5000);
  }
  root.addEventListener("resize", fit);
  root.addEventListener("pagehide", () => {
    stopped = true;
    themeVersion++;
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
