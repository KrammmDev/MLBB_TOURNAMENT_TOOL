// script/herodata.js
let heroList = [];

// Load hero data from JSON
async function loadHeroData() {
  try {
    const response = await fetch("/herolist.json");
    heroList = await response.json();
    console.log("Hero data loaded:", heroList.length, "heroes");
    return heroList;
  } catch (error) {
    console.error("Failed to load hero data:", error);
    return [];
  }
}

// Get hero info by name (case insensitive)
function getHeroInfo(heroName) {
  if (!heroName) return null;
  const normalized = heroName.toLowerCase().trim();
  return heroList.find(
    (hero) =>
      hero.name.toLowerCase() === normalized ||
      hero.name.toLowerCase().replace(/[^a-z]/g, "") ===
        normalized.replace(/[^a-z]/g, ""),
  );
}

// Get hero display name
function getHeroDisplayName(heroName) {
  const hero = getHeroInfo(heroName);
  return hero ? hero.name : heroName;
}

// Get hero image path
function getHeroImage(heroName) {
  const hero = getHeroInfo(heroName);
  return hero ? hero.img : "";
}

// Get hero voice path
function getHeroVoice(heroName) {
  const hero = getHeroInfo(heroName);
  return hero ? hero.voice : "";
}
