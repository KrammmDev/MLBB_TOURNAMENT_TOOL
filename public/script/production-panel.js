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
    "headline",
    "ticker",
    "tickerSeconds",
    "showSponsors",
    "showTicker",
    "background",
    "text",
    "accent",
    "lowerBackground",
    "headlineColor",
    "tickerBackground",
    "tickerColor",
    "sponsorBackground",
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
    for (const [key, token] of Object.entries({
      lowerBackground: "--lower-bg",
      headlineColor: "--headline-color",
      tickerBackground: "--ticker-bg",
      tickerColor: "--ticker-color",
      sponsorBackground: "--sponsor-bg",
    }))
      document.documentElement.style.setProperty(token, d[key]);
    for (const button of document.querySelectorAll("[data-panel-target]")) {
      const visible = d[button.dataset.panelTarget];
      button.textContent =
        (visible ? "Hide " : "Show ") +
        (button.dataset.panelTarget === "showCurrentMatch"
          ? "Current Match"
          : "Lower Third");
      button.setAttribute("aria-pressed", String(visible));
    }
    document.getElementById("timer-label").textContent = d.label;
    if (stage) {
      const firstFrame = stage.hidden;
      if (firstFrame) stage.classList.add("no-panel-motion");
      stage.hidden = false;
      for (const [selector, visible] of [
        [".match-card", d.showCurrentMatch],
        [".broadcast-panel", d.showLowerThird],
      ]) {
        const node = document.querySelector(selector);
        node.classList.toggle("panel-off", !visible);
        node.setAttribute("aria-hidden", String(!visible));
      }
      if (firstFrame)
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            stage.classList.remove("no-panel-motion"),
          ),
        );

      document.getElementById("panel-headline").textContent = d.headline || "";
      document
        .querySelector(".broadcast-panel")
        .classList.toggle("without-sponsors", !d.showSponsors);
      document.getElementById("panel-sponsors").style.display = d.showSponsors
        ? ""
        : "none";
      const ticker = document.getElementById("ticker-window");
      ticker.hidden = !d.showTicker || !d.ticker;
      const key = JSON.stringify([d.ticker, d.tickerSeconds, d.showTicker]);
      if (key !== tickerKey) {
        tickerKey = key;
        const text = document.getElementById("ticker-text");
        text.replaceChildren();
        if (d.ticker && d.showTicker) {
          const group = document.createElement("span");
          group.className = "ticker-group";
          text.append(group);
          const unit = document.createElement("span");
          unit.className = "ticker-unit";
          unit.textContent = d.ticker;
          group.append(unit);
          // Fill at least one viewport, then duplicate exactly one full group.
          const width = ticker.clientWidth || 1800;
          let repeats = 1;
          while (group.offsetWidth < width && repeats++ < 100) {
            const copy = unit.cloneNode(true);
            copy.setAttribute("aria-hidden", "true");
            group.append(copy);
          }
          const duplicate = group.cloneNode(true);
          duplicate.setAttribute("aria-hidden", "true");
          text.append(duplicate);
        }
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
          : body.action === "visibility"
            ? "Overlay visibility updated."
            : body.action === "add-time"
              ? "Added " + body.seconds / 60 + " min."
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
    MatchDataClient.subscribe(
      ({ data }) => {
        for (const side of ["blue", "red"]) {
          const team = data.teamdata?.[side + "team"] || {};
          document.getElementById("panel-" + side + "-name").textContent =
            String(team.teamname || team.name || "");
          const score = Number.parseInt(team.score, 10);
          document.getElementById("panel-" + side + "-score").textContent =
            Number.isFinite(score) ? String(score) : "0";
          const image = document.getElementById("panel-" + side + "-logo");
          const source = RosterModel.safeImage(team.logo);
          image.hidden = !source;
          if (source && image.getAttribute("data-source") !== source) {
            image.dataset.source = source;
            image.onerror = () => {
              image.hidden = true;
            };
            image.src = source;
          }
        }
        document.getElementById("panel-match-meta").textContent = [
          data.matchInfo?.match || data.matchInfo?.stage,
          "BO" + String(data.matchFormat || 3).replace(/^bo/i, ""),
          data.matchInfo?.game,
        ]
          .filter(Boolean)
          .join(" · ");
      },
      () => {},
      { onMessage: (message) => SponsorSlideshow.accept(message) },
    );
  } else {
    document.getElementById("overlay-url").value =
      location.origin + "/production-timer.html";
    document.getElementById("reload").onclick = () => read(true);
    document.querySelectorAll("[data-panel-target]").forEach(
      (button) =>
        (button.onclick = () =>
          snapshot &&
          command({
            action: "visibility",
            target: button.dataset.panelTarget,
            visible: !snapshot.data[button.dataset.panelTarget],
          })),
    );
    document
      .querySelectorAll("[data-action]")
      .forEach(
        (button) =>
          (button.onclick = () => command({ action: button.dataset.action })),
      );
    document.querySelectorAll("[data-add-seconds]").forEach((button) => {
      button.onclick = () =>
        command({
          action: "add-time",
          seconds: Number(button.dataset.addSeconds),
        });
    });
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
