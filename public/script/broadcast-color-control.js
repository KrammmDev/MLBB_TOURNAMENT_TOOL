(function () {
  "use strict";
  const model = window.BroadcastColorModel,
    node = (id) => document.getElementById(id),
    frame = node("theme-preview");
  let snapshot = null,
    context = null,
    ready = false,
    busy = false;
  const drafts = new Map(),
    inputs = new Map();
  const key = (scope) => scope.id + "/" + scope.output;
  const equal = (a, b) =>
    Object.keys(model.fields).every((field) => a[field] === b[field]);
  function record(scope = context) {
    if (!scope || !snapshot) return null;
    const id = key(scope);
    if (!drafts.has(id)) {
      const saved = {
        ...(snapshot.data.palettes[scope.id]?.[scope.output] || {}),
      };
      drafts.set(id, {
        colors: { ...saved },
        saved,
        revision: snapshot.revision,
      });
    }
    return drafts.get(id);
  }
  const dirty = () => {
    const current = record();
    return Boolean(current && !equal(current.colors, current.saved));
  };
  function status(message, error = false) {
    node("color-status").textContent = message;
    node("color-status").dataset.error = String(error);
  }
  function scopeLabel() {
    return context
      ? window.RosterThemes.themes.find((t) => t.id === context.id).label +
          " · " +
          {
            draft: "Draft",
            roster: "Roster",
            scoreboard: "Scoreboard",
            postdraft: "Post-draft",
          }[context.output]
      : "Select a preview";
  }
  function controls() {
    const current = record(),
      invalid = [...inputs.values()].some(({ hex }) => !hex.checkValidity());
    for (const { color, hex } of inputs.values())
      color.disabled = hex.disabled = busy || !current;
    node("save-colors").disabled = busy || !ready || !dirty() || invalid;
    node("reset-colors").disabled = busy || !current;
    node("reload-colors").disabled = busy;
    document.dispatchEvent(
      new CustomEvent("broadcast-colors-editing", {
        detail: { dirty: dirty() },
      }),
    );
  }
  function preview() {
    const current = record();
    if (ready && current)
      frame.contentWindow?.postMessage(
        {
          type: "broadcast-colors-preview",
          id: context.id,
          output: context.output,
          colors: current.colors,
        },
        location.origin,
      );
  }
  function paint() {
    node("color-scope").textContent = scopeLabel();
    const current = record();
    for (const [field, { color, hex }] of inputs) {
      const value = current
        ? current.colors[field] ||
          model.defaults[context.output][context.id][field]
        : "#000000";
      color.value = value;
      hex.value = value;
      hex.setCustomValidity("");
    }
    controls();
    preview();
  }
  function changed(field, value) {
    const current = record();
    if (!current || busy) return;
    current.colors[field] = value.toLowerCase();
    const pair = inputs.get(field);
    pair.color.value = value;
    pair.hex.value = value.toLowerCase();
    pair.hex.setCustomValidity("");
    status(
      dirty()
        ? "Unsaved preview colors. Save colors to update outputs."
        : "Preview matches the loaded saved colors.",
    );
    controls();
    preview();
  }
  for (const [field, label] of Object.entries(model.fields)) {
    const group = document.createElement("div");
    group.className = "color-field";
    const title = document.createElement("label");
    title.htmlFor = "color-" + field;
    title.textContent = label;
    const row = document.createElement("div");
    row.className = "color-inputs";
    const color = document.createElement("input");
    color.type = "color";
    color.id = "color-" + field;
    const hex = document.createElement("input");
    hex.type = "text";
    hex.id = "color-hex-" + field;
    hex.maxLength = 7;
    hex.pattern = "#[0-9a-fA-F]{6}";
    hex.required = true;
    hex.autocomplete = "off";
    hex.spellcheck = false;
    hex.setAttribute("aria-label", label + " hex value");
    color.oninput = () => changed(field, color.value);
    hex.oninput = () => {
      if (/^#[0-9a-f]{6}$/i.test(hex.value)) changed(field, hex.value);
      else {
        hex.setCustomValidity("Use # followed by six hexadecimal digits");
        controls();
      }
    };
    row.append(color, hex);
    group.append(title, row);
    node("color-fields").append(group);
    inputs.set(field, { color, hex });
  }
  async function request(options) {
    const response = await fetch("/api/broadcast-colors", {
      cache: "no-store",
      ...options,
    });
    const result = await response.json().catch(() => ({
      message: "Color settings unavailable. Check the server and reload.",
    }));
    if (
      !response.ok ||
      result.data?.schemaVersion !== 2 ||
      typeof result.revision !== "string"
    )
      throw Error(result.message || "Color settings unavailable");
    return result;
  }
  async function reload() {
    if (busy) return;
    const selected = context ? key(context) : null;
    busy = true;
    controls();
    try {
      snapshot = await request();
      if (selected) drafts.delete(selected);
      for (const [id, draft] of drafts)
        if (equal(draft.colors, draft.saved)) drafts.delete(id);
      paint();
      status("Saved colors loaded for " + scopeLabel() + ".");
    } catch (error) {
      status(error.message, true);
    } finally {
      busy = false;
      controls();
    }
  }
  document.addEventListener("broadcast-preview-selection", (event) => {
    const scope = event.detail;
    if (!model.validScope(scope.id, scope.output)) return;
    context = { ...scope };
    ready = false;
    paint();
    status(
      snapshot
        ? dirty()
          ? "Your unsaved colors for this preview are retained."
          : "Choose colors, then save when the preview is ready."
        : "Loading color settings…",
    );
  });
  document.addEventListener("broadcast-preview-ready", (event) => {
    if (
      !context ||
      event.detail.id !== context.id ||
      event.detail.output !== context.output
    )
      return;
    ready = true;
    preview();
    controls();
  });
  node("reset-colors").onclick = () => {
    const current = record();
    if (!current || busy) return;
    current.colors = {};
    paint();
    status(
      dirty()
        ? "Default colors previewed. Save colors to apply them."
        : "Using default colors.",
    );
  };
  node("reload-colors").onclick = reload;
  node("color-form").onsubmit = async (event) => {
    event.preventDefault();
    const current = record();
    if (
      busy ||
      !ready ||
      !current ||
      !dirty() ||
      !node("color-form").reportValidity()
    )
      return;
    const scope = { ...context },
      selected = key(scope),
      revision = current.revision,
      colors = { ...current.colors };
    busy = true;
    controls();
    status("Saving colors…");
    try {
      const result = await request({
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": revision },
        body: JSON.stringify({
          themeId: scope.id,
          output: scope.output,
          colors,
        }),
      });
      snapshot = result;
      for (const draft of drafts.values())
        if (draft.revision === revision) draft.revision = result.revision;
      drafts.set(selected, {
        colors: { ...colors },
        saved: { ...colors },
        revision: result.revision,
      });
      paint();
      status(
        "Colors saved for " +
          window.RosterThemes.themes.find((t) => t.id === scope.id).label +
          " · " +
          scope.output +
          ".",
      );
    } catch (error) {
      status(error.message + " Your preview edits are retained.", true);
    } finally {
      busy = false;
      controls();
    }
  };
  paint();
  reload();
})();
