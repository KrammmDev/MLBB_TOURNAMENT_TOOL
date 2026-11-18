/* Read-only winner cue, using the same match feed as the Control Panel. */
(function (root) {
  "use strict";
  const stage = document.getElementById("winnerStage"),
    wrapper = document.getElementById("winnerWrapper"),
    name = document.getElementById("winnerName"),
    logo = document.getElementById("winnerLogoImg"),
    watermark = document.getElementById("winnerWatermark");
  let cue = "",
    logoSource = "",
    reveal = null,
    stopped = false;
  function fitName() {
    let size = 72;
    name.style.fontSize = size + "px";
    while (
      size > 28 &&
      (name.scrollWidth > name.clientWidth ||
        name.scrollHeight > name.clientHeight)
    ) {
      size -= 2;
      name.style.fontSize = size + "px";
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
      watermark.hidden = true;
      logo.removeAttribute("src");
      watermark.removeAttribute("src");
      wrapper.classList.add("without-logo");
      return;
    }
    if (source === logoSource) return;
    logoSource = source;
    logo.hidden = true;
    watermark.hidden = true;
    wrapper.classList.remove("without-logo");
    logo.onload = () => {
      if (source !== logoSource) return;
      logo.hidden = false;
      watermark.hidden = false;
      wrapper.classList.remove("without-logo");
      fitName();
    };
    logo.onerror = () => {
      if (source !== logoSource) return;
      logo.hidden = true;
      watermark.hidden = true;
      wrapper.classList.add("without-logo");
      fitName();
    };
    watermark.onerror = () => {
      watermark.hidden = true;
    };
    logo.src = source;
    watermark.src = source;
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
    const game = data.game_number || 1,
      newCue = side + ":" + game;
    wrapper.dataset.side = side;
    name.textContent = String(
      team.teamname || team.name || side.toUpperCase() + " SIDE",
    );
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
  const unsubscribe = root.MatchDataClient.subscribe(apply);
  addEventListener("resize", fit);
  document.fonts.ready.then(() => {
    if (!stopped) fitName();
  });
  addEventListener("pagehide", () => {
    stopped = true;
    unsubscribe();
    if (reveal) reveal.cancel();
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
})(window);
