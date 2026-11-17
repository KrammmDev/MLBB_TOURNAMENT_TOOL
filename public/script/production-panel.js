(function () {
  "use strict";
  const overlay = document.body.classList.contains("overlay"),
    form = document.getElementById("settings"),
    status = document.getElementById("status"),
    stage = document.getElementById("panel-stage");
  let snapshot,
    anchor,
    serverTime,
    editRevision,
    busy = false,
    polling = false,
    requestVersion = 0,
    tickerKey = "";
  const fields = [
    "mode",
    "durationSeconds",
    "format",
    "endText",
    "label",
    "ticker",
    "tickerSeconds",
    "showSponsors",
    "showTicker",
    "background",
    "text",
    "accent",
  ];
  function apply(value, fill = false) {
    snapshot = value;
    serverTime = value.serverNow;
    anchor = performance.now();
    if (fill && form) {
      for (const key of fields) {
        const input = form.elements[key];
        if (input.type === "checkbox") input.checked = value.data[key];
        else input.value = value.data[key];
      }
      editRevision = value.revision;
    }
    const d = value.data;
    document.documentElement.style.setProperty("--panel-bg", d.background);
    document.documentElement.style.setProperty("--panel-text", d.text);
    document.documentElement.style.setProperty("--panel-accent", d.accent);
    document.getElementById("timer-label").textContent = d.label;
    if (stage) {
      stage.hidden = false;
      document.getElementById("panel-sponsors").style.display = d.showSponsors
        ? ""
        : "none";
      const ticker = document.getElementById("ticker-window");
      ticker.hidden = !d.showTicker || !d.ticker;
      const key = JSON.stringify([d.ticker, d.tickerSeconds]);
      if (key !== tickerKey) {
        tickerKey = key;
        const text = document.getElementById("ticker-text");
        text.textContent = d.ticker;
        text.getAnimations().forEach((a) => a.cancel());
        text.style.animation = "none";
        void text.offsetWidth;
        text.style.setProperty("--scroll-time", d.tickerSeconds + "s");
        text.style.animation = "";
      }
    }
    render();
  }
  function render() {
    if (!snapshot) return;
    const now = serverTime + performance.now() - anchor;
    document.getElementById("timer-value").textContent = ProductionTimer.text(
      snapshot.data,
      now,
    );
    if (!overlay)
      document.getElementById("timer-value").dataset.running = String(
        snapshot.data.running &&
          !(
            snapshot.data.mode === "countdown" &&
            ProductionTimer.milliseconds(snapshot.data, now) === 0
          ),
      );
  }
  async function read(fill = false) {
    if (polling || busy) return;
    polling = true;
    const version = requestVersion;
    try {
      const response = await fetch("/api/production-panel", {
        cache: "no-store",
      });
      if (!response.ok) throw Error("Panel unavailable");
      const result = await response.json();
      if (version !== requestVersion) return;
      apply(result, fill);
      if (fill && status) status.textContent = "Ready";
    } catch (e) {
      if (status)
        status.textContent =
          "Connection unavailable. Reload settings before making changes.";
    } finally {
      polling = false;
    }
  }
  async function command(body) {
    if (!snapshot || busy) return;
    busy = true;
    requestVersion++;
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      const r = await fetch("/api/production-panel", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match":
            body.action === "settings" ? editRevision : snapshot.revision,
        },
        body: JSON.stringify(body),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.message);
      apply(v);
      editRevision = v.revision;
      status.textContent =
        body.action === "settings"
          ? "Panel saved."
          : "Timer " + body.action + ".";
    } catch (e) {
      status.textContent = e.message;
    } finally {
      busy = false;
      document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }
  if (overlay) {
    const scale = () =>
      (stage.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`);
    scale();
    addEventListener("resize", scale);
    SponsorSlideshow.start(document.getElementById("panel-sponsors"));
  } else {
    document.getElementById("overlay-url").value =
      location.origin + "/production-timer.html";
    document.getElementById("reload").onclick = () => read(true);
    document
      .querySelectorAll("[data-action]")
      .forEach(
        (button) =>
          (button.onclick = () => command({ action: button.dataset.action })),
      );
    form.onsubmit = (e) => {
      e.preventDefault();
      const settings = {};
      for (const key of fields) {
        const input = form.elements[key];
        settings[key] =
          input.type === "checkbox"
            ? input.checked
            : input.type === "number"
              ? Number(input.value)
              : input.value;
      }
      command({ action: "settings", settings });
    };
  }
  read(true);
  const poll = setInterval(() => read(), 1000),
    tick = setInterval(render, 100);
  addEventListener("pagehide", () => {
    clearInterval(poll);
    clearInterval(tick);
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });
})();
