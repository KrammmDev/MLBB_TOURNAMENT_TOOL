/* Sparse semantic overrides: an empty palette preserves the original stylesheet exactly. */
(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.BroadcastColorModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const themes = ["classic", "arena", "studio"],
    outputs = [
      "roster",
      "draft",
      "scoreboard",
      "postdraft",
      "schedule",
      "matchwinner",
      "postgame",
      "casters",
    ];
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
  defaults.scoreboard = Object.fromEntries(
    themes.map((id) => [id, { ...defaults.draft[id] }]),
  );
  defaults.scoreboard.studio = {
    background: "#101820",
    left: "#16c6d3",
    right: "#f23b58",
    text: "#f7f3e9",
    muted: "#b4bec7",
    border: "#b9a879",
  };
  defaults.scoreboard.classic = {
    background: "#242424",
    left: "#f08b2b",
    right: "#e4b640",
    text: "#faf7ed",
    muted: "#e3c06a",
    border: "#e2ac39",
  };
  defaults.postdraft = Object.fromEntries(
    themes.map((id) => [id, { ...defaults.draft[id] }]),
  );
  defaults.schedule = {
    classic: {
      background: "#f4f1fc",
      left: "#5838e8",
      right: "#e9213a",
      text: "#211a4b",
      muted: "#72638f",
      border: "#f2ce45",
    },
    arena: {
      background: "#f2f4fa",
      left: "#164af4",
      right: "#e9213a",
      text: "#101a38",
      muted: "#52637a",
      border: "#4874ff",
    },
    studio: {
      background: "#f6f6f3",
      left: "#0a3fd6",
      right: "#e8192c",
      text: "#0a0a0a",
      muted: "#52637a",
      border: "#e9ba30",
    },
  };
  defaults.matchwinner = Object.fromEntries(
    themes.map((id) => [
      id,
      {
        background: "#080e1b",
        left: "#d8be83",
        right: "#203550",
        text: "#edf1f6",
        muted: "#92a3bd",
        border: "#899bb4",
      },
    ]),
  );
  defaults.postgame = Object.fromEntries(
    themes.map((id) => [id, { ...defaults.matchwinner[id] }]),
  );
  defaults.casters = {
    classic: {
      background: "#080c12",
      left: "#c8ff42",
      right: "#39c6ff",
      text: "#f6f8fc",
      muted: "#92a0b5",
      border: "#28384a",
    },
    arena: {
      background: "#061a52",
      left: "#16c8ef",
      right: "#2361ff",
      text: "#ffffff",
      muted: "#9dd9f2",
      border: "#2388ff",
    },
    studio: {
      background: "#39247b",
      left: "#43308d",
      right: "#d8b740",
      text: "#ffffff",
      muted: "#ddd8ee",
      border: "#f4df87",
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
  function readable(text, background) {
    const luminance = (hex) => {
      const rgb = [1, 3, 5].map((i) => {
        const value = parseInt(hex.slice(i, i + 2), 16) / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const bg = luminance(background),
      fg = luminance(text);
    if ((Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 3) return text;
    return bg > 0.179 ? "#18212b" : "#f2f7fc";
  }
  function style(id, output, colors, classicImage = "") {
    if (!validScope(id, output) || !validColors(colors))
      throw Error("Invalid broadcast colors");
    const palette = {
      ...defaults[output][id],
      ...colors,
    };
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
    if (output === "casters") {
      for (const field of Object.keys(fields))
        vars("--cc-" + field, palette[field]);
      vars("--cc-accent-text", readable("#ffffff", palette.left));
      return scope + "{" + variables.join(";") + "}";
    }
    if (output === "matchwinner" || output === "postgame") {
      for (const field of Object.keys(fields))
        vars("--mw-" + field, palette[field]);
      vars("--mw-left-dark", shade(palette.left, 0.72));
      vars("--mw-right-dark", shade(palette.right, 0.45));
      vars("--mw-accent-text", readable("#0a1120", palette.left));
      return scope + "{" + variables.join(";") + "}";
    }
    if (output === "schedule") {
      for (const [field, token] of Object.entries({
        background: "panel",
        left: "left",
        right: "right",
        border: "border",
      }))
        if (colors[field]) vars("--sc-" + token, colors[field]);
      vars("--sc-text", readable(palette.text, palette.background));
      vars("--sc-card-text", readable(palette.text, "#101820"));
      vars("--sc-card-muted", readable(palette.muted, "#101820"));
      vars("--sc-accent-text", readable(palette.text, palette.left));
      vars("--sc-left-text", readable("#ffffff", palette.left));
      vars("--sc-right-text", readable("#ffffff", palette.right));
      vars("--sc-muted", readable(palette.muted, palette.background));
      return scope + "{" + variables.join(";") + "}";
    }
    if (output === "postdraft") {
      for (const [field, token] of Object.entries({
        background: "panel",
        left: "left",
        right: "right",
        border: "edge",
      }))
        if (colors[field]) vars("--pd-" + token, colors[field]);
      vars("--pd-text", readable(palette.text, palette.background));
      vars("--pd-muted", readable(palette.muted, palette.background));
      vars("--pd-left-text", readable(colors.text || "#ffffff", palette.left));
      vars(
        "--pd-right-text",
        readable(colors.text || "#ffffff", palette.right),
      );
      return scope + "{" + variables.join(";") + "}";
    }
    if (output === "scoreboard") {
      // Scoreboard owns a separate palette and never receives draft geometry rules.
      vars("--sb-trim-text", readable(palette.text, palette.border));
      const mappings = {
        background: "--header-bg,--center-bg",
        left: "--blue-accent",
        right: "--red-accent",
        border: "--edge",
      };
      for (const [field, names] of Object.entries(mappings))
        if (colors[field]) vars(names, colors[field]);
      vars("--sb-readable", readable(palette.text, palette.background));
      vars("--sb-muted-readable", readable(palette.muted, palette.background));
      vars("--sb-info-text", readable(colors.text || "#ffffff", palette.right));
      vars("--sb-left-text", readable(colors.text || "#ffffff", palette.left));
      vars(
        "--sb-right-text",
        readable(colors.text || "#ffffff", palette.right),
      );
      return scope + "{" + variables.join(";") + "}";
    }
    if (output === "draft") {
      if (colors.background) {
        vars("--header-bg,--center-bg,--match-bg", colors.background);
        if (id === "classic") vars("--sponsor-bg", colors.background);
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
          if (id === "classic") {
            const rgb = [1, 3, 5]
              .map((i) => parseInt(colors[field].slice(i, i + 2), 16))
              .join(", ");
            vars(`--classic-${field}-rgb`, rgb);
            vars(`--classic-${field}-edge`, colors[field]);
            vars(`--classic-${field}-light`, colors[field]);
            vars(
              `--classic-${field}-stat-gradient`,
              `linear-gradient(90deg,${colors[field]},${shade(colors[field], 0.7)},${colors[field]})`,
            );
          }
          if (id !== "arena")
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
      // Classic has light central/header surfaces and separate colored name rails.
      // Keep labels readable even when a saved palette used white text everywhere.
      if (id === "classic" && Object.keys(colors).length) {
        rule(
          "#timer,#match-display,.teamnameholder1,.teamnameholder2",
          `color:${readable(palette.text, palette.background)}`,
        );
        rule(
          ".coach-name",
          `color:${readable(palette.text, colors.background || palette.left)}`,
        );
        rule(
          ".coach-label",
          `color:${readable(palette.muted, colors.background || palette.left)}`,
        );
        rule(
          ".phasebox h2",
          `color:${readable(palette.muted, palette.background)}`,
        );
        for (const [side, field, position] of [
          ["blue", "left", "first"],
          ["red", "right", "last"],
        ]) {
          const accent = palette[field];
          rule(
            `.hero-name.${side}`,
            `color:${readable(palette.muted, accent)}`,
          );
          rule(
            `.lowerside:${position}-child .playername`,
            `color:${readable(palette.text, colors[field] || colors.background || accent)}`,
          );
          rule(
            `.upperside:${position}-child .coach-name`,
            `color:${readable(palette.text, colors.background || accent)}`,
          );
          rule(
            `.upperside:${position}-child .coach-label`,
            `color:${readable(palette.muted, colors.background || accent)}`,
          );
        }
      }
      if (Object.keys(colors).length) {
        vars("--sb-readable", readable(palette.text, palette.background));
        vars(
          "--sb-info-text",
          readable(colors.text || "#ffffff", palette.right),
        );
        rule(
          ".matchinfo-content,.matchinfo-content #match-display,#matchinfo-day",
          `color:${readable(colors.text || "#ffffff", palette.right)}`,
        );
        vars(
          "--sb-muted-readable",
          readable(palette.muted, palette.background),
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
          rule(`.player-card.${side}`, `border-top-color:${colors[field]}`);
          if (id === "arena")
            rule(
              side === "blue"
                ? ".player-slideshow::before"
                : ".player-slideshow::after",
              `background:linear-gradient(90deg,${shade(colors[field], 0.35)},${shade(colors[field], 0.65)})`,
            );
        }
      // Roster identity and series scores belong to Primary text, not side accents.
      rule(
        ".team-col:first-child .team-code,.team-col:last-child .team-code,#blue-score,#red-score",
        `color:${palette.text}`,
      );
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
