/* One cue channel, two exclusive presentations: general WebM or player lower-third. */
(function (root) {
  "use strict";
  const model = root.NotificationModel;
  const safeImage = root.RosterModel.safeImage;
  const stage = document.getElementById("notification-stage");
  const video = document.getElementById("videoPlayer");
  const source = document.getElementById("videoSource");
  const banner = document.getElementById("player-notification");
  const artwork = document.getElementById("notification-art");
  let generation = 0,
    timeout,
    stop;
  const reduced = () =>
    root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function reset() {
    generation++;
    clearTimeout(timeout);
    banner
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.cancel());
    video.onended = video.onerror = source.onerror = null;
    video.pause();
    video.style.display = "none";
    source.removeAttribute("src");
    banner.hidden = true;
    artwork.replaceChildren();
    banner.dataset.artwork = "none";
  }
  function finish(version) {
    if (version !== generation) return;
    if (banner.hidden || reduced()) return reset();
    const animation = banner.animate(
      [
        { clipPath: "inset(-112px -6px -8px -6px)" },
        { clipPath: "inset(-112px 50% -8px 50%)" },
      ],
      { duration: 420, easing: "cubic-bezier(.65,0,.35,1)", fill: "both" },
    );
    animation.finished
      .then(() => {
        if (version === generation) reset();
      })
      .catch(() => {});
  }
  function loadArtwork(cue, version) {
    function display(image, kind) {
      if (
        version !== generation ||
        (kind === "team" && banner.dataset.artwork === "player")
      )
        return;
      artwork.replaceChildren(image);
      banner.dataset.artwork = kind;
      if (!reduced())
        image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
    }
    const logo = safeImage(cue.teamLogo);
    if (logo) {
      const image = new Image();
      image.alt = "";
      image.onload = () => display(image, "team");
      image.src = logo;
    }
    const candidates = [
      ...new Set(
        (Array.isArray(cue.playerImages) ? cue.playerImages : [])
          .map(safeImage)
          .filter(Boolean),
      ),
    ];
    function next(index) {
      if (version !== generation || index >= candidates.length) return;
      const image = new Image();
      image.alt = "";
      image.onload = () => display(image, "player");
      image.onerror = () => next(index + 1);
      image.src = candidates[index];
    }
    next(0);
  }
  function show(cue) {
    if (cue.type !== "notification_trigger") return;
    if (cue.scope === "player") {
      const event = model.event(cue.eventId);
      if (
        !event ||
        !["blue", "red"].includes(cue.teamSide) ||
        typeof cue.playerName !== "string" ||
        typeof cue.teamName !== "string"
      )
        return;
      reset();
      const version = generation;
      document.getElementById("notification-event").textContent = event.label;
      document.getElementById("notification-player").textContent =
        cue.playerName;
      document.getElementById("notification-team").textContent = cue.teamName;
      banner.dataset.side = cue.teamSide;
      banner.hidden = false;
      loadArtwork(cue, version);
      if (!reduced()) {
        // Negative top inset preserves the portrait above the card while both doors open.
        banner.animate(
          [
            { clipPath: "inset(-112px 50% -8px 50%)" },
            { clipPath: "inset(-112px -6px -8px -6px)" },
          ],
          { duration: 560, easing: "cubic-bezier(.65,0,.35,1)", fill: "both" },
        );
      }
      timeout = setTimeout(() => finish(version), 4000);
      return; // Individual cues never load, play or depend on a WebM clip.
    }
    const path = Object.hasOwn(model.videos, cue.videoId)
      ? model.videos[cue.videoId]
      : null;
    if (!path) return;
    reset();
    const version = generation;
    const clear = () => {
      if (version === generation) reset();
    };
    source.src = path;
    video.onended = video.onerror = source.onerror = clear;
    video.load();
    video.style.display = "block";
    video.play()?.catch(clear);
    timeout = setTimeout(clear, 15000);
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
