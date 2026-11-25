/* Read the same match data as control.html and the same tournament-logo
   branding source as broadcast-themes.html. No hardcoded player roles. */
(() => {
  "use strict";
  const roleInfo = {
    exp: { label: "EXP", mark: "E" },
    junggle: { label: "JUNGLE", mark: "J" }, // control.html's persisted spelling
    jungle: { label: "JUNGLE", mark: "J" },
    mid: { label: "MID", mark: "M" },
    roam: { label: "ROAM", mark: "R" },
    gold: { label: "GOLD", mark: "G" }
  };
  const logo = document.getElementById("build-tournament-logo");
  const placeholder = document.getElementById("build-logo-placeholder");
  let currentLogo = "";
  let active = true;

  async function refreshRoles() {
    try {
      const res = await fetch("/database/matchdatateam.json", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!active) return;
      for (const [side, offset] of [["blueteam", 0], ["redteam", 5]]) {
        const players = data?.teamdata?.[side]?.playerlist || [];
        for (let i = 0; i < 5; i++) {
          const box = document.getElementById("build-role-" + (offset + i + 1));
          if (!box) continue;
          const role = roleInfo[String(players[i]?.lane || "").trim().toLowerCase()];
          box.querySelector(".role-mark").textContent = role?.mark || "—";
          box.querySelector(".role-name").textContent = role?.label || "—";
        }
      }
    } catch (err) { console.warn("Equipment roles unavailable:", err); }
  }

  async function refreshLogo() {
    try {
      const res = await fetch("/api/scoreboard-branding", { cache: "no-store" });
      if (!res.ok) return;
      const payload = await res.json();
      if (!active || payload?.data?.schemaVersion !== 1) return;
      const filename = payload.data.logoFile;
      const safe = typeof filename === "string" &&
        /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(filename);
      const source = safe ? "/scoreboard-branding/" + filename : "";
      if (source === currentLogo) return;
      currentLogo = source;
      logo.hidden = true;
      placeholder.hidden = false;
      if (!source) {
        logo.removeAttribute("src");
        return;
      }
      logo.onload = () => {
        if (active && currentLogo === source) {
          logo.hidden = false;
          placeholder.hidden = true;
        }
      };
      logo.onerror = () => {
        if (currentLogo === source) {
          logo.hidden = true;
          placeholder.hidden = false;
        }
      };
      logo.src = source;
    } catch (err) { console.warn("Tournament branding unavailable:", err); }
  }

  refreshRoles();
  refreshLogo();
  const roleTimer = setInterval(refreshRoles, 3000);
  const logoTimer = setInterval(refreshLogo, 5000);
  window.addEventListener("pagehide", () => {
    active = false;
    clearInterval(roleTimer);
    clearInterval(logoTimer);
  });
})();
