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
    for (const key of ["name", "handle", "role", "vdoUrl"]) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      label.textContent = key[0].toUpperCase() + key.slice(1);
      input.id = "caster-" + (i + 1) + "-" + key;
      input.maxLength = key === "vdoUrl" ? 2048 : 64;
      if (key === "vdoUrl") {
        label.textContent = "VDO.Ninja view link (https://vdo.ninja/?view=…)";
        input.placeholder = "https://vdo.ninja/?view=CASTER_ID";
      }
      input.style.cssText =
        "display:block;width:100%;margin:8px 0 14px;padding:10px";
      input.disabled = true;
      label.append(input);
      box.append(label);
      row[key] = input;
    }
    const status = document.createElement("p");
    status.id = "caster-" + (i + 1) + "-air-status";
    box.append(status);
    for (const [label, onAir] of [
      ["On Air", true],
      ["Off Air", false],
    ]) {
      const button = document.createElement("button");
      button.id = "caster-" + (i + 1) + (onAir ? "-on-air" : "-off-air");
      button.textContent = label;
      button.disabled = true;
      button.onclick = () => save({ caster: i, onAir });
      box.append(button);
      buttons.push(button.id);
    }
    fields.push(row);
    $("caster-fields").append(box);
  }
  function controls() {
    for (const id of buttons) $(id).disabled = busy || !snapshot;
    $("caster-reload").disabled = busy;
    if (snapshot)
      snapshot.data.casters.forEach((c, i) => {
        $("caster-" + (i + 1) + "-air-status").textContent =
          c.onAir !== false
            ? "ON AIR"
            : "OFF AIR — video and audio disconnected";
      });
    for (const row of fields)
      for (const input of Object.values(row))
        input.disabled = busy || !snapshot;
  }
  function fill() {
    snapshot.data.casters.forEach((c, i) => {
      for (const key of ["name", "handle", "role", "vdoUrl"])
        fields[i][key].value = c[key] || "";
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
      $("caster-status").dataset.error = "false";
      fill();
      $("caster-status").textContent =
        "Caster settings loaded. Frame " +
        (snapshot.data.visible ? "shown" : "hidden") +
        "; names " +
        (snapshot.data.namesVisible ? "shown" : "hidden") +
        ".";
    } catch (e) {
      $("caster-status").textContent = e.message;
      $("caster-status").dataset.error = "true";
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
      const includeDetails =
        change === "details" ||
        change.visible === true ||
        change.namesVisible === true ||
        change.onAir === true;
      if (includeDetails)
        next.casters = fields.map((row, i) => ({
          ...next.casters[i],
          ...Object.fromEntries(
            Object.entries(row).map(([key, input]) => [key, input.value]),
          ),
        }));
      if (change !== "details" && Number.isInteger(change.caster))
        next.casters[change.caster].onAir = change.onAir;
      else if (change !== "details") Object.assign(next, change);
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
      $("caster-status").dataset.error = "false";
      if (includeDetails) fill();
      $("caster-status").textContent =
        "Saved. Frame " +
        (value.data.visible ? "shown" : "hidden") +
        "; names " +
        (value.data.namesVisible ? "shown" : "hidden") +
        ".";
    } catch (e) {
      $("caster-status").textContent = e.message;
      $("caster-status").dataset.error = "true";
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
