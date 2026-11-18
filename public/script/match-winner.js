/* Read-only winner cue, using the same match feed as the Control Panel. */
(function (root) {
  "use strict";
  const stage = document.getElementById("winnerStage"),
    wrapper = document.getElementById("winnerWrapper"),
    name = document.getElementById("winnerName"),
    logo = document.getElementById("winnerLogoImg"),
    loserLogo = document.getElementById("loserLogoImg");
  let loserSource = "";
  let cue = "",
    logoSource = "",
    reveal = null,
    stopped = false;
  function fitName() {
    for (const node of [
      name,
      document.getElementById("loserName"),
      document.getElementById("tournamentName"),
    ]) {
      let size = 58;
      node.style.fontSize = size + "px";
      while (
        size > 24 &&
        (node.scrollWidth > node.clientWidth ||
          node.scrollHeight > node.clientHeight)
      ) {
        size -= 2;
        node.style.fontSize = size + "px";
      }
    }
  }
  function fit() {
    stage.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
    fitName();
  }
  function image(source) {
    if (!source) {
      logoSource = "";
      logo.hidden = true;
      logo.removeAttribute("src");
      wrapper.classList.add("without-logo");
      return;
    }
    if (source === logoSource) return;
    logoSource = source;
    logo.hidden = true;
    wrapper.classList.remove("without-logo");
    logo.onload = () => {
      if (source !== logoSource) return;
      logo.hidden = false;
      wrapper.classList.remove("without-logo");
      fitName();
    };
    logo.onerror = () => {
      if (source !== logoSource) return;
      logo.hidden = true;
      wrapper.classList.add("without-logo");
      fitName();
    };
    logo.src = source;
  }
  function apply({ data }) {
    if (stopped) return;
    stage.dataset.ready = "true";
    const side = data?.winmatches;
    const team =
      side === "blue"
        ? data.teamdata?.blueteam
        : side === "red"
          ? data.teamdata?.redteam
          : null;
    if (!team) {
      cue = "";
      if (reveal) {
        reveal.cancel();
        reveal = null;
      }
      wrapper.classList.remove("is-visible");
      wrapper.setAttribute("aria-hidden", "true");
      return;
    }
    const opponent =
      data.teamdata?.[side === "blue" ? "redteam" : "blueteam"] || {};
    document.getElementById("loserName").textContent = String(
      opponent.teamname || opponent.name || "OPPONENT",
    );
    const losingSource = root.RosterModel.safeImage(opponent.logo);
    if (losingSource !== loserSource) {
      loserSource = losingSource;
      loserLogo.hidden = true;
      if (losingSource) {
        loserLogo.onload = () => {
          if (loserSource === losingSource) loserLogo.hidden = false;
        };
        loserLogo.onerror = () => {
          loserLogo.hidden = true;
        };
        loserLogo.src = losingSource;
      } else loserLogo.removeAttribute("src");
    }
    const game = data.game_number || 1,
      newCue = side + ":" + game;
    wrapper.dataset.side = side;
    name.textContent = String(
      team.teamname || team.name || side.toUpperCase() + " SIDE",
    );
    const info = data.matchInfo || {},
      clean = (value) => (typeof value === "string" ? value.trim() : "");
    const match = document.getElementById("resultMatch"),
      stageDay = document.getElementById("resultStageDay");
    match.textContent = clean(info.match);
    match.hidden = !match.textContent;
    stageDay.textContent = [clean(info.stage), clean(info.group)]
      .filter(Boolean)
      .join(" ");
    stageDay.hidden = !stageDay.textContent;
    document.getElementById("gameNumber").textContent = "GAME " + game;
    image(root.RosterModel.safeImage(team.logo));
    wrapper.classList.add("is-visible");
    wrapper.setAttribute("aria-hidden", "false");
    fitName();
    if (newCue !== cue) {
      if (reveal) reveal.cancel();
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        reveal = wrapper.animate(
          [
            { opacity: 0, transform: "translateY(35px) scale(.98)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" },
        );
      }
      cue = newCue;
    }
  }
  fit();
  let brandingVersion = 0,
    brandingPending = false;
  function branding(data) {
    if (stopped || typeof data?.patchLabel !== "string") return;
    document.getElementById("resultPatch").textContent = data.patchLabel.trim();
    document.getElementById("resultPatch").hidden =
      !document.getElementById("resultPatch").textContent;
  }
  async function readBranding() {
    if (stopped || brandingPending) return;
    brandingPending = true;
    const version = brandingVersion,
      controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch("/api/scoreboard-branding", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        const value = await response.json();
        if (version === brandingVersion) branding(value.data);
      }
    } catch {
    } finally {
      clearTimeout(timeout);
      brandingPending = false;
    }
  }
  readBranding();
  const brandingPoll = setInterval(readBranding, 5000);
  root.BroadcastColorClient.activate("arena", "matchwinner");
  const unsubscribe = root.MatchDataClient.subscribe(apply, () => {}, {
    onMessage(message) {
      root.BroadcastColorClient.accept(message);
      if (message.type === "scoreboard_branding_update") {
        brandingVersion++;
        branding(message.data);
      }
      if (message.type === "clear")
        document.getElementById("tournamentName").textContent =
          "15TH LCUAA ESPORTS MLBB";
      if (message.type === "init" || message.type === "update") {
        const title = message.data?.["tournament-title"];
        if (message.type === "init" || title !== undefined)
          document.getElementById("tournamentName").textContent =
            typeof title === "string" && title.trim()
              ? title
              : "15TH LCUAA ESPORTS MLBB";
        fitName();
      }
    },
  });
  addEventListener("resize", fit);
  document.fonts.ready.then(() => {
    if (!stopped) fitName();
  });
  addEventListener("pagehide", () => {
    stopped = true;
    brandingVersion++;
    clearInterval(brandingPoll);
    unsubscribe();
    if (reveal) reveal.cancel();
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
})(window);
