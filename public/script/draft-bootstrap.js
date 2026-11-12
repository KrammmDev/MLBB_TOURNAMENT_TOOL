/* Reuse the operator's original display2 markup; never execute scripts from the template. */
(async function mount() {
  const stage = document.getElementById("draft-stage");
  try {
    const response = await fetch("/display2.html", { cache: "no-store" });
    if (!response.ok) throw Error("Display template unavailable");
    const source = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    const main = source.querySelector(".mainbox");
    const phase = source.querySelector(".phasebox");
    if (!main || !phase) throw Error("Incomplete display template");
    const fragment = document.createDocumentFragment();
    fragment.append(
      document.importNode(main, true),
      document.importNode(phase, true),
    );
    // Six-ban changes slot count only; coaches, lanes, stats and logos stay available.
    const six = new URLSearchParams(location.search).get("format") === "six";
    if (six) {
      for (const id of [14, 15, 19, 20])
        fragment
          .querySelector("#image-box-" + id)
          ?.closest(".banhero")
          .remove();
    }
    fragment.querySelectorAll("script").forEach((script) => script.remove());
    const sponsor = document.createElement("div");
    sponsor.className = "broadcast-sponsors";
    sponsor.setAttribute("aria-label", "Sponsor logos");
    fragment.querySelector(".mainbox").append(sponsor);
    for (const side of ["blue", "red"]) {
      const score = document.createElement("span");
      score.className = "arena-series-score";
      score.dataset.teamScore = side;
      score.setAttribute("aria-label", side + " series score");
      fragment.querySelector(".mainbox").append(score);
    }
    DraftDisplay.start({ template: fragment });
    window.SponsorSlideshow?.start(sponsor);
    const stats = document.createElement("script");
    stats.src = "/script/herostats.js";
    document.body.append(stats);
  } catch (error) {
    console.error(error.message);
    // A temporary read failure must not permanently strand an OBS source.
    if (!stage.children.length) setTimeout(mount, 2000);
  }
})();
