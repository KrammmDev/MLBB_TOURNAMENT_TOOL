(function () {
  "use strict";
  const catalog = window.RosterThemes,
    frame = document.getElementById("theme-preview");
  const activate = document.getElementById("activate-theme"),
    previous = document.getElementById("previous-theme");
  const outputSelect = document.getElementById("preview-output");
  const output = () =>
    outputSelect.value === "casters"
      ? "casters"
      : outputSelect.value === "schedule"
        ? "schedule"
        : outputSelect.value === "postdraft"
          ? "postdraft"
          : ["scoreboard", "scoreboard-ocr"].includes(outputSelect.value)
            ? "scoreboard"
            : outputSelect.value.startsWith("draft")
              ? "draft"
              : "roster";
  const format = () => (outputSelect.value === "draft-six" ? "six" : "normal");
  function outputURL() {
    return output() === "casters"
      ? "/casters.html"
      : output() === "schedule"
        ? "/scheduledisplay.html"
        : output() === "postdraft"
          ? "/postdraft2.html"
          : output() === "scoreboard"
            ? outputSelect.value === "scoreboard-ocr"
              ? "/scoreboard-themed-ocr.html"
              : "/scoreboard.html"
            : output() === "roster"
              ? "/broadcast-overlay.html"
              : "/draft-display.html?format=" + format();
  }
  function updateURL() {
    document.getElementById("output-url").value = location.origin + outputURL();
  }
  const reloadButton = document.getElementById("reload-settings");
  let snapshot = null,
    selected = null,
    editRevision = null,
    previewReady = false,
    saving = false,
    colorEditing = false;
  const theme = (id) => catalog.themes.find((theme) => theme.id === id);
  function status(message, error = false) {
    const el = document.getElementById("theme-status");
    el.textContent = message;
    el.dataset.error = String(error);
  }
  function buttons() {
    document.getElementById("preview-canvas-note").textContent =
      output() === "schedule"
        ? "1920 × 1080 · transparent video window"
        : output() === "postdraft"
          ? "1920 × 1080 · full-page design"
          : "1920 × 1080 · transparent background";
    for (const card of document.querySelectorAll(".theme-card"))
      card.disabled = saving || !snapshot;
    activate.textContent =
      "Use for " +
      {
        draft: "Draft",
        scoreboard: "Scoreboard",
        roster: "Roster",
        postdraft: "Post-draft",
        schedule: "Schedule",
        casters: "Online Casters",
      }[output()] +
      " only";
    activate.disabled =
      saving ||
      !previewReady ||
      colorEditing ||
      !snapshot ||
      selected === catalog.selection(snapshot.data, output()).themeId;
    previous.disabled =
      saving || !catalog.selection(snapshot?.data, output()).previousThemeId;
    reloadButton.disabled = saving;
    outputSelect.disabled = saving;
  }
  document.addEventListener("broadcast-colors-editing", (event) => {
    colorEditing = event.detail.dirty;
    buttons();
  });
  function choose(id) {
    if (saving) return;
    selected = id;
    document.dispatchEvent(
      new CustomEvent("broadcast-preview-selection", {
        detail: { id, output: output() },
      }),
    );
    editRevision = snapshot?.revision;
    previewReady = false;
    document.getElementById("preview-label").textContent = theme(id).label;
    for (const card of document.querySelectorAll(".theme-card"))
      card.setAttribute("aria-pressed", String(card.dataset.themeId === id));
    if (output() !== "roster") {
      const details = {
        classic:
          output() === "scoreboard"
            ? "Angled charcoal rail · gold frame · minimap outline"
            : "Original orange / red / white display2 layout",
        arena:
          output() === "scoreboard"
            ? "Navy HUD frame · cyan bevels"
            : "Subtle mirrored cards · navy/cyan stage",
        studio:
          output() === "scoreboard"
            ? "Championship rail · team-color wings · ivory crest"
            : "White team desks · slim center clock",
      };
      if (output() === "schedule")
        Object.assign(details, {
          classic: "Playoffs · left fixtures · right video",
          arena: "Metallic broadcast desk · right video · caster panel",
          studio: "Season 18 format · left schedule/talents · right video",
        });
      if (output() === "casters")
        Object.assign(details, {
          classic:
            "Carbon esports stage · neon corner rails · angular caster plates",
          arena:
            "World stage · blue stage lighting · mirrored white/cyan nameplates",
          studio:
            "Violet event stage · gold camera frames · inset purple name tabs",
        });
      if (output() === "postdraft")
        Object.assign(details, {
          classic: "Stacked team rows · player cutouts over heroes",
          arena: "Dark ten-card lineup · vertical player names",
          studio: "White ten-card lineup · team color name rails",
        });
      const colors = {
        classic: ["#ffffff", "#ff7200", "#ff0101"],
        arena: ["#091827", "#1bc2d5", "#527fe8"],
        studio:
          output() === "scoreboard"
            ? ["#101820", "#16c6d3", "#f23b58"]
            : ["#f1f4f8", "#0757ed", "#e92237"],
      };
      if (output() === "schedule")
        Object.assign(colors, {
          classic: ["#351008", "#ff7200", "#e92237"],
          arena: ["#091827", "#1bc2d5", "#527fe8"],
          studio: ["#f5f3ed", "#e9ba30", "#e92237"],
        });
      if (output() === "casters")
        Object.assign(colors, {
          classic: ["#080c12", "#c8ff42", "#39c6ff"],
          arena: ["#061a52", "#16c8ef", "#2361ff"],
          studio: ["#39247b", "#d8b740", "#ffffff"],
        });
      for (const card of document.querySelectorAll(".theme-card")) {
        card.querySelector("p").textContent = details[card.dataset.themeId];
        [...card.querySelectorAll(".swatches i")].forEach(
          (chip, index) =>
            (chip.style.background = colors[card.dataset.themeId][index]),
        );
      }
    } else {
      const details = {
        classic: "Asymmetric layout · warm orange accents",
        arena: "Three-column layout · grand-final framing",
        studio: "Featured duo · match desk · transparent stage",
      };
      const colors = {
        classic: ["#2a0a00", "#ff7200", "#ff0101"],
        arena: ["#0d0000", "#ffb380", "#8b0000"],
        studio: ["#111925", "#5ed7ef", "#ff8c89"],
      };
      for (const card of document.querySelectorAll(".theme-card")) {
        card.querySelector("p").textContent = details[card.dataset.themeId];
        [...card.querySelectorAll(".swatches i")].forEach(
          (chip, index) =>
            (chip.style.background = colors[card.dataset.themeId][index]),
        );
      }
    }
    status("Loading preview…");
    buttons();
    const url = new URL(outputURL(), location.origin);
    url.searchParams.set("theme", id);
    frame.src = url.href;
    updateURL();
  }
  for (const preset of catalog.themes) {
    const card = document.createElement("button");
    card.type = "button";
    card.disabled = true;
    card.className = "theme-card";
    card.dataset.themeId = preset.id;
    card.setAttribute("aria-pressed", "false");
    const swatches = document.createElement("div");
    swatches.className = "swatches";
    swatches.setAttribute("aria-hidden", "true");
    const colors = {
      classic: ["#2a0a00", "#ff7200", "#ff0101"],
      arena: ["#0d0000", "#ffb380", "#8b0000"],
      studio: ["#111925", "#5ed7ef", "#ff8c89"],
    }[preset.id];
    for (const color of colors) {
      const swatch = document.createElement("i");
      swatch.style.background = color;
      swatches.append(swatch);
    }
    const title = document.createElement("strong");
    title.textContent = preset.label;
    const detail = document.createElement("p");
    detail.textContent = {
      classic: "Asymmetric layout · warm orange accents",
      arena: "Three-column layout · grand-final framing",
      studio: "Featured duo · match desk · transparent stage",
    }[preset.id];
    card.append(swatches, title, detail);
    card.onclick = () => choose(preset.id);
    document.getElementById("theme-grid").append(card);
  }
  window.addEventListener("message", (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== frame.contentWindow ||
      event.data?.id !== selected ||
      event.data?.output !== output() ||
      (output() === "draft" && event.data?.format !== format())
    )
      return;
    if (event.data.type === "broadcast-theme-ready") {
      previewReady = true;
      document.dispatchEvent(
        new CustomEvent("broadcast-preview-ready", {
          detail: { id: selected, output: output() },
        }),
      );
      status("Preview ready. Your saved selection has not changed.");
      buttons();
    }
    if (event.data.type === "broadcast-theme-error") {
      previewReady = false;
      status(
        "Preview could not load. Your saved selection has not changed.",
        true,
      );
      buttons();
    }
  });
  async function read() {
    const response = await fetch("/api/broadcast-theme", { cache: "no-store" });
    if (!response.ok) throw Error("Settings unavailable");
    return response.json();
  }
  async function reload() {
    try {
      snapshot = await read();
      document.getElementById("active-theme").textContent = theme(
        catalog.selection(snapshot.data, output()).themeId,
      ).label;
      choose(catalog.selection(snapshot.data, output()).themeId);
    } catch (error) {
      status("Cannot load settings. Check the server and reload.", true);
      buttons();
    }
  }
  activate.onclick = async () => {
    if (!previewReady || !snapshot || saving || colorEditing) return;
    saving = true;
    buttons();
    status("Saving broadcast selection…");
    try {
      const response = await fetch("/api/broadcast-theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": editRevision,
        },
        body: JSON.stringify({ themeId: selected, output: output() }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.message || "Selection could not be saved");
      snapshot = result;
      editRevision = result.revision;
      document.getElementById("active-theme").textContent = theme(
        catalog.selection(result.data, output()).themeId,
      ).label;
      status("Broadcast selection saved.");
    } catch (error) {
      status(error.message + " Use Reload settings before retrying.", true);
      previewReady = false;
    } finally {
      saving = false;
      buttons();
    }
  };
  previous.onclick = () => {
    if (catalog.selection(snapshot?.data, output()).previousThemeId)
      choose(catalog.selection(snapshot.data, output()).previousThemeId);
  };
  reloadButton.onclick = reload;
  const url = document.getElementById("output-url");
  updateURL();
  outputSelect.onchange = () => {
    updateURL();
    if (snapshot) {
      document.getElementById("active-theme").textContent = theme(
        catalog.selection(snapshot.data, output()).themeId,
      ).label;
      choose(catalog.selection(snapshot.data, output()).themeId);
    }
  };
  document.getElementById("copy-url").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url.value);
      status("Browser Source URL copied.");
    } catch {
      url.focus();
      url.select();
      status("Select and copy the output URL from the field.");
    }
  };
  reload();
})();
