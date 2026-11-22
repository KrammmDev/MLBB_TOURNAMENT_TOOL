/* Background switch is OCR-only; no match/OCR or theme-selection writes. */
(() => {
  "use strict";
  const themes = ["classic", "arena", "studio"];
  let stopped = false, pending = false, latest = null;
  function apply() {
    const theme = document.body.dataset.scoreboardTheme;
    if (!themes.includes(theme) || !latest) return;
    document.body.dataset.ocrBackground = latest.backgrounds[theme] === false ? "off" : "on";
  }
  async function read() {
    if (stopped || pending) return;
    pending = true;
    try {
      const response = await fetch("/api/ocr-background", { cache: "no-store" });
      if (!response.ok) return;
      const snapshot = await response.json();
      if (!stopped && snapshot.data?.backgrounds &&
          themes.every(id => typeof snapshot.data.backgrounds[id] === "boolean")) {
        latest = snapshot.data;
        apply();
      }
    } catch {
      /* Preserve last acknowledged setting while disconnected. */
    } finally { pending = false; }
  }
  document.addEventListener("broadcast-theme-ready", apply);
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== parent ||
        event.data?.type !== "ocr-background-saved") return;
    if (themes.includes(event.data.themeId) && typeof event.data.enabled === "boolean") {
      if (latest) latest.backgrounds[event.data.themeId] = event.data.enabled;
      else latest = { backgrounds: Object.fromEntries(themes.map(id => [id,true])) };
      latest.backgrounds[event.data.themeId] = event.data.enabled;
      apply();
    }
  });
  const timer = setInterval(() => { apply(); read(); }, 2000);
  window.addEventListener("pagehide", () => { stopped = true; clearInterval(timer); });
  window.addEventListener("pageshow", () => { stopped = false; read(); });
  read();
})();
