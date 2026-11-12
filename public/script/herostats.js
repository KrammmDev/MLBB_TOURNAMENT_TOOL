const REVEAL_DELAY_MS = 2000; // delay pagkatapos ng hero reveal bago lumabas ang unang card
const CARD_DISPLAY_DURATION_MS = 2200; // gaano katagal naka-display ang bawat card
const CARD_GAP_MS = 400; // gap sa pagitan ng mga card

(function () {
  const HEROSTATS_API = "/api/herostats";
  const REFRESH_INTERVAL_MS = 5000;

  const SLOT_IDS = [];
  for (let i = 1; i <= 20; i++) SLOT_IDS.push(i);

  // Ayusin / palitan ang order dito kung gusto mo
  const STEPS = [
    {
      key: "pickcount",
      label: "TIMES PICKED",
      pct: false,
      showHero: true, // hero name lalabas lang sa TIMES PICKED
      get: (d) => formatNumber(d ? d.pickCount || d.picks || 0 : 0),
    },
    {
      key: "win",
      label: "WIN RATE",
      pct: true,
      get: (d) => (d ? formatPct(d.winRate) : "--"),
    },
    {
      key: "pick",
      label: "PICK RATE",
      pct: true,
      get: (d) => (d ? formatPct(d.pickRate) : "--"),
    },
    {
      key: "ban",
      label: "BAN RATE",
      pct: true,
      get: (d) => (d ? formatPct(d.banRate) : "--"),
    },
  ];

  let heroStats = {};
  const slotTimers = {};

  async function loadStats() {
    try {
      const response = await fetch(HEROSTATS_API);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      heroStats = data.heroes || {};
      return heroStats;
    } catch (error) {
      console.error("herostats.js: failed to load /api/herostats", error);
      return heroStats;
    }
  }

  function normalizeName(name) {
    return (name || "").trim();
  }

  function formatPct(val) {
    if (val === undefined || val === null || isNaN(val)) return "--";
    if (Number(val) >= 100) return "100%";
    return Number(val).toFixed(1) + "%";
  }

  function formatNumber(val) {
    if (val === undefined || val === null || isNaN(val)) return "--";
    return Number(val).toLocaleString();
  }

  function getHeroName(slot) {
    const nameEl = document.getElementById("hero-name-" + slot);
    if (!nameEl) return null;
    const heroName = normalizeName(nameEl.textContent);
    if (!heroName || heroName === "-") return null;
    return heroName;
  }

  // Isang card per stat (key = pickcount / win / pick / ban)
  function ensureCard(slot, step) {
    const container = document.getElementById("image-box-" + slot);
    if (!container) return null;

    const cls = "stat-card-" + step.key;
    let card = container.querySelector("." + cls);
    if (card) return card;

    const isBan = slot >= 11 && slot <= 20;

    card = document.createElement("div");
    card.className =
      "pick-count-card stat-card " +
      cls +
      (step.pct ? " is-pct" : "") +
      (isBan ? " hero-stats-ban" : " hero-stats-pick");
    card.innerHTML = `
      <div class="pick-count-number" data-value>--</div>
      <div class="pick-count-label">${step.label}</div>
      ${step.showHero ? '<div class="pick-count-hero" data-hero>--</div>' : ""}
    `;
    container.appendChild(card);
    return card;
  }

  function populateCard(slot, step) {
    const heroName = getHeroName(slot);
    if (!heroName) return null;

    const card = ensureCard(slot, step);
    if (!card) return null;

    card.querySelector("[data-value]").textContent = step.get(
      heroStats[heroName],
    );
    const heroEl = card.querySelector("[data-hero]");
    if (heroEl) heroEl.textContent = heroName.toUpperCase();
    return card;
  }

  function clearSlotTimers(slot) {
    const timers = slotTimers[slot];
    if (!timers) return;
    timers.forEach((t) => clearTimeout(t));
    delete slotTimers[slot];
  }

  function addTimer(slot, t) {
    if (!slotTimers[slot]) slotTimers[slot] = [];
    slotTimers[slot].push(t);
  }

  // Ipakita ang card #index, tapos susunod
  function showStep(slot, index) {
    if (index >= STEPS.length) return;

    const step = STEPS[index];
    const card = populateCard(slot, step);
    if (card) card.classList.add("show");

    addTimer(
      slot,
      setTimeout(() => {
        if (card) card.classList.remove("show");
        addTimer(
          slot,
          setTimeout(() => showStep(slot, index + 1), CARD_GAP_MS),
        );
      }, CARD_DISPLAY_DURATION_MS),
    );
  }

  function startRevealSequence(slot) {
    clearSlotTimers(slot);
    addTimer(
      slot,
      setTimeout(() => showStep(slot, 0), REVEAL_DELAY_MS),
    );
  }

  function hideEverythingImmediately(slot) {
    clearSlotTimers(slot);
    const container = document.getElementById("image-box-" + slot);
    if (!container) return;
    container
      .querySelectorAll(".stat-card.show")
      .forEach((c) => c.classList.remove("show"));
  }

  function watchSlot(slot) {
    const container = document.getElementById("image-box-" + slot);
    if (!container) return;

    const observer = new MutationObserver(() => {
      const isShown = container.classList.contains("show");

      if (isShown && container.dataset.statsTriggered !== "1") {
        container.dataset.statsTriggered = "1";
        startRevealSequence(slot);
      } else if (!isShown) {
        container.dataset.statsTriggered = "";
        hideEverythingImmediately(slot);
      }
    });

    observer.observe(container, {
      attributes: true,
      attributeFilter: ["class"],
    });

    if (container.classList.contains("show")) {
      container.dataset.statsTriggered = "1";
      startRevealSequence(slot);
    }
  }

  // I-update ang number ng card na kasalukuyang nakalabas (kapag nag-refresh ang API)
  function refreshVisibleSlots() {
    SLOT_IDS.forEach((slot) => {
      const container = document.getElementById("image-box-" + slot);
      if (!container) return;
      STEPS.forEach((step) => {
        const card = container.querySelector(".stat-card-" + step.key);
        if (card && card.classList.contains("show")) populateCard(slot, step);
      });
    });
  }

  async function init() {
    await loadStats();
    SLOT_IDS.forEach(watchSlot);

    setInterval(async () => {
      await loadStats();
      refreshVisibleSlots();
    }, REFRESH_INTERVAL_MS);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
