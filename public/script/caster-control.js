(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    buttons = [
      "caster-save",
      "caster-show",
      "caster-hide",
      "caster-names-show",
      "caster-names-hide",
    ],
    fields = [];
  let snapshot = null,
    busy = false;
  for (let i = 0; i < 2; i++) {
    const box = document.createElement("fieldset"),
      legend = document.createElement("legend");
    legend.textContent = "Caster " + (i + 1);
    box.append(legend);
    const row = {};
    for (const key of ["name", "handle", "role"]) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      label.textContent = key[0].toUpperCase() + key.slice(1);
      input.id = "caster-" + (i + 1) + "-" + key;
      input.maxLength = 64;
      input.style.cssText =
        "display:block;width:100%;margin:8px 0 14px;padding:10px";
      input.disabled = true;
      label.append(input);
      box.append(label);
      row[key] = input;
    }
    fields.push(row);
    $("caster-fields").append(box);
  }
  function controls() {
    for (const id of buttons) $(id).disabled = busy || !snapshot;
    $("caster-reload").disabled = busy;
    for (const row of fields)
      for (const input of Object.values(row))
        input.disabled = busy || !snapshot;
  }
  function fill() {
    snapshot.data.casters.forEach((c, i) => {
      for (const key of ["name", "handle", "role"])
        fields[i][key].value = c[key];
    });
  }
  async function read() {
    if (busy) return;
    busy = true;
    controls();
    try {
      const r = await fetch("/api/caster-panel", { cache: "no-store" });
      if (!r.ok) throw Error("Caster settings unavailable");
      snapshot = await r.json();
      fill();
      $("caster-status").textContent =
        "Caster settings loaded. Frame " +
        (snapshot.data.visible ? "shown" : "hidden") +
        "; names " +
        (snapshot.data.namesVisible ? "shown" : "hidden") +
        ".";
    } catch (e) {
      $("caster-status").textContent = e.message;
    } finally {
      busy = false;
      controls();
    }
  }
  async function save(change) {
    if (busy || !snapshot) return;
    busy = true;
    controls();
    try {
      const next = structuredClone(snapshot.data);
      if (change === "details")
        next.casters = fields.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, input]) => [key, input.value]),
          ),
        );
      else Object.assign(next, change);
      const r = await fetch("/api/caster-panel", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Match": snapshot.revision,
          },
          body: JSON.stringify(next),
        }),
        value = await r.json();
      if (!r.ok) throw Error(value.message || "Caster save failed");
      snapshot = value;
      if (change === "details") fill();
      $("caster-status").textContent =
        "Saved. Frame " +
        (value.data.visible ? "shown" : "hidden") +
        "; names " +
        (value.data.namesVisible ? "shown" : "hidden") +
        ".";
    } catch (e) {
      $("caster-status").textContent = e.message;
    } finally {
      busy = false;
      controls();
    }
  }
  $("caster-save").onclick = () => save("details");
  $("caster-show").onclick = () => save({ visible: true });
  $("caster-hide").onclick = () => save({ visible: false });
  $("caster-names-show").onclick = () => save({ namesVisible: true });
  $("caster-names-hide").onclick = () => save({ namesVisible: false });
  $("caster-reload").onclick = read;
  read();
})();
