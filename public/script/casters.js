(function (root) {
  "use strict";
  const $ = (id) => document.getElementById(id),
    stage = $("casterStage"),
    frame = $("casterFrame"),
    names = $("casterNames"),
    pinned = new URLSearchParams(location.search).get("theme");
  const previewMode =
    root.parent !== root &&
    root.RosterThemes.themes.some((t) => t.id === pinned);
  let stopped = false,
    version = 0,
    pending = false,
    themeVersion = 0,
    themePending = false;
  function fit() {
    stage.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
  }
  const motionDuration = 650,
    motions = new Map();
  let previousAir = null,
    previousVisible = false;
  const feeds = [
    { timer: null, source: "" },
    { timer: null, source: "" },
  ];
  function feed(index, url, enabled) {
    const slot = $("casterWindow" + (index + 1)),
      state = feeds[index];
    const src = root.CasterVDO.embedURL(url);
    if (!enabled || !src || previewMode) {
      const remove = () => {
        slot.querySelector("iframe")?.remove();
        state.source = "";
        state.timer = null;
      };
      if (
        previewMode ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        clearTimeout(state.timer);
        remove();
      } else if (state.timer === null)
        state.timer = setTimeout(remove, motionDuration);
      return;
    }
    clearTimeout(state.timer);
    state.timer = null;
    if (state.source === src && slot.querySelector("iframe")) return;
    slot.querySelector("iframe")?.remove();
    const iframe = document.createElement("iframe");
    iframe.title = "Caster " + (index + 1) + " VDO.Ninja feed";
    iframe.allow = "autoplay; fullscreen";
    iframe.referrerPolicy = "no-referrer";
    iframe.src = src;
    slot.append(iframe);
    state.source = src;
  }
  function apply(data) {
    if (
      stopped ||
      typeof data?.visible !== "boolean" ||
      typeof data.namesVisible !== "boolean" ||
      !Array.isArray(data.casters) ||
      data.casters.length !== 2
    )
      return;
    if (previewMode)
      data = {
        ...data,
        visible: true,
        namesVisible: true,
        casters: data.casters.map((c, i) => ({
          ...c,
          name: c.name || "CASTER " + (i + 1),
        })),
      };
    const activeAir = data.casters.map((c) => c.onAir !== false);
    const animateScene =
      previousAir !== null &&
      (previousVisible || data.visible) &&
      activeAir.some((active, i) => active !== previousAir[i]);
    const elements = [...document.querySelectorAll(".cc-camera,.cc-nameplate")];
    const before = animateScene
      ? new Map(elements.map((el) => [el, el.getBoundingClientRect()]))
      : null;
    if (animateScene)
      for (const animation of motions.values()) animation.cancel();
    stage.dataset.activeCount = String(
      data.casters.filter((c) => c.onAir !== false).length,
    );
    data.casters.forEach((c, i) => {
      const active = c.onAir !== false;
      $("casterWindow" + (i + 1)).classList.toggle("is-off-air", !active);
      $("casterWindow" + (i + 1)).classList.toggle("is-on-air", active);
      $("casterWindow" + (i + 1)).setAttribute("aria-hidden", String(!active));
      document
        .querySelector(i === 0 ? ".cc-one" : ".cc-two")
        .classList.toggle("is-off-air", !active);
      document
        .querySelector(i === 0 ? ".cc-one" : ".cc-two")
        .classList.toggle("is-on-air", active);
      feed(i, c.vdoUrl, data.visible && active);
      for (const [field, id] of [
        ["name", "Name"],
        ["handle", "Handle"],
        ["role", "Role"],
      ])
        $("caster" + id + (i + 1)).textContent =
          typeof c[field] === "string" ? c[field] : "";
    });
    if (
      animateScene &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      for (const el of elements) {
        const index =
          el.classList.contains("cc-camera-two") ||
          el.classList.contains("cc-two")
            ? 1
            : 0;
        const was = previousAir[index],
          active = activeAir[index];
        if (!was && !active) continue;
        const old = before.get(el),
          now = el.getBoundingClientRect(),
          dx = old.x - now.x,
          dy = old.y - now.y,
          sx = old.width / now.width,
          sy = old.height / now.height;
        const origin = `translate(${dx}px,${dy}px) scale(${sx},${sy})`,
          direction = index === 0 ? -1 : 1;
        const frames = !active
          ? [
              { transform: origin, opacity: 1, visibility: "visible" },
              {
                transform: `translate(${dx + direction * 80}px,${dy}px) scale(${sx},${sy})`,
                opacity: 0,
                visibility: "visible",
              },
            ]
          : !was
            ? [
                {
                  transform: `translate(${direction * 80}px,0) scale(.98)`,
                  opacity: 0,
                  visibility: "visible",
                },
                { transform: "none", opacity: 1, visibility: "visible" },
              ]
            : [
                { transform: origin, opacity: 1 },
                { transform: "none", opacity: 1 },
              ];
        const animation = el.animate(frames, {
          duration: motionDuration,
          easing: "cubic-bezier(.22,1,.36,1)",
        });
        motions.set(el, animation);
        animation.onfinish = () => {
          if (motions.get(el) === animation) motions.delete(el);
        };
      }
    }
    previousAir = activeAir;
    previousVisible = data.visible;
    frame.classList.toggle("is-visible", data.visible);
    frame.setAttribute("aria-hidden", String(!data.visible));
    names.classList.toggle("is-visible", data.namesVisible);
    names.setAttribute("aria-hidden", String(!data.namesVisible));
    stage.dataset.ready = "true";
  }
  async function read() {
    if (stopped || pending) return;
    pending = true;
    const started = version;
    try {
      const r = await fetch("/api/caster-panel", { cache: "no-store" });
      if (r.ok) {
        const value = await r.json();
        if (started === version) apply(value.data);
      }
    } catch {
    } finally {
      pending = false;
    }
  }
  async function theme() {
    if (stopped || themePending) return;
    themePending = true;
    const started = themeVersion;
    try {
      let id = pinned;
      if (!root.RosterThemes.themes.some((t) => t.id === id)) {
        const r = await fetch("/api/broadcast-theme", { cache: "no-store" });
        if (!r.ok) throw Error("Theme unavailable");
        const value = await r.json();
        id = root.RosterThemes.selection(value.data, "casters").themeId;
      }
      if (!stopped && started === themeVersion)
        await root.BroadcastThemeClient.apply(id, "casters");
    } catch {
    } finally {
      themePending = false;
    }
  }
  const unsubscribe = root.MatchDataClient.subscribe(
    () => {},
    () => {},
    {
      onMessage(m) {
        root.BroadcastColorClient.accept(m);
        if (m.type === "caster_panel_update") {
          version++;
          apply(m.data);
        }
        if (m.type === "roster_theme_update" && !pinned) {
          themeVersion++;
          theme();
        }
        if (m.type === "clear" || m.type === "init" || m.type === "update") {
          const title = m.data?.["tournament-title"];
          if (m.type !== "update" || title !== undefined)
            $("casterTournament").textContent =
              typeof title === "string" && title.trim()
                ? title
                : "15TH LCUAA ESPORTS MLBB";
        }
      },
    },
  );
  fit();
  theme();
  read();
  const poll = setInterval(() => {
    read();
    if (!pinned) theme();
  }, 5000);
  addEventListener("resize", fit);
  addEventListener("pagehide", () => {
    stopped = true;
    for (const animation of motions.values()) animation.cancel();
    feeds.forEach((f, i) => {
      clearTimeout(f.timer);
      $("casterWindow" + (i + 1))
        .querySelector("iframe")
        ?.remove();
    });
    version++;
    themeVersion++;
    clearInterval(poll);
    unsubscribe();
    root.BroadcastThemeClient.cancel();
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });
})(window);
