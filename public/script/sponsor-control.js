(function () {
  "use strict";
  const node = (id) => document.getElementById(id);
  let snapshot = null,
    logos = [],
    busy = false,
    dirty = false;
  function status(message, error = false) {
    node("sponsor-status").textContent = message;
    node("sponsor-status").dataset.error = String(error);
  }
  function controls() {
    node("sponsor-add").disabled =
      busy || dirty || !snapshot || logos.length >= 20;
    node("sponsor-save").disabled = busy || !dirty || !snapshot;
    node("sponsor-reload").disabled = busy;
    node("sponsor-upload").disabled = busy || dirty;
    node("sponsor-enabled").disabled = busy || !snapshot;
    node("sponsor-interval").disabled = busy || !snapshot;
    for (const button of node("sponsor-list").querySelectorAll("button"))
      button.disabled = busy;
  }
  function edited() {
    dirty = true;
    status("Unsaved slideshow changes. Save before uploading another logo.");
    controls();
  }
  function render() {
    const list = node("sponsor-list");
    list.replaceChildren();
    logos.forEach((logo, index) => {
      const row = document.createElement("li");
      const image = document.createElement("img");
      image.src = "/broadcast-sponsors/" + logo.file;
      image.alt = "";
      const name = document.createElement("span");
      name.textContent = logo.name;
      row.append(image, name);
      for (const [label, action] of [
        [
          "Move up",
          () => {
            if (index > 0)
              [logos[index - 1], logos[index]] = [
                logos[index],
                logos[index - 1],
              ];
          },
        ],
        [
          "Move down",
          () => {
            if (index < logos.length - 1)
              [logos[index + 1], logos[index]] = [
                logos[index],
                logos[index + 1],
              ];
          },
        ],
        [
          "Remove",
          () => {
            logos.splice(index, 1);
          },
        ],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = label;
        button.setAttribute("aria-label", label + " " + logo.name);
        button.onclick = () => {
          action();
          render();
          edited();
        };
        row.append(button);
      }
      list.append(row);
    });
    if (!logos.length) {
      const empty = document.createElement("li");
      empty.textContent = "No sponsor logos added.";
      list.append(empty);
    }
    controls();
  }
  function accept(result) {
    snapshot = result;
    logos = result.data.logos.map((logo) => ({ ...logo }));
    dirty = false;
    node("sponsor-enabled").checked = result.data.enabled;
    node("sponsor-interval").value = result.data.intervalSeconds;
    render();
  }
  async function request(options) {
    const { upload, ...init } = options || {};
    const response = await fetch(
      "/api/broadcast-sponsors" + (upload ? "/logos" : ""),
      {
        cache: "no-store",
        ...init,
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw Error(result.message || "Sponsor settings unavailable");
    return result;
  }
  async function perform(action, message) {
    if (busy) return;
    busy = true;
    controls();
    try {
      accept(await action());
      status(message);
      return true;
    } catch (error) {
      status(error.message + " Your current edits are retained.", true);
      return false;
    } finally {
      busy = false;
      controls();
    }
  }
  node("sponsor-preview").onclick = () => {
    const output = node("preview-output");
    if (!output.value.startsWith("draft")) output.value = "draft-normal";
    document.querySelector('[data-theme-id="studio"]').click();
  };
  node("sponsor-reload").onclick = () =>
    perform(() => request(), "Sponsor settings loaded.");
  node("sponsor-enabled").onchange = edited;
  node("sponsor-interval").oninput = edited;
  node("sponsor-upload-form").onsubmit = (event) => {
    event.preventDefault();
    if (!snapshot || dirty || busy) return;
    const file = node("sponsor-upload").files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024)
      return status("Logo must be 3 MB or smaller.", true);
    const body = new FormData();
    body.append("logo", file);
    perform(
      () =>
        request({
          upload: true,
          method: "POST",
          headers: { "If-Match": snapshot.revision },
          body,
        }),
      "Logo uploaded and saved.",
    ).then((saved) => {
      if (saved) node("sponsor-upload").value = "";
    });
  };
  node("sponsor-settings-form").onsubmit = (event) => {
    event.preventDefault();
    if (!snapshot || !dirty || busy) return;
    perform(
      () =>
        request({
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Match": snapshot.revision,
          },
          body: JSON.stringify({
            enabled: node("sponsor-enabled").checked,
            intervalSeconds: Number(node("sponsor-interval").value),
            logoIds: logos.map((logo) => logo.id),
          }),
        }),
      "Sponsor slideshow saved.",
    );
  };
  perform(() => request(), "Sponsor settings loaded.");
})();
