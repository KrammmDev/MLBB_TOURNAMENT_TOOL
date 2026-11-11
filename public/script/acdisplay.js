const DEFAULT_LOGO = "Assets/Other/transparent.png";
const TOTAL_SCHEDULES = 8;
const SLOT_COUNT = 4;
const SLIDE_INTERVAL_MS = 8000;

let allScheduleData = {};
let pages = [];
let currentPage = 0;
let slideTimer = null;

// ======================
// Animation config
// ======================
// "slide-left" | "slide-up" | "fade" | "scale"
const DIRECTION = "slide-left";

const DIRECTIONS = {
  "slide-left": { from: "translateX(105%)", to: "translateX(-105%)" },
  "slide-up": { from: "translateY(40px)", to: "translateY(-40px)" },
  fade: { from: "none", to: "none" },
  scale: { from: "scale(0.9)", to: "scale(1.05)" },
};

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)"; // malambot na paghinto
const EASE_IN = "cubic-bezier(0.7, 0, 0.84, 0)";
const IN_MS = 900;
const OUT_MS = 550;
const STAGGER_MS = 150; // gap between cards

const INNER_SELECTOR = ".time, .logoholder img, .teamnameholder, .scorebox";
const INNER_STAGGER_MS = 110; // gap between logo/name/score
const INNER_LEAD_MS = 350; // delay bago magsimula ang inner pagkatapos ng card
const INNER_MS = 650;

let isTransitioning = false;
let renderToken = 0;

// ======================
// Read schedules from localStorage
// ======================
function readSchedulesFromStorage() {
  const data = {};
  for (let i = 1; i <= TOTAL_SCHEDULES; i++) {
    const raw = localStorage.getItem(`schedule-${i}`);
    if (raw) {
      try {
        data[i.toString()] = JSON.parse(raw);
      } catch (e) {
        console.error(`Failed to parse schedule-${i}:`, e);
      }
    }
  }
  return data;
}

// ======================
// Get active schedules
// ======================
function getActiveSchedules(allData) {
  const active = [];
  for (let i = 1; i <= TOTAL_SCHEDULES; i++) {
    const data = allData[i.toString()];
    if (data && data.show) {
      active.push({ num: i, data });
    }
  }
  return active;
}

// ======================
// Build pages (matches + casters)
// ======================
function buildPages(allData) {
  const active = getActiveSchedules(allData);
  pages = [];

  // 1. Match pages (bawat 4 matches)
  for (let i = 0; i < active.length; i += SLOT_COUNT) {
    pages.push({
      type: "matches",
      entries: active.slice(i, i + SLOT_COUNT),
    });
  }

  // 2. Hanapin ang casters image
  let castersImg = null;
  for (let i = 1; i <= TOTAL_SCHEDULES; i++) {
    const data = allData[i.toString()];
    if (
      data &&
      data.showCasters &&
      data.castersImg &&
      data.castersImg.length > 100
    ) {
      castersImg = data.castersImg;
      break;
    }
  }

  // 3. Idagdag ang casters page sa dulo
  if (castersImg && pages.length > 0) {
    pages.push({ type: "casters", img: castersImg });
  }

  if (currentPage >= pages.length) currentPage = 0;
}

// ======================
// Helpers
// ======================
function getCards() {
  return [
    ...document.querySelectorAll(".schedule"),
    document.getElementById("casters-page"),
  ];
}

function getVisibleCards() {
  return getCards().filter(
    (el) => el.style.display !== "none" && !el.classList.contains("hidden"),
  );
}

// Hintayin munang ma-load at ma-decode ang image bago ipakita
function preloadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
    if (img.decode) img.decode().then(resolve).catch(resolve);
  });
}

// ======================
// Animations (Web Animations API)
// ======================
function animateIn(els) {
  const dir = DIRECTIONS[DIRECTION];
  const anims = [];

  els.forEach((el, i) => {
    const cardDelay = i * STAGGER_MS;
    el.style.willChange = "transform, opacity";

    // Card mismo
    anims.push(
      el
        .animate(
          [
            { opacity: 0, transform: dir.from },
            { opacity: 1, offset: 0.3 },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: IN_MS,
            delay: cardDelay,
            easing: EASE_OUT,
            fill: "backwards",
          },
        )
        .finished.catch(() => {}),
    );

    // Isa-isang pasok ng laman ng card (DOM order)
    el.querySelectorAll(INNER_SELECTOR).forEach((child, j) => {
      anims.push(
        child
          .animate(
            [
              { opacity: 0, transform: "translateX(40px)" },
              { opacity: 1, transform: "none" },
            ],
            {
              duration: INNER_MS,
              delay: cardDelay + INNER_LEAD_MS + j * INNER_STAGGER_MS,
              easing: EASE_OUT,
              fill: "backwards",
            },
          )
          .finished.catch(() => {}),
      );
    });
  });

  return Promise.all(anims);
}

