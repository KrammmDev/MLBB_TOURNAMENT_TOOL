/* Equipment-only colors: saved through the existing broadcast color API.
   Preview messages change only the Broadcast Themes iframe until Save. */
(() => {
  "use strict";
  const themeId = "classic", output = "equipment";
  const defaults = { left: "#258be0", right: "#e34e62" };
  const root = document.documentElement;
  let saved = { ...defaults }, preview = null, running = true, pending = false;
  const valid = (c) => c && ["left", "right"].every(k => /^#[0-9a-f]{6}$/i.test(c[k] || ""));
  const render = () => {
    const colors = preview || saved;
    root.style.setProperty("--blue", colors.left);
    root.style.setProperty("--red", colors.right);
  };
  async function read() {
    if (!running || pending) return;
    pending = true;
    try {
      const response = await fetch("/api/broadcast-colors", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const colors = data.data?.palettes?.[themeId]?.[output] || {};
      saved = {
        left: /^#[0-9a-f]{6}$/i.test(colors.left || "") ? colors.left : defaults.left,
        right: /^#[0-9a-f]{6}$/i.test(colors.right || "") ? colors.right : defaults.right
      };
      render();
    } catch (error) { console.warn("Equipment colors unavailable", error); }
    finally { pending = false; }
  }
  window.addEventListener("message", event => {
    if (window.parent === window || event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type === "equipment-colors-preview" && valid(event.data.colors)) {
      preview = { ...event.data.colors };
      render();
    } else if (event.data?.type === "equipment-colors-preview-clear") {
      preview = null;
      render();
    }
  });
  read();
  const timer = setInterval(read, 5000);
  window.addEventListener("pagehide", () => { running = false; clearInterval(timer); });
})();
