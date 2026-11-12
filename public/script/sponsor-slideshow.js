/* One display-only sponsor playlist; match/draft state never belongs to this client. */
(function (root) {
  "use strict";
  let host,
    track,
    activeImage,
    animations = [],
    config,
    key,
    currentId = null,
    index = -1,
    rotation,
    polling;
  let running = false,
    requestVersion = 0,
    renderVersion = 0;
  const safe = /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;
  function settle() {
    if (!track) return;
    for (const animation of animations) animation.cancel();
    animations = [];
    track.replaceChildren(...(activeImage ? [activeImage] : []));
  }
  function schedule() {
    clearTimeout(rotation);
    if (running && config?.enabled && config.logos.length > 1)
      rotation = setTimeout(
        () => show(index + 1),
        config.intervalSeconds * 1000,
      );
  }
  function show(next) {
    if (!running || !config?.enabled || !config.logos.length) return;
    index = (next + config.logos.length) % config.logos.length;
    const logo = config.logos[index],
      version = ++renderVersion;
    if (currentId === logo.id && activeImage) return schedule();
    const image = new Image();
    image.alt = "";
    image.onload = () => {
      if (!running || version !== renderVersion) return;
      settle();
      const previous = activeImage;
      currentId = logo.id;
      activeImage = image;
      track.append(image);
      if (
        !previous ||
        root.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        settle();
        schedule();
        return;
      }
      const options = {
        duration: 800,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      };
      animations = [
        previous.animate(
          [{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }],
          options,
        ),
        image.animate(
          [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }],
          options,
        ),
      ];
      Promise.all(animations.map((animation) => animation.finished))
        .then(() => {
          if (!running || version !== renderVersion) return;
          settle();
          schedule();
        })
        .catch(() => {
          /* Superseded by a playlist edit or page lifecycle event. */
        });
    };
    image.onerror = () => {
      if (!running || version !== renderVersion) return;
      // Retain the last loaded logo; retry/advance on the next interval.
      clearTimeout(rotation);
      rotation = setTimeout(
        () => show(index + 1),
        config.intervalSeconds * 1000,
      );
    };
    image.src = "/broadcast-sponsors/" + logo.file;
  }
  function apply(data) {
    if (
      !host ||
      !data ||
      typeof data.enabled !== "boolean" ||
      !Number.isInteger(data.intervalSeconds) ||
      data.intervalSeconds < 2 ||
      data.intervalSeconds > 60 ||
      !Array.isArray(data.logos) ||
      data.logos.some((logo) => !safe.test(logo.file))
    )
      return;
    const nextKey = JSON.stringify(data);
    if (nextKey === key) return;
    key = nextKey;
    config = data;
    clearTimeout(rotation);
    renderVersion++;
    settle();
    if (!data.enabled || !data.logos.length) {
      currentId = null;
      activeImage = null;
      settle();
      return;
    }
    const current = data.logos.findIndex((logo) => logo.id === currentId);
    if (current < 0) {
      currentId = null;
      activeImage = null;
      settle();
    }
    show(current < 0 ? 0 : current);
  }
  async function read() {
    const version = requestVersion;
    try {
      const response = await fetch("/api/broadcast-sponsors", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const snapshot = await response.json();
      if (running && version === requestVersion) apply(snapshot.data);
    } catch {
      /* Keep the current sponsor when the server is temporarily unreachable. */
    }
  }
  function resume() {
    if (running || !host) return;
    running = true;
    key = null;
    read();
    polling = setInterval(read, 5000);
  }
  function pause() {
    running = false;
    requestVersion++;
    renderVersion++;
    clearTimeout(rotation);
    clearInterval(polling);
    settle();
  }
  root.addEventListener("pagehide", pause);
  root.addEventListener("pageshow", resume);
  root.SponsorSlideshow = {
    start(element) {
      if (host) return;
      host = element;
      track = document.createElement("div");
      track.className = "sponsor-pan-track";
      host.replaceChildren(track);
      resume();
    },
    accept(message) {
      if (message.type === "broadcast_sponsors_update") {
        requestVersion++;
        if (running) apply(message.data);
      }
    },
  };
})(window);
