(function () {
  "use strict";
  const catalog = window.RosterThemes,
    frame = document.getElementById("theme-preview");
  const activate = document.getElementById("activate-theme"),
    previous = document.getElementById("previous-theme");
  const outputSelect = document.getElementById("preview-output");
  const output = () =>
    outputSelect.value.startsWith("draft") ? "draft" : "roster";
  const format = () => (outputSelect.value === "draft-six" ? "six" : "normal");
  function outputURL() {
    return output() === "roster"
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
    saving = false;
  const theme = (id) => catalog.themes.find((theme) => theme.id === id);
  function status(message, error = false) {
    const el = document.getElementById("theme-status");
    el.textContent = message;
    el.dataset.error = String(error);
  }
  function buttons() {
    for (const card of document.querySelectorAll(".theme-card"))
      card.disabled = saving || !snapshot;
    activate.disabled =
      saving ||
      !previewReady ||
      !snapshot ||
      selected === snapshot.data.themeId;
    previous.disabled = saving || !snapshot?.data.previousThemeId;
    reloadButton.disabled = saving;
    outputSelect.disabled = saving;
  }
  function choose(id) {
    if (saving) return;
    selected = id;
    editRevision = snapshot?.revision;
    previewReady = false;
    document.getElementById("preview-label").textContent = theme(id).label;
    for (const card of document.querySelectorAll(".theme-card"))
      card.setAttribute("aria-pressed", String(card.dataset.themeId === id));
    if (output() === "draft") {
      const details = {
        classic: "Original orange / red / white display2 layout",
        arena: "Navy / cyan · separate player-name bars",
        studio: "White / slate · blue and red team strips",
      };
      const colors = {
        classic: ["#ffffff", "#ff7200", "#ff0101"],
        arena: ["#10213a", "#7bdeef", "#e23b53"],
        studio: ["#f1f4f8", "#0757ed", "#e92237"],
      };
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
        studio: "Clean slate panels · blue and coral accents",
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
      studio: "Clean slate panels · blue and coral accents",
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
        snapshot.data.themeId,
      ).label;
      choose(snapshot.data.themeId);
    } catch (error) {
      status("Cannot load settings. Check the server and reload.", true);
      buttons();
    }
  }
  activate.onclick = async () => {
    if (!previewReady || !snapshot || saving) return;
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
        body: JSON.stringify({ themeId: selected }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.message || "Selection could not be saved");
      snapshot = result;
      editRevision = result.revision;
      document.getElementById("active-theme").textContent = theme(
        result.data.themeId,
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
    if (snapshot?.data.previousThemeId) choose(snapshot.data.previousThemeId);
  };
  reloadButton.onclick = reload;
  const url = document.getElementById("output-url");
  updateURL();
  outputSelect.onchange = () => {
    updateURL();
    if (selected) choose(selected);
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
