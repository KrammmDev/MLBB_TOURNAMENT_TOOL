/* Read-only map result shared by draft and scoreboard; draw controls own the result. */
(function (root) {
  "use strict";
  const maps = {
    HealingTurtle: "HEALING TURTLE",
    GoldenTurret: "GOLDEN TURRET",
    RevealingWisps: "REVEALING WISPS",
    FlyingClouds: "FLYING CLOUDS",
  };
  const hosts = new Set();
  let running = true,
    pending = false,
    version = 0,
    poll,
    reveal,
    controller,
    current = null;
  function paint(data) {
    const key =
      data &&
      ["drawing", "finished"].includes(data.status) &&
      Object.hasOwn(maps, data.result)
        ? data.result
        : null;
    for (const host of hosts) {
      host.hidden = !key;
      host
        .closest(".mainbox")
        ?.setAttribute("data-map-selected", String(Boolean(key)));
      host.querySelector(".mapdraw-name").textContent = key ? maps[key] : "";
      const img = host.querySelector("img");
      const src = key ? "/Assets/map/" + key + ".png" : "";
      if (img.dataset.source !== src) {
        img.dataset.source = src;
        img.hidden = true;
        img.onload = () => {
          if (img.dataset.source === src) img.hidden = false;
        };
        img.onerror = () => {
          img.hidden = true;
        };
        if (src) img.src = src;
        else img.removeAttribute("src");
      }
    }
  }
  function apply(data) {
    if (!running || !data || typeof data.status !== "string") return;
    current = data;
    clearTimeout(reveal);
    const stamp = Number(data.timestamp);
    const wait =
      data.status === "drawing" &&
      Object.hasOwn(maps, data.result) &&
      Number.isFinite(stamp) &&
      stamp > 0
        ? Math.max(0, Math.min(8000, stamp + 8000 - Date.now()))
        : 0;
    if (wait) {
      paint(null);
      reveal = setTimeout(() => {
        if (running && current === data) paint(data);
      }, wait);
    } else paint(data);
  }
  async function read() {
    if (!running || pending) return;
    pending = true;
    const started = version;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch("/api/mapdraw", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        const value = await response.json();
        if (running && started === version) apply(value.drawdata);
      }
    } catch {
    } finally {
      clearTimeout(timeout);
      pending = false;
    }
  }
  root.MapDrawLabel = {
    start(host) {
      if (!host || hosts.has(host)) return;
      host.hidden = true;
      host.classList.add("mapdraw-label");
      host.setAttribute("aria-label", "Selected battlefield");
      const badge = document.createElement("span");
      badge.className = "mapdraw-icon";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "◆";
      const image = document.createElement("img");
      image.alt = "";
      image.hidden = true;
      badge.append(image);
      const name = document.createElement("span");
      name.className = "mapdraw-name";
      host.append(badge, name);
      hosts.add(host);
      if (current) apply(current);
      if (!poll) {
        read();
        poll = setInterval(read, 5000);
      }
    },
    accept(message) {
      if (message.type === "mapdraw_update") {
        version++;
        apply(message.data);
      }
    },
  };
  root.addEventListener("pagehide", () => {
    running = false;
    version++;
    controller?.abort();
    clearInterval(poll);
    clearTimeout(reveal);
    poll = null;
  });
  root.addEventListener("pageshow", () => {
    if (!running && hosts.size) {
      running = true;
      read();
      poll = setInterval(read, 5000);
    }
  });
})(window);
