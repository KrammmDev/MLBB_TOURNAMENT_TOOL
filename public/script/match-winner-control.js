(function () {
  "use strict";
  const model = window.BroadcastColorModel,
    frame = document.getElementById("preview"),
    status = document.getElementById("status"),
    save = document.getElementById("save"),
    reset = document.getElementById("reset"),
    reload = document.getElementById("reload"),
    inputs = new Map();
  let snapshot = null,
    colors = {},
    busy = false;
  const labels = {
    background: "Canvas background",
    left: "Gold / victory accent",
    right: "Team panel color",
    text: "Team names / primary text",
    muted: "Secondary text",
    border: "Borders",
  };
  function preview() {
    frame.contentWindow?.postMessage(
      {
        type: "broadcast-colors-preview",
        id: "arena",
        output: "matchwinner",
        colors,
      },
      location.origin,
    );
  }
  function paint() {
    for (const [field, input] of inputs)
      input.value = colors[field] || model.defaults.matchwinner.arena[field];
    save.disabled = reset.disabled = busy || !snapshot;
    reload.disabled = busy;
    for (const input of inputs.values()) input.disabled = busy || !snapshot;
    preview();
  }
  for (const [field, label] of Object.entries(labels)) {
    const row = document.createElement("label"),
      input = document.createElement("input");
    row.textContent = label;
    input.type = "color";
    input.id = "color-" + field;
    input.setAttribute("aria-label", label);
    input.disabled = true;
    input.oninput = () => {
      colors[field] = input.value;
      preview();
      status.textContent = "Preview only — save to apply to OBS.";
    };
    row.append(input);
    document.getElementById("fields").append(row);
    inputs.set(field, input);
  }
  async function read() {
    busy = true;
    paint();
    try {
      const r = await fetch("/api/broadcast-colors", { cache: "no-store" });
      if (!r.ok) throw Error("Unable to load colors");
      snapshot = await r.json();
      colors = { ...(snapshot.data.palettes.arena?.matchwinner || {}) };
      status.textContent = "Saved colors loaded.";
    } catch (e) {
      status.textContent = e.message;
    } finally {
      busy = false;
      paint();
    }
  }
  async function persist(next) {
    if (!snapshot || busy) return;
    busy = true;
    paint();
    try {
      const r = await fetch("/api/broadcast-colors", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": snapshot.revision,
        },
        body: JSON.stringify({
          themeId: "arena",
          output: "matchwinner",
          colors: next,
        }),
      });
      const result = await r.json();
      if (!r.ok)
        throw Error(
          result.message || "Save failed. Reload saved colors before retrying.",
        );
      snapshot = result;
      colors = { ...(result.data.palettes.arena?.matchwinner || {}) };
      status.textContent = "Saved — OBS updated.";
    } catch (e) {
      status.textContent = e.message;
    } finally {
      busy = false;
      paint();
    }
  }
  save.onclick = () => persist({ ...colors });
  reset.onclick = () => persist({});
  reload.onclick = read;
  frame.onload = preview;
  read();
})();
