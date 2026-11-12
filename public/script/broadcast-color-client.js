/* Saved colors and iframe-only previews share one style layer; no competition writes. */
(function (root) {
  "use strict";
  const model = root.BroadcastColorModel;
  let active = null,
    data = { schemaVersion: 2, palettes: {} },
    loaded = false,
    preview = null,
    style,
    classicImage = "",
    poll,
    running = true,
    version = 0,
    pending = null;
  function valid(value) {
    return (
      value?.schemaVersion === 2 &&
      value.palettes &&
      typeof value.palettes === "object" &&
      !Array.isArray(value.palettes) &&
      Object.entries(value.palettes).every(
        ([id, outputs]) =>
          model.themes.includes(id) &&
          outputs &&
          typeof outputs === "object" &&
          !Array.isArray(outputs) &&
          Object.entries(outputs).every(
            ([output, colors]) =>
              model.validScope(id, output) && model.validColors(colors),
          ),
      )
    );
  }
  function apply() {
    if (!active || !running) return;
    if (!style) {
      style = document.createElement("style");
      style.id = "broadcast-color-overrides";
    }
    const colors =
      preview === null
        ? data.palettes[active.id]?.[active.output] || {}
        : preview;
    const css = model.style(active.id, active.output, colors, classicImage);
    if (style.textContent !== css) style.textContent = css;
    if (
      style.parentNode !== document.head ||
      document.head.lastElementChild !== style
    )
      document.head.append(style);
  }
  async function read() {
    if (pending) return pending;
    const started = version,
      controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 3000);
    pending = (async () => {
      try {
        const response = await fetch("/api/broadcast-colors", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const snapshot = await response.json();
        if (running && started === version && valid(snapshot.data)) {
          data = snapshot.data;
          loaded = true;
          apply();
        }
      } catch {
        /* Retain last acknowledged colors while disconnected. */
      } finally {
        clearTimeout(timeout);
        pending = null;
      }
    })();
    return pending;
  }
  function startPoll() {
    clearInterval(poll);
    if (running) poll = setInterval(read, 5000);
  }
  root.addEventListener("message", (event) => {
    if (
      root.parent === root ||
      event.source !== root.parent ||
      event.origin !== location.origin ||
      !active ||
      event.data?.id !== active.id ||
      event.data?.output !== active.output
    )
      return;
    if (
      event.data.type === "broadcast-colors-preview" &&
      model.validColors(event.data.colors)
    ) {
      preview = { ...event.data.colors };
      apply();
    } else if (event.data.type === "broadcast-colors-preview-clear") {
      preview = null;
      apply();
    }
  });
  root.addEventListener("pagehide", () => {
    running = false;
    version++;
    clearInterval(poll);
  });
  root.addEventListener("pageshow", () => {
    if (!running) {
      running = true;
      read();
      startPoll();
    }
  });
  root.BroadcastColorClient = {
    async activate(id, output) {
      if (!model.validScope(id, output)) return;
      if (!active || active.id !== id || active.output !== output)
        preview = null;
      active = { id, output };
      if (style) style.textContent = "";
      const middle = document.querySelector(".lowermid");
      classicImage =
        output === "draft" && id === "classic" && middle
          ? getComputedStyle(middle, "::before").backgroundImage
          : "";
      apply();
      if (!loaded) await read();
      startPoll();
    },
    accept(message) {
      if (message.type === "broadcast_colors_update" && valid(message.data)) {
        version++;
        data = message.data;
        loaded = true;
        apply();
      }
    },
  };
})(window);
