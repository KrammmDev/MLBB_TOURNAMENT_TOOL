/* Shared staged CSS activation. Legacy roster events/API remain compatibility aliases. */
(function (root) {
  "use strict";
  const catalog = root.RosterThemes;
  let generation = 0;
  async function apply(id, output = "roster") {
    const theme = catalog.themes.find((theme) => theme.id === id);
    if (!theme || !theme.outputs.includes(output))
      throw Error("Unknown broadcast theme/output");
    const attempt = ++generation,
      key = output + "Theme",
      ready = output + "Ready",
      errorKey = output + "Error";
    if (
      document.body.dataset[key] === id &&
      document.body.dataset[ready] === "true"
    )
      return theme;
    const old = [
        ...document.querySelectorAll('link[data-roster-style="active"]'),
      ],
      staged = [],
      timers = [];
    function notify(kind, message) {
      const detail = {
        id,
        output,
        format: document.body.dataset.draftFormat || null,
        ...(message ? { message } : {}),
      };
      document.dispatchEvent(
        new CustomEvent("broadcast-theme-" + kind, { detail }),
      );
      if (root.parent !== root)
        root.parent.postMessage(
          { type: "broadcast-theme-" + kind, ...detail },
          location.origin,
        );
      if (output === "roster") {
        document.dispatchEvent(
          new CustomEvent("roster-theme-" + kind, { detail }),
        );
        if (root.parent !== root)
          root.parent.postMessage(
            { type: "roster-theme-" + kind, ...detail },
            location.origin,
          );
      }
    }
    try {
      const styles =
        output === "draft"
          ? theme.draftStyles
          : output === "scoreboard"
            ? theme.scoreboardStyles
            : theme.styles;
      await Promise.all(
        styles.map(
          (href) =>
            new Promise((resolve, reject) => {
              const link = document.createElement("link"),
                timer = setTimeout(
                  () => reject(Error("Theme stylesheet timed out")),
                  8000,
                );
              timers.push(timer);
              link.rel = "stylesheet";
              link.href = href;
              link.media = "not all";
              link.dataset.rosterStyle = "pending";
              link.onload = () => {
                clearTimeout(timer);
                resolve();
              };
              link.onerror = () => {
                clearTimeout(timer);
                // Existing outer stylesheets remain usable when optional web-font imports fail.
                if (
                  ((output === "roster" &&
                    id === "classic" &&
                    href === "/overlay-display.css") ||
                    (output === "draft" && href === "/display2.css")) &&
                  link.sheet
                )
                  resolve();
                else reject(Error("Theme stylesheet could not load"));
              };
              staged.push(link);
              document.head.append(link);
            }),
        ),
      );
      if (attempt !== generation) {
        staged.forEach((link) => link.remove());
        return null;
      }
      staged.forEach((link) => {
        link.media = "all";
        link.dataset.rosterStyle = "active";
      });
      old.forEach((link) => link.remove());
      document.body.dataset[key] = id;
      document.body.dataset[ready] = "false";
      await root.BroadcastColorClient?.activate(id, output);
      if (attempt !== generation) return null;
      document.body.dataset[ready] = "true";
      delete document.body.dataset[errorKey];
      const separator = document.querySelector(".vs-text");
      if (separator) separator.textContent = theme.separator;
      notify("ready");
      return theme;
    } catch (error) {
      staged.forEach((link) => link.remove());
      if (attempt === generation) {
        document.body.dataset[errorKey] = error.message;
        notify("error", error.message);
      }
      throw error;
    } finally {
      timers.forEach(clearTimeout);
    }
  }
  const cancel = () => {
    generation++;
  };
  root.BroadcastThemeClient = { apply, cancel };
  root.RosterThemeClient = { apply: (id) => apply(id, "roster"), cancel };
})(window);
