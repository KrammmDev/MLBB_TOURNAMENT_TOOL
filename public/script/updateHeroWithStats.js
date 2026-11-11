// Function to update hero display with stats
function updateHeroWithTournamentStats(
  heroName,
  imageId,
  statsContainerId,
  pickRateId,
  banRateId,
  winRateId,
  nameId = null,
) {
  // Get hero image from hero list
  let imageUrl = "";
  if (heroName && heroName !== "-" && heroName.trim() !== "") {
    const hero = heroList.find((h) => h.name === heroName);
    imageUrl = hero ? hero.img : "/Assets/HeroPick/default.png";
  }

  const imageElement = document.getElementById(imageId);
  if (imageElement) {
    imageElement.src = imageUrl || "/Assets/HeroPick/default.png";
  }

  if (nameId) {
    const nameElement = document.getElementById(nameId);
    if (nameElement) {
      nameElement.textContent = heroName || "-";
    }
  }

  // Get stats from tournament
  const stats = tournamentStats.getHeroStats(heroName);
  const container = document.getElementById(statsContainerId);
  const pickEl = document.getElementById(pickRateId);
  const banEl = document.getElementById(banRateId);
  const winEl = document.getElementById(winRateId);

  if (container && pickEl && banEl && winEl) {
    if (heroName && heroName !== "-" && heroName.trim() !== "") {
      pickEl.textContent = stats.pickRate + "%";
      banEl.textContent = stats.banRate + "%";
      winEl.textContent = stats.winRate + "%";
      container.classList.add("visible");

      // Add tooltip with detailed stats
      container.title = `Picks: ${stats.picks} | Bans: ${stats.bans} | Wins: ${stats.wins}`;

      // Color code based on rates
      updateStatColor(pickEl, stats.pickRate, "pick");
      updateStatColor(banEl, stats.banRate, "ban");
      updateStatColor(winEl, stats.winRate, "win");
    } else {
      container.classList.remove("visible");
    }
  }
}

// Color code stats based on values
function updateStatColor(element, value, type) {
  if (!element) return;

  // Remove existing color classes
  element.classList.remove("low", "medium", "high");

  if (type === "pick" || type === "ban") {
    if (value > 20) element.classList.add("high");
    else if (value > 10) element.classList.add("medium");
    else element.classList.add("low");
  } else if (type === "win") {
    if (value > 60) element.classList.add("high");
    else if (value > 45) element.classList.add("medium");
    else element.classList.add("low");
  }
}

// Update display for a specific hero
function updateDisplayForHero(heroName) {
  // Find all elements showing this hero and update their stats
  document.querySelectorAll('[id^="hero-name-"]').forEach((el) => {
    if (el.textContent === heroName) {
      const id = el.id.replace("hero-name-", "");
      const stats = tournamentStats.getHeroStats(heroName);

      const pickEl = document.getElementById(`pick-rate-${id}`);
      const banEl = document.getElementById(`ban-rate-${id}`);
      const winEl = document.getElementById(`win-rate-${id}`);
      const container = document.getElementById(`stats-${id}`);

      if (pickEl) pickEl.textContent = stats.pickRate + "%";
      if (banEl) banEl.textContent = stats.banRate + "%";
      if (winEl) winEl.textContent = stats.winRate + "%";
      if (container) {
        container.title = `Picks: ${stats.picks} | Bans: ${stats.bans} | Wins: ${stats.wins}`;
        updateStatColor(pickEl, stats.pickRate, "pick");
        updateStatColor(banEl, stats.banRate, "ban");
        updateStatColor(winEl, stats.winRate, "win");
      }
    }
  });
}
