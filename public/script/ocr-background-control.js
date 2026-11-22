/* Control panel for per-theme OCR-only background visibility.
   Changes are saved immediately for live OBS across devices. */
(() => {
  "use strict";
  const controls = document.getElementById("ocr-background-controls");
  const checkbox = document.getElementById("ocr-background-enabled");
  const status = document.getElementById("ocr-background-status");
  const label = document.getElementById("ocr-background-label");
  const output = document.getElementById("preview-output");
  const frame = document.getElementById("theme-preview");
  const presets = ["classic","arena","studio"];
  let selected = null, revision = null, settings = null, busy = false, sequence = 0;
  const isOCR = () => output.value === "scoreboard-ocr";
  function selectedTheme() {
    const card = document.querySelector('.theme-card[aria-pressed="true"]');
    return card && presets.includes(card.dataset.themeId) ? card.dataset.themeId : null;
  }
  function update() {
    controls.hidden = !isOCR();
    if (!isOCR()) return;
    const enabled = selected ? settings?.backgrounds?.[selected] : undefined;
    checkbox.disabled = busy || !selected || typeof enabled !== "boolean";
    checkbox.checked = enabled !== false;
    label.textContent = checkbox.checked ? "ON" : "OFF";
  }
  async function reload() {
    const request = ++sequence;
    try {
      const response = await fetch("/api/ocr-background", {cache:"no-store"});
      if (!response.ok) throw Error("Cannot load OCR background settings");
      const result = await response.json();
      if (request !== sequence) return;
      if (!result.data?.backgrounds ||
          !presets.every(id => typeof result.data.backgrounds[id] === "boolean"))
        throw Error("Invalid OCR background settings");
      settings = result.data;
      revision = result.revision;
      status.textContent = "";
      update();
    } catch(error) {
      if (request !== sequence) return;
      settings = null;
      revision = null;
      status.textContent = error.message + ". Check server and reload settings.";
      update();
    }
  }
  async function save(enabled) {
    if (!isOCR() || busy || !settings || !revision) return;
    const themeId = selected;
    if (!presets.includes(themeId)) return;
    busy = true;
    status.textContent = "Saving " + themeId + " OCR background…";
    update();
    try {
      const response = await fetch("/api/ocr-background", {
        method: "PUT",
        headers: {"Content-Type":"application/json", "If-Match":revision},
        body: JSON.stringify({themeId,enabled}),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.message || "Could not save OCR background");
      settings = result.data;
      revision = result.revision;
      status.textContent = themeId[0].toUpperCase() + themeId.slice(1) +
        " OCR background " + (enabled ? "ON" : "OFF") + " — saved for preview and OBS.";
      frame.contentWindow?.postMessage({
        type:"ocr-background-saved",themeId,enabled,
      }, location.origin);
    } catch(error) {
      status.textContent = error.message + " Reloading settings…";
      await reload();
    } finally {
      busy = false;
      update();
    }
  }
  checkbox.addEventListener("change", () => save(checkbox.checked));
  document.addEventListener("broadcast-preview-selection", event => {
    selected = event.detail.id;
    update();
  });
  output.addEventListener("change", update);
  document.getElementById("reload-settings").addEventListener("click", reload);
  reload();
})();
