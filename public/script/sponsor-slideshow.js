/* One display-only sponsor playlist; match/draft state never belongs to this client. */
(function (root) {
  "use strict";
  let host,
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
    if (currentId === logo.id && host.firstChild) return schedule();
    const image = new Image();
    image.alt = "";
    image.onload = () => {
      if (!running || version !== renderVersion) return;
      currentId = logo.id;
      image.className = "sponsor-reveal";
      host.replaceChildren(image);
      schedule();
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
    if (!data.enabled || !data.logos.length) {
      currentId = null;
      host.replaceChildren();
      return;
    }
    const current = data.logos.findIndex((logo) => logo.id === currentId);
    if (current < 0) {
      currentId = null;
      host.replaceChildren();
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
  }
  root.addEventListener("pagehide", pause);
  root.addEventListener("pageshow", resume);
  root.SponsorSlideshow = {
    start(element) {
      if (host) return;
      host = element;
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
