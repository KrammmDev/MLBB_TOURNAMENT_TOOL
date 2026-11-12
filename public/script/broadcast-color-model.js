/* Sparse semantic overrides: an empty palette preserves the original stylesheet exactly. */
(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.BroadcastColorModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const themes = ["classic", "arena", "studio"],
    outputs = ["roster", "draft"];
  const fields = {
    background: "Panel background",
    left: "Left team accent",
    right: "Right team accent",
    text: "Primary text",
    muted: "Secondary text",
    border: "Borders",
  };
  const defaults = {
    draft: {
      classic: {
        background: "#ffffff",
        left: "#ff7200",
        right: "#ff0101",
        text: "#252525",
        muted: "#666666",
        border: "#ffffff",
      },
      arena: {
        background: "#091827",
        left: "#1bc2d5",
        right: "#527fe8",
        text: "#f2f7fc",
        muted: "#73dae9",
        border: "#28435b",
      },
      studio: {
        background: "#f1f4f8",
        left: "#0757ed",
        right: "#e92237",
        text: "#18263a",
        muted: "#52637a",
        border: "#d4dde7",
      },
    },
    roster: {
      classic: {
        background: "#2a0a00",
        left: "#ff7200",
        right: "#ff0101",
        text: "#ffffff",
        muted: "#ffb380",
        border: "#ffb380",
      },
      arena: {
        background: "#0d0000",
        left: "#ff7200",
        right: "#ffb380",
        text: "#ffffff",
        muted: "#ffe0c4",
        border: "#ffb380",
      },
      studio: {
        background: "#111925",
        left: "#5ed7ef",
        right: "#ff8c89",
        text: "#eef3f8",
        muted: "#a5b5c6",
        border: "#435064",
      },
    },
  };
  function validColors(colors) {
    return (
      colors !== null &&
      typeof colors === "object" &&
      !Array.isArray(colors) &&
      Object.entries(colors).every(
        ([key, value]) =>
          Object.hasOwn(fields, key) &&
          typeof value === "string" &&
          /^#[0-9a-f]{6}$/i.test(value),
      )
    );
  }
  const validScope = (id, output) =>
    themes.includes(id) && outputs.includes(output);
  function shade(hex, factor) {
    return (
      "#" +
      [1, 3, 5]
        .map((i) =>
          Math.round(
            Math.max(
              0,
              Math.min(255, parseInt(hex.slice(i, i + 2), 16) * factor),
            ),
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  }
  function style(id, output, colors, classicImage = "") {
    if (!validScope(id, output) || !validColors(colors))
      throw Error("Invalid broadcast colors");
    const palette = { ...defaults[output][id], ...colors };
    const scope = `body[data-${output}-theme="${id}"]`,
      rules = [],
      variables = [];
    const rule = (selectors, value) =>
      rules.push(
        selectors
          .split(",")
          .map((s) => scope + " " + s.trim())
          .join(",") +
          "{" +
          value +
          "}",
      );
    const vars = (names, value) =>
      names.split(",").forEach((name) => variables.push(name + ":" + value));
    if (output === "draft") {
      if (colors.background) {
        vars("--header-bg,--center-bg,--match-bg", colors.background);
        vars("--empty-bg,--ban-bg", shade(colors.background, 0.75));
        rule(
          ".lowermid,.upperside,.uppermid,.upperlowermid .teamlogo-wrap,.lowerside .playername",
          `background:${colors.background}`,
        );
      }
      for (const [field, side] of [
        ["left", "blue"],
        ["right", "red"],
      ])
        if (colors[field]) {
          vars(
            side === "blue"
              ? "--blue-accent,--mid-left"
              : "--red-accent,--mid-right",
            colors[field],
          );
          rule(`.hero-name.${side}`, `background:${colors[field]}`);
          rule(
            `#${side}-score-display .dot.active`,
            `background:${colors[field]}`,
          );
          rule(
            `.turn-arrow.${side === "blue" ? "left" : "right"}.on span,.turn-arrow.${side === "blue" ? "left" : "right"}.both-on span`,
            `background:${colors[field]}`,
          );
          if (id !== "arena")
            rule(
              side === "blue"
                ? ".lowerside:first-child .playername"
                : ".lowerside:last-child .playername",
              `background:${colors[field]}`,
            );
        }
      if (
        id === "classic" &&
        (colors.left || colors.right || colors.background)
      ) {
        rule(
          ".upper,.lower",
          `background:linear-gradient(90deg,${palette.left} 0% 37.7%,${palette.background} 37.7% 62.3%,${palette.right} 62.3% 100%)`,
        );
        rule(
          ".uppermid",
          `background:linear-gradient(90deg,${palette.left},${palette.right})`,
        );
        if (
          classicImage.startsWith('url("data:image/svg+xml') ||
          classicImage.startsWith("url('data:image/svg+xml")
        ) {
          let image = classicImage;
          const swaps = [
            ["ff7200", colors.left],
            ["ff0101", colors.right],
          ];
          if (colors.background)
            for (const original of ["ffffff", "f7f7fa", "e6e6ec", "ececf1"])
              swaps.push([original, colors.background]);
          for (const [before, after] of swaps)
            if (after)
              image = image.replace(
                new RegExp("%23" + before, "ig"),
                "%23" + after.slice(1),
              );
          rule(".lowermid::before", `background-image:${image}`);
        }
      }
      if (colors.text) {
        vars("--header-text,--center-text,--textcolor2", colors.text);
        rule(
          ".teamnameholder1,.teamnameholder2,.coach-name,.playername,#match-display,#timer",
          `color:${colors.text}`,
        );
      }
      if (colors.muted) {
        vars("--phase-text", colors.muted);
        rule(".phasebox h2,.coach-label,.hero-name", `color:${colors.muted}`);
      }
      if (colors.border) {
        vars("--edge,--ban-edge,--pick-edge", colors.border);
        rule(
          ".heropick,.banhero,.lowermid,.upperside",
          `border-color:${colors.border}`,
        );
      }
      if (colors.text) rule(".countdown.warning #timer", "color:#ff899a");
    } else {
      if (colors.background) {
        vars("--studio-ink,--dark,--green-mid", colors.background);
        vars("--green-dark", shade(colors.background, 0.7));
        rule(
          ".scoreboard,.teams-versus,.match-info-bar,.coach-item,.player-name-bar",
          `background:${colors.background}`,
        );
        if (id === "studio")
          rule(
            ".player-card",
            `background:linear-gradient(180deg,${colors.background}44,${colors.background}ee)`,
          );
      }
      for (const [field, side] of [
        ["left", "blue"],
        ["right", "red"],
      ])
        if (colors[field]) {
          if (side === "blue")
            vars("--studio-blue,--green-light,--orange", colors[field]);
          else vars("--studio-red,--teal,--gold", colors[field]);
          vars(
            side === "blue" ? "--blue-side" : "--red-side",
            shade(colors[field], 0.8),
          );
          rule(
            `.player-card.${side} .player-name-box,.player-card.${side} .player-name-bar`,
            `background:linear-gradient(90deg,${colors[field]},${shade(colors[field], 0.75)})`,
          );
          rule(
            `.team-col:${side === "blue" ? "first" : "last"}-child .team-code`,
            `color:${colors[field]}`,
          );
          rule(`.player-card.${side}`, `border-top-color:${colors[field]}`);
          if (id === "arena")
            rule(
              side === "blue"
                ? ".player-slideshow::before"
                : ".player-slideshow::after",
              `background:linear-gradient(90deg,${shade(colors[field], 0.35)},${shade(colors[field], 0.65)})`,
            );
        }
      if (id === "classic" && (colors.left || colors.right))
        rule(
          ".match-info-bar",
          `background:linear-gradient(90deg,${palette.left},${palette.right})`,
        );
      if (colors.text) {
        vars("--studio-paper", colors.text);
        rule(
          ".tournament-title",
          `background:none;-webkit-background-clip:initial;background-clip:initial;color:${colors.text}`,
        );
        rule(
          ".score-num,.team-code,.player-name-text,.coach-name,.badge-block span,.bottom-text",
          `color:${colors.text}`,
        );
      }
      if (colors.muted) {
        vars("--studio-muted,--gold-light,--glow", colors.muted);
        rule(
          ".tournament-subtitle,.mi-stage,.mi-time,.vs-text,.sponsor-label,.coach-label,.countdown-label",
          `color:${colors.muted}`,
        );
      }
      if (colors.border)
        rule(
          ".scoreboard,.player-card,.player-name-bar,.sponsor-block",
          `border-color:${colors.border}`,
        );
    }
    return (
      (variables.length ? scope + "{" + variables.join(";") + "}" : "") +
      rules.join("\n")
    );
  }
  return { themes, outputs, fields, defaults, validColors, validScope, style };
});
