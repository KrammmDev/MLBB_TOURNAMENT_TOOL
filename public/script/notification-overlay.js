/* Extend the existing overlay: same video clips, same live notification_trigger channel. */
(function (root) {
  "use strict";
  const model = root.NotificationModel;
  const stage = document.getElementById("notification-stage");
  const video = document.getElementById("videoPlayer");
  const source = document.getElementById("videoSource");
  const banner = document.getElementById("player-notification");
  let generation = 0,
    timeout,
    stop,
    active,
    exitAnimation;
  function reset() {
    generation++;
    clearTimeout(timeout);
    exitAnimation?.cancel();
    banner.getAnimations().forEach((animation) => animation.cancel());
    video.onended = video.onerror = source.onerror = null;
    video.pause();
    video.style.display = "none";
    source.removeAttribute("src");
    banner.hidden = true;
    active = null;
  }
  function finish(version) {
    if (version !== generation) return;
    if (
      banner.hidden ||
      root.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return reset();
    exitAnimation = banner.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 120,
      fill: "both",
    });
    exitAnimation.finished
      .then(() => {
        if (version === generation) reset();
      })
      .catch(() => {});
  }
  function textFallback(version) {
    if (version !== generation) return;
    video.pause();
    video.style.display = "none";
    if (!active || active.scope !== "player") return reset();
    banner.dataset.textOnly = "true";
    clearTimeout(timeout);
    timeout = setTimeout(() => finish(version), 4000);
  }
  function show(cue) {
    if (cue.type !== "notification_trigger") return;
    const event = model.event(cue.eventId);
    const individual =
      cue.scope === "player" &&
      event &&
      ["blue", "red"].includes(cue.teamSide) &&
      typeof cue.playerName === "string" &&
      typeof cue.teamName === "string";
    const path = Object.hasOwn(model.videos, cue.videoId)
      ? model.videos[cue.videoId]
      : null;
    if (!individual && !path) return;
    reset();
    active = individual ? cue : { scope: "general" };
    const version = generation;
    if (individual) {
      document.getElementById("notification-event").textContent = event.label;
      document.getElementById("notification-player").textContent =
        cue.playerName;
      document.getElementById("notification-team").textContent = cue.teamName;
      banner.dataset.side = cue.teamSide;
      banner.dataset.textOnly = String(!path);
      banner.hidden = false;
      if (!root.matchMedia("(prefers-reduced-motion: reduce)").matches)
        banner.animate(
          [
            { opacity: 0, translate: "0 -12px" },
            { opacity: 1, translate: "0 0" },
          ],
          { duration: 180, easing: "ease-out" },
        );
    }
    if (!path) return textFallback(version);
    source.src = path;
    video.onended = () => finish(version);
    video.onerror = () => textFallback(version);
    source.onerror = () => textFallback(version);
    video.load();
    video.style.display = "block";
    const promise = video.play();
    promise?.catch(() => textFallback(version));
    // A stalled/invalid asset must never leave a permanent on-air banner.
    timeout = setTimeout(() => textFallback(version), 15000);
  }
  function scale() {
    stage.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
  }
  function start() {
    if (stop) return;
    stop = root.MatchDataClient.subscribe(
      () => {},
      () => {},
      { onMessage: show },
    );
  }
  root.addEventListener("resize", scale);
  root.addEventListener("pagehide", () => {
    stop?.();
    stop = null;
    reset();
  });
  root.addEventListener("pageshow", start);
  scale();
  start();
})(window);
