(function () {
  "use strict";
  const el = (id) => document.getElementById(id);
  let snapshot = null,
    busy = false;
  const inputs = [el("scoreboard-patch"), el("scoreboard-casters")];
  function status(message, error = false) {
    el("scoreboard-details-status").textContent = message;
    el("scoreboard-details-status").dataset.error = String(error);
  }
  function controls() {
    for (const input of inputs) input.disabled = busy || !snapshot;
    el("scoreboard-details-save").disabled = busy || !snapshot;
    el("tournament-logo-upload").disabled = busy || !snapshot;
    el("tournament-logo-remove").disabled = busy || !snapshot?.data.logoFile;
    el("scoreboard-details-reload").disabled = busy;
    el("tournament-logo-file").disabled = busy || !snapshot;
  }
  function logo() {
    const image = el("tournament-logo-preview"),
      file = snapshot?.data.logoFile;
    image.hidden = !file;
    if (file) image.src = "/scoreboard-branding/" + file;
    else image.removeAttribute("src");
  }
  async function request(method = "GET", body) {
    const response = await fetch(
      "/api/scoreboard-branding" +
        (method === "POST" || method === "DELETE" ? "/logo" : ""),
      {
        method,
        cache: "no-store",
        headers: {
          ...(snapshot ? { "If-Match": snapshot.revision } : {}),
          ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
        },
        body: method === "PUT" ? JSON.stringify(body) : body,
      },
    );
    const result = await response
      .json()
      .catch(() => ({
        message:
          "Scoreboard details unavailable. Restart the updated server and reload.",
      }));
    if (!response.ok || !result.data || typeof result.revision !== "string")
      throw Error(result.message || "Scoreboard details unavailable");
    return result;
  }
  async function action(work) {
    if (busy) return;
    busy = true;
    controls();
    try {
      await work();
    } catch (error) {
      status(error.message + " Your text edits are retained.", true);
    } finally {
      busy = false;
      controls();
    }
  }
  el("scoreboard-details-reload").onclick = () =>
    action(async () => {
      snapshot = await request();
      inputs[0].value = snapshot.data.patchLabel;
      inputs[1].value = snapshot.data.casterNames;
      logo();
      status("Saved scoreboard details loaded.");
    });
  el("scoreboard-details-form").onsubmit = (event) => {
    event.preventDefault();
    if (!snapshot) return;
    action(async () => {
      snapshot = await request("PUT", {
        patchLabel: inputs[0].value,
        casterNames: inputs[1].value,
      });
      inputs[0].value = snapshot.data.patchLabel;
      inputs[1].value = snapshot.data.casterNames;
      status("Patch and caster names saved to scoreboard outputs.");
    });
  };
  el("tournament-logo-form").onsubmit = (event) => {
    event.preventDefault();
    const file = el("tournament-logo-file").files[0];
    if (!snapshot || !file) return;
    if (file.size > 3 * 1024 * 1024)
      return status("Logo must be 3 MB or smaller.", true);
    action(async () => {
      const form = new FormData();
      form.append("logo", file);
      snapshot = await request("POST", form);
      logo();
      el("tournament-logo-file").value = "";
      status(
        "Tournament logo uploaded. Any unsaved text edits still need Save details.",
      );
    });
  };
  el("tournament-logo-remove").onclick = () => {
    if (snapshot)
      action(async () => {
        snapshot = await request("DELETE");
        logo();
        status(
          "Tournament logo removed. Any unsaved text edits still need Save details.",
        );
      });
  };
  controls();
  el("scoreboard-details-reload").click();
})();
