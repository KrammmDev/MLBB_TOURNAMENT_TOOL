/* Independent equipment palette editor on Broadcast Themes.
   Uses the existing versioned Broadcast Colors API and a preview-only iframe. */
(() => {
  "use strict";
  const defaults = { left: "#258be0", right: "#e34e62", background: "#0b1220", text: "#f3f6fa" };
  const node = id => document.getElementById(id);
  const preview = node("equipment-color-preview");
  const controls = {
    left: [node("equipment-blue-color"), node("equipment-blue-hex")],
    right: [node("equipment-red-color"), node("equipment-red-hex")],
    background: [node("equipment-background-color"), node("equipment-background-hex")],
    text: [node("equipment-text-color"), node("equipment-text-hex")]
  };
  let colors = { ...defaults }, saved = { ...defaults };
  let revision = null, busy = false;
  const valid = c => /^#[0-9a-f]{6}$/i.test(c);
  const status = (text, error = false) => {
    node("equipment-color-status").textContent = text;
    node("equipment-color-status").dataset.error = String(error);
  };
  const isDirty = () => Object.keys(defaults).some(field => colors[field] !== saved[field]);
  function buttons() {
    const invalid = Object.values(controls).some(pair => !valid(pair[1].value));
    for (const pair of Object.values(controls))
      pair.forEach(control => control.disabled = busy || !revision);
    node("equipment-save").disabled = busy || !revision || invalid || !isDirty();
    node("equipment-reset").disabled = busy || !revision;
    node("equipment-reload").disabled = busy;
  }
  function show() {
    for (const side of Object.keys(defaults)) {
      controls[side][0].value = colors[side];
      controls[side][1].value = colors[side];
    }
    buttons();
  }
  function sendPreview() {
    preview.contentWindow?.postMessage({
      type: "equipment-colors-preview",
      colors
    }, location.origin);
  }
  function change(side, value) {
    if (busy || !valid(value)) return;
    colors[side] = value.toLowerCase();
    show();
    sendPreview();
    status(isDirty() ? "Preview only. Save to update the equipment overlay." : "Preview matches saved colors.");
  }
  for (const [side, pair] of Object.entries(controls)) {
    pair[0].addEventListener("input", () => change(side, pair[0].value));
    pair[1].addEventListener("input", () => {
      if (valid(pair[1].value)) change(side, pair[1].value);
      else {
        status("Enter a six-digit hex color such as #258be0.", true);
        buttons();
      }
    });
  }
  preview.addEventListener("load", sendPreview);
  async function reload() {
    if (busy) return;
    busy = true;
    buttons();
    try {
      const response = await fetch("/api/broadcast-colors", { cache: "no-store" });
      if (!response.ok) throw Error("Could not load equipment colors.");
      const data = await response.json();
      if (data.data?.schemaVersion !== 2 || !data.revision) throw Error("Invalid color settings.");
      const palette = data.data.palettes?.classic?.equipment || {};
      saved = {
        left: valid(palette.left) ? palette.left.toLowerCase() : defaults.left,
        right: valid(palette.right) ? palette.right.toLowerCase() : defaults.right,
        background: valid(palette.background) ? palette.background.toLowerCase() : defaults.background,
        text: valid(palette.text) ? palette.text.toLowerCase() : defaults.text
      };
      revision = data.revision;
      colors = { ...saved };
      show();
      sendPreview();
      status("Saved equipment colors loaded.");
    } catch (error) {
      status(error.message, true);
    } finally { busy = false; buttons(); }
  }
  node("equipment-reload").addEventListener("click", reload);
  node("equipment-reset").addEventListener("click", () => {
    colors = { ...defaults };
    show();
    sendPreview();
    status("Default colors previewed. Save to apply them.");
  });
  node("equipment-colors-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !revision || !isDirty() || Object.values(colors).some(value => !valid(value))) return;
    busy = true;
    buttons();
    try {
      const response = await fetch("/api/broadcast-colors", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": revision },
        body: JSON.stringify({ themeId: "classic", output: "equipment", colors })
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.message || "Could not save equipment colors.");
      revision = result.revision;
      saved = { ...colors };
      sendPreview();
      status("Equipment colors saved. OBS overlay will update automatically.");
    } catch (error) {
      status(error.message + " Reload if settings changed in another panel.", true);
    } finally { busy = false; buttons(); }
  });
  window.addEventListener("pagehide", () => {
    preview.contentWindow?.postMessage({ type: "equipment-colors-preview-clear" }, location.origin);
  });
  reload();
})();
