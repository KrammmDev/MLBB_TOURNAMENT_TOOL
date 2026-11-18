(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id),
    stage = $("postgameStage");
  let stopped = false;
  function fitText(node, max, min) {
    let size = max;
    node.style.fontSize = size + "px";
    while (
      size > min &&
      (node.scrollWidth > node.clientWidth ||
        node.scrollHeight > node.clientHeight)
    ) {
      size -= 2;
      node.style.fontSize = size + "px";
    }
  }
  function fit() {
    stage.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
    fitText($("pgTournament"), 54, 22);
    for (const id of ["pgBlueName", "pgRedName"]) fitText($(id), 30, 18);
  }
  function picture(node, value) {
    const src = root.RosterModel.safeImage(value);
    if (src === node.dataset.source) return;
    node.dataset.source = src;
    node.hidden = true;
    if (!src) {
      node.removeAttribute("src");
      return;
    }
    node.onload = () => {
      if (node.dataset.source === src) node.hidden = false;
    };
    node.onerror = () => {
      if (node.dataset.source === src) node.hidden = true;
    };
    node.src = src;
  }
  function apply({ data }) {
    if (stopped) return;
    const side = data?.winmatches;
    for (const [key, prefix] of [
      ["blueteam", "pgBlue"],
      ["redteam", "pgRed"],
    ]) {
      const team = data?.teamdata?.[key] || {},
        own = key === "blueteam" ? "blue" : "red",
        selected = side === "blue" || side === "red";
      $(prefix + "Name").textContent = String(
        team.teamname || team.name || own.toUpperCase() + " TEAM",
      );
      picture($(prefix + "Logo"), team.logo);
      const score = Number.parseInt(team.score, 10);
      $(prefix + "Score").textContent =
        Number.isFinite(score) && score >= 0 ? String(score) : "0";
      $(prefix).classList.toggle("is-defeated", selected && side !== own);
      $(prefix + "Result").textContent = selected
        ? side === own
          ? "VICTORY"
          : "DEFEAT"
        : "";
    }
    $("pgGame").textContent = "GAME " + (data?.game_number || 1);
    $("pgWinner").textContent =
      side === "blue" || side === "red"
        ? "WINNER · " +
          $(side === "blue" ? "pgBlueName" : "pgRedName").textContent
        : "POST GAME RESULTS";
    stage.dataset.ready = "true";
    fit();
  }
  root.BroadcastColorClient.activate("arena", "postgame");
  const unsubscribe = root.MatchDataClient.subscribe(apply, () => {}, {
    onMessage(message) {
      root.BroadcastColorClient.accept(message);
      if (
        message.type === "clear" ||
        message.type === "init" ||
        message.type === "update"
      ) {
        const title = message.data?.["tournament-title"];
        if (message.type !== "update" || title !== undefined) {
          $("pgTournament").textContent =
            typeof title === "string" && title.trim()
              ? title
              : "15TH LCUAA ESPORTS MLBB";
          fit();
        }
      }
    },
  });
  fit();
  addEventListener("resize", fit);
  document.fonts.ready.then(() => {
    if (!stopped) fit();
  });
  addEventListener("pagehide", () => {
    stopped = true;
    unsubscribe();
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });
})(window);
