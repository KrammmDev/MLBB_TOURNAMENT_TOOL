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
  const role = document.getElementById("notification-role");
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
    banner.dataset.phase = "idle";
    artwork.replaceChildren();
    role.hidden = true;
    role.replaceChildren();
    banner.dataset.artwork = "none";
  }
  function setTitle(text) {
    const title = document.getElementById("notification-event");
    const label = document.createElement("span");
    label.className = "notification-event-label";
    label.textContent = text;
    const slices = ["top", "bottom"].map((part) => {
      const slice = document.createElement("span");
      slice.className = `notification-title-slice notification-title-${part}`;
      slice.dataset.label = text;
      slice.setAttribute("aria-hidden", "true");
      return slice;
    });
    title.replaceChildren(label, ...slices);
  }
  function splitTitle(opening) {
    for (const [index, slice] of [
      ...banner.querySelectorAll(".notification-title-slice"),
    ].entries()) {
      slice.getAnimations().forEach((animation) => animation.cancel());
      const direction = index === 0 ? -1 : 1;
      const joined = { opacity: 1, translate: "0 0" };
      const separated = {
        opacity: 0,
        translate: `${direction * 56}px ${direction * 5}px`,
      };
      slice.animate(opening ? [separated, joined] : [joined, separated], {
        duration: opening ? 360 : 420,
        delay: opening ? 90 : 0,
        easing: opening
          ? "cubic-bezier(.16,1,.3,1)"
          : "cubic-bezier(.4,0,.6,1)",
        fill: "both",
      });
    }
  }
  function finish(version) {
    if (version !== generation) return;
    if (banner.hidden || reduced()) return reset();
    // Release the completed entrance's fill before applying the reverse wipe.
    banner.getAnimations().forEach((animation) => animation.cancel());
    banner.dataset.phase = "closing";
    splitTitle(false);
    const animation = banner.animate(
      [
        { clipPath: "inset(-112px -6px -8px -6px)" },
        { clipPath: "inset(-112px 50% -8px 50%)" },
      ],
      { duration: 800, easing: "cubic-bezier(.45,0,.55,1)", fill: "both" },
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
  function loadRole(playerRole, version) {
    const lanes = {
      gold: "gold",
      jungle: "junggle",
      mid: "mid",
      exp: "exp",
      roam: "roam",
    };
    if (!Object.hasOwn(lanes, playerRole)) return;
    const image = new Image();
    image.alt = `${playerRole} role`;
    image.onload = () => {
      if (version !== generation) return;
      role.replaceChildren(image);
      role.hidden = false;
    };
    image.src = "/Assets/lane/" + lanes[playerRole] + ".png";
  }
  function enter() {
    banner.animate(
      [
        { clipPath: "inset(-112px 50% -8px 50%)" },
        { clipPath: "inset(-112px -6px -8px -6px)" },
      ],
      { duration: 360, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" },
    );
    splitTitle(true);
    banner.querySelector(".notification-identity").animate(
      [
        { opacity: 0, translate: "14px 0" },
        { opacity: 1, translate: "0 0" },
      ],
      { duration: 180, delay: 300, fill: "backwards", easing: "ease-out" },
    );
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
      setTitle(event.label);
      document.getElementById("notification-player").textContent =
        cue.playerName;
      loadRole(cue.playerRole, version);
      banner.dataset.side = cue.teamSide;
      banner.hidden = false;
      banner.dataset.phase = "holding";
      loadArtwork(cue, version);
      if (!reduced()) enter();
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