function animateOut(els) {
  const dir = DIRECTIONS[DIRECTION];
  return els.map((el, i) =>
    el.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 1, offset: 0.7 },
        { opacity: 0, transform: dir.to },
      ],
      {
        duration: OUT_MS,
        delay: i * 60,
        easing: EASE_IN,
        fill: "forwards", // hawak ang hidden state hanggang ma-render ang bago
      },
    ),
  );
}

// ======================
// Render current page
// (walang animation; nagbabalik ng elements na i-a-animate in)
// ======================
async function renderCurrentPage() {
  const page = pages[currentPage];
  const scheduleEls = [1, 2, 3, 4].map((n) =>
    document.getElementById(`schedule-${n}`),
  );
  const castersPage = document.getElementById("casters-page");

  if (!page) {
    scheduleEls.forEach((el) => (el.style.display = "none"));
    castersPage.classList.add("hidden");
    castersPage.style.display = "none";
    return [];
  }

  // ============ CASTERS PAGE ============
  if (page.type === "casters") {
    await preloadImage(page.img);

    scheduleEls.forEach((el) => (el.style.display = "none"));
    document.getElementById("casters-page-img").src = page.img;
    castersPage.classList.remove("hidden");
    castersPage.style.display = "flex";
    return [castersPage];
  }

  // ============ MATCHES PAGE ============
  const logoSrc = (l) => (l && l.length > 100 ? l : DEFAULT_LOGO);

  // I-preload lahat ng logos ng page na 'to bago mag-swap
  await Promise.all(
    page.entries.flatMap((e) => [
      preloadImage(logoSrc(e.data.logo1)),
      preloadImage(logoSrc(e.data.logo2)),
    ]),
  );

  castersPage.classList.add("hidden");
  castersPage.style.display = "none";

  const targets = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    const container = scheduleEls[slot - 1];
    const entry = page.entries[slot - 1];

    if (!entry) {
      container.style.display = "none";
      continue;
    }

    const d = entry.data;
    container.style.display = "flex";

    document.getElementById(`time-${slot}`).textContent = d.time || "";
    document.getElementById(`team1-${slot}`).textContent = d.team1 || "";
    document.getElementById(`team2-${slot}`).textContent = d.team2 || "";
    document.getElementById(`score1-${slot}`).textContent = d.score1 || "0";
    document.getElementById(`score2-${slot}`).textContent = d.score2 || "0";
    document.getElementById(`logo1-${slot}`).src = logoSrc(d.logo1);
    document.getElementById(`logo2-${slot}`).src = logoSrc(d.logo2);

    targets.push(container);
  }
  return targets;
}

// ======================
// Animated Page Change
// ======================
async function changePageAnimated() {
  if (isTransitioning || pages.length < 2) return;
  isTransitioning = true;
  const token = renderToken;

  try {
    const outs = animateOut(getVisibleCards());
    await Promise.all(outs.map((a) => a.finished.catch(() => {})));
    if (token !== renderToken) return; // may bagong updateDisplay, abort

    currentPage = (currentPage + 1) % pages.length;
    const targets = await renderCurrentPage();
    if (token !== renderToken) return;

    // Sabay sa iisang frame: cancel out-animations + start in-animations (walang flash)
    outs.forEach((a) => a.cancel());
    await animateIn(targets);
  } finally {
    if (token === renderToken) isTransitioning = false;
  }
}

// ======================
// Slideshow Timer
// ======================
function setupSlideTimer() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
  if (pages.length > 1) {
    slideTimer = setInterval(() => {
      changePageAnimated();
    }, SLIDE_INTERVAL_MS);
  }
}

// ======================
// Update Display (called by crossclient.js)
// ======================
async function updateDisplay() {
  const token = ++renderToken;

  allScheduleData = readSchedulesFromStorage();
  buildPages(allScheduleData);
  currentPage = 0; // Reset sa first page

  // Cancel lahat ng tumatakbong animation, pati inner elements
  getCards().forEach((el) =>
    el.getAnimations({ subtree: true }).forEach((a) => a.cancel()),
  );

  const targets = await renderCurrentPage();
  if (token !== renderToken) return;

  isTransitioning = false;
  animateIn(targets);
  setupSlideTimer();
}

// ======================
// Expose globally para magamit ng crossclient.js
// ======================
window.updateDisplay = updateDisplay;

// ======================
// Listen sa storage events (para sa real-time updates)
// ======================
window.addEventListener("storage", (e) => {
  // Kung schedule-related ang key, i-update ang display
  if (e.key === null || (e.key && e.key.startsWith("schedule-"))) {
    console.log("📥 Storage event:", e.key, "→ updating display");
    updateDisplay();
  }
});

// ======================
// Initial Load
// ======================
window.addEventListener("DOMContentLoaded", () => {
  updateDisplay();
});
