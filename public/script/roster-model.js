(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.RosterModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const transparent = "/Assets/Other/transparent.png";
  function safeImage(value) {
    if (typeof value !== "string") return "";
    const s = value.trim().replace(/\\/g, "/");
    if (
      /^(https?:\/\/|blob:)/i.test(s) ||
      /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s)
    )
      return s;
    if (/^\/?Assets\//i.test(s) && !s.split("/").includes(".."))
      return s.startsWith("/") ? s : "/" + s;
    return "";
  }
  function pairs(data) {
    const clean = (player, side) => {
      if (!player) return null;
      const name = String(
        player.name || player.ign || player.nickname || "",
      ).trim();
      if (!name) return null;
      const raw =
        player.image ||
        player.photo ||
        player.img ||
        player.picture ||
        player.playerImage ||
        "";
      let image = safeImage(raw);
      if (
        !image &&
        typeof raw === "string" &&
        raw.trim() &&
        !/[:/\\]/.test(raw.replace(/^\/?player\//i, ""))
      ) {
        let filename = raw.trim().replace(/^\/?player\//i, "");
        if (!/\.(png|jpe?g|gif|webp)$/i.test(filename)) filename += ".png";
        image = "/Assets/player/" + encodeURIComponent(filename);
      }
      const images = [
        ...new Set(
          [
            image,
            "/Assets/player/" + encodeURIComponent(name) + ".png",
            "/Assets/player/noplayer.png",
            transparent,
          ].filter(Boolean),
        ),
      ];
      return { name, lane: player.lane || "none", side, images };
    };
    const blue = data.teamdata?.blueteam?.playerlist || [],
      red = data.teamdata?.redteam?.playerlist || [];
    return Array.from(
      { length: Math.max(blue.length, red.length) },
      (_, i) => ({ blue: clean(blue[i], "blue"), red: clean(red[i], "red") }),
    ).filter((pair) => pair.blue || pair.red);
  }
  return { transparent, safeImage, pairs, key: (pair) => JSON.stringify(pair) };
});
