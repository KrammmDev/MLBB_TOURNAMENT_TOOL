/* Production labels are independent of match state and the sponsor playlist. */
(function (root) {
  "use strict";
  let version = 0,
    running = true,
    poll,
    pending = false;
  const el = (id) => document.getElementById(id),
    safe = /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;
  function apply(data) {
    if (
      !running ||
      !data ||
      data.schemaVersion !== 1 ||
      typeof data.patchLabel !== "string" ||
      typeof data.casterNames !== "string" ||
      (data.logoFile !== null && !safe.test(data.logoFile))
    )
      return;
    el("sb-patch-label").textContent = data.patchLabel;
    el("sb-caster-names").textContent = data.casterNames;
    el("sb-production-strip").hidden = !data.patchLabel && !data.casterNames;
    el("sb-caster-cell").hidden = !data.casterNames;
    const image = el("sb-tournament-logo"),
      src = data.logoFile ? "/scoreboard-branding/" + data.logoFile : "";
    if (
      image.dataset.source !== src ||
      (src && image.complete && !image.naturalWidth)
    ) {
      image.dataset.source = src;
      image.hidden = true;
      image.onload = () => {
        if (image.dataset.source === src) image.hidden = false;
      };
      image.onerror = () => {
        image.hidden = true;
      };
      if (src) image.src = src;
      else image.removeAttribute("src");
    }
  }
  async function read() {
    if (!running || pending) return;
    pending = true;
    const started = version,
      controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch("/api/scoreboard-branding", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        const value = await response.json();
        if (started === version) apply(value.data);
      }
    } catch {
    } finally {
      clearTimeout(timeout);
      pending = false;
    }
  }
  function start() {
    read();
    clearInterval(poll);
    poll = setInterval(read, 5000);
  }
  root.ScoreboardBrandingClient = {
    accept(message) {
      if (message.type === "scoreboard_branding_update") {
        version++;
        apply(message.data);
      }
    },
  };
  root.addEventListener("pagehide", () => {
    running = false;
    version++;
    clearInterval(poll);
  });
  root.addEventListener("pageshow", () => {
    if (!running) {
      running = true;
      start();
    }
  });
  start();
})(window);
