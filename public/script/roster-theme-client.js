/* Stage all styles before swapping; keep the previous look on asset failure. */
(function (root) {
  "use strict";
  const catalog = root.RosterThemes;
  let generation = 0;
  async function apply(id) {
    const theme = catalog.themes.find((theme) => theme.id === id);
    if (!theme) throw Error("Unknown roster theme");
    const attempt = ++generation;
    if (
      document.body.dataset.rosterTheme === id &&
      document.body.dataset.rosterReady === "true"
    )
      return theme;
    const old = [
        ...document.querySelectorAll('link[data-roster-style="active"]'),
      ],
      staged = [],
      timers = [];
    try {
      await Promise.all(
        theme.styles.map(
          (href) =>
            new Promise((resolve, reject) => {
              const link = document.createElement("link");
              const timer = setTimeout(
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
                // Existing Classic CSS imports optional web fonts. A loaded outer sheet can use
                // its declared system fallback even when that font import is unavailable.
                if (
                  id === "classic" &&
                  href === "/overlay-display.css" &&
                  link.sheet
                )
                  resolve();
                else reject(Error("Theme stylesheet could not load"));
              };
              staged.push(link);
              document.head.appendChild(link);
            }),
        ),
      );
      if (attempt !== generation) {
        staged.forEach((link) => link.remove());
        return null;
      }
      // One synchronous style swap: do not remove the old CSS while downloading the replacement.
      staged.forEach((link) => {
        link.media = "all";
        link.dataset.rosterStyle = "active";
      });
      old.forEach((link) => link.remove());
      document.body.dataset.rosterTheme = id;
      document.body.dataset.rosterReady = "true";
      delete document.body.dataset.rosterError;
      document.querySelector(".vs-text").textContent = theme.separator;
      document.dispatchEvent(
        new CustomEvent("roster-theme-ready", { detail: { id } }),
      );
      if (root.parent !== root)
        root.parent.postMessage(
          { type: "roster-theme-ready", id },
          location.origin,
        );
      return theme;
    } catch (error) {
      staged.forEach((link) => link.remove());
      if (attempt === generation) {
        document.body.dataset.rosterError = error.message;
        if (root.parent !== root)
          root.parent.postMessage(
            { type: "roster-theme-error", id, message: error.message },
            location.origin,
          );
        document.dispatchEvent(
          new CustomEvent("roster-theme-error", {
            detail: { id, message: error.message },
          }),
        );
      }
      throw error;
    } finally {
      timers.forEach(clearTimeout);
    }
  }
  root.RosterThemeClient = {
    apply,
    cancel: () => {
      generation++;
    },
  };
})(window);
