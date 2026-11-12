/* Versioned catalog: presets currently cover roster, draft and scoreboard outputs, not an entire broadcast package. */
(function (root, factory) {
  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  else root.RosterThemes = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const shared = "/themes/roster-common.css";
  return Object.freeze({
    schemaVersion: 1,
    rendererVersion: 1,
    output: "roster", // Compatibility field; outputs declares current coverage.
    outputs: ["roster", "draft", "scoreboard"],
    canvas: { width: 1920, height: 1080 },
    themes: [
      {
        id: "classic",
        label: "Classic",
        description: "Existing asymmetric orange roster layout.",
        styles: ["/overlay-display.css", shared],
        separator: "VS",
        exitMs: 600,
      },
      {
        id: "arena",
        label: "Arena",
        description: "Existing three-column grand-final layout.",
        styles: ["/overlay-display-v2.css", shared],
        separator: "–",
        exitMs: 1400,
      },
      {
        id: "studio",
        label: "Studio",
        description:
          "New restrained slate layout with blue and coral team accents.",
        styles: ["/themes/roster-studio.css", shared],
        separator: "VS",
        exitMs: 450,
      },
    ].map((theme) =>
      Object.freeze({
        ...theme,
        outputs: ["roster", "draft", "scoreboard"],
        draftStyles: [
          "/display2.css",
          "/themes/draft-base.css",
          ...(theme.id === "classic" ? [] : ["/themes/draft-compact.css"]),
          "/themes/draft-" + theme.id + ".css",
        ],
        scoreboardStyles: ["/themes/scoreboard-" + theme.id + ".css"],
        requiredAssets: [],
        fontPolicy: "system-fallback",
      }),
    ),
  });
});
