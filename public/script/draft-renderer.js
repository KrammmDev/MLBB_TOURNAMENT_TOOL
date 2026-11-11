/* Shared, display-only draft renderer. It never advances phases or writes competition state. */
(function (root) {
  "use strict";
  let mounted = false;
  function start(options = {}) {
    if (mounted) return;
    mounted = true;
    const model = root.DraftModel,
      images = root.RosterModel,
      params = new URLSearchParams(location.search);
    const format =
        (options.format || params.get("format")) === "six" ? "six" : "normal",
      config = model.formats[format];
    const legacy = Boolean(options.legacy),
      pinned = options.themeId || params.get("theme");
    const audioEnabled =
      params.get("audio") === "1" || (legacy && params.get("audio") !== "0");
    document.body.dataset.draftFormat = format;
    let draft = null,
      match = null,
      heroes = [],
      hasSnapshot = false,
      freshConnection = true,
      stopped = false;
    let stopMatch = null,
      poll = null,
      run = 0,
      refreshing = false,
      fullVersion = 0,
      tickVersion = 0,
      lastTick = null,
      themeVersion = 0;
    let heroesLoading = false;
    let audio = null,
      phaseDuration = config.defaultTimer,
      lastPhase = -1;
    const node = (id) => document.getElementById(id);
    function text(id, value) {
      const el = node(id);
      if (el && el.textContent !== String(value ?? ""))
        el.textContent = value ?? "";
    }
    function element(tag, className, id) {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (id) el.id = id;
      return el;
    }
    function build() {
      const stage = node("draft-stage"),
        strip = element("div", "draft-strip");
      for (const side of ["blue", "red"]) {
        const team = element("section", "draft-team " + side + "-side");
        team.setAttribute("aria-label", side + " draft");
        const header = element("div", "draft-header");
        const logo = element(
          "img",
          "draft-logo",
          side === "blue" ? "displayImage1" : "displayImage2",
        );
        logo.alt = "";
        header.append(
          logo,
          element(
            "div",
            "draft-team-name",
            side === "blue" ? "name-box-1" : "name-box-8",
          ),
          element("div", "score", side + "-score-display"),
        );
        const bans = element("div", "draft-bans"),
          picks = element("div", "draft-picks");
        const indices = side === "blue" ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
        for (const kind of ["ban", "pick"])
          for (const index of indices) {
            if (kind === "ban" && index >= config.banCount) continue;
            const slot =
              (kind === "pick" ? 1 : 11) + (side === "red" ? 5 : 0) + index;
            const host = element(
              "div",
              kind === "ban" ? "banhero" : "heropick",
            );
            const box = element("div", "image-box", "image-box-" + slot),
              image = element("img", "", "image-display-" + slot);
            image.alt = "";
            box.append(image);
            host.append(
              box,
              element(
                "div",
                "box " + (kind === "pick" ? "pick" : "ban0"),
                kind +
                  "-" +
                  (side === "blue" ? "left" : "right") +
                  "-" +
                  (index + 1),
              ),
              element("div", "hero-name " + side, "hero-name-" + slot),
            );
            if (kind === "pick") {
              const lane = element("div", "lanelogo"),
                icon = element(
                  "img",
                  "lane-icon",
                  "player-lane-" + (index + 1) + "-" + side,
                );
              icon.alt = "";
              lane.append(icon);
              const player = element("div", "draft-player");
              player.append(
                element(
                  "span",
                  "",
                  "name-box-" + (side === "blue" ? 3 + index : 10 + index),
                ),
              );
              host.append(lane, player);
            }
            (kind === "ban" ? bans : picks).append(host);
          }
        team.append(header, bans, picks);
        strip.append(team);
      }
      const center = element("section", "draft-center");
      center.append(element("div", "draft-phase", "phase"));
      const clock = element("div", "draft-timer");
      clock.append(
        element("span", "draft-turn left", "turn-arrow-left"),
        element("span", "", "timer"),
        element("span", "draft-turn right", "turn-arrow-right"),
      );
      center.append(clock);
      const track = element("div", "draft-clock-track");
      track.append(element("div", "", "timer-bar"));
      center.append(track, element("div", "", "match-display"));
      strip.insertBefore(center, strip.lastChild);
      stage.append(strip);
    }
    if (!legacy) build();
    function image(el, candidates) {
      if (!el) return;
      const list = [...new Set(candidates.filter(Boolean))],
        key = JSON.stringify(list);
      if (el.dataset.imageKey === key) return;
      el.dataset.imageKey = key;
      el.hidden = !list.length;
      el.style.visibility = "";
      if (!list.length) {
        el.removeAttribute("src");
        el.onerror = null;
        return;
      }
      let next = 0;
      el.onerror = () => {
        if (next < list.length) el.src = list[next++];
        else {
          el.onerror = null;
          el.style.visibility = "hidden";
        }
      };
      el.src = list[next++];
    }
    function dots(id, score, formatValue) {
      const host = node(id);
      if (!host) return;
      const value = Number(formatValue),
        count = [1, 3, 5, 7].includes(value) ? Math.ceil(value / 2) : 2;
      while (host.children.length > count) host.lastElementChild.remove();
      while (host.children.length < count) host.append(element("span", "dot"));
      [...host.children].forEach((dot, index) =>
        dot.classList.toggle("active", index < (Number(score) || 0)),
      );
    }
    function fitText(el) {
      if (!el) return;
      el.style.fontSize = "";
      el.style.whiteSpace = "nowrap";
      el.style.overflow = "hidden";
      const holder = el.closest(".teamnameholder1,.teamnameholder2,.coachbox");
      if (!holder?.clientWidth) return;
      const size = parseFloat(getComputedStyle(el).fontSize) || 24;
      if (el.scrollWidth > holder.clientWidth)
        el.style.fontSize =
          Math.max(10, (size * holder.clientWidth) / el.scrollWidth) + "px";
    }
    function renderMatch(data) {
      match = data;
      for (const [side, key, start] of [
        ["blue", "blueteam", 3],
        ["red", "redteam", 10],
      ]) {
        const team = data.teamdata?.[key] || {},
          teamId = side === "blue" ? 1 : 8;
        text("name-box-" + teamId, team.teamname || team.name || "");
        fitText(node("name-box-" + teamId));
        text("name-box-" + (side === "blue" ? 2 : 9), team.score ?? "");
        image(node("displayImage" + (side === "blue" ? 1 : 2)), [
          images.safeImage(team.logo),
        ]);
        dots(side + "-score-display", team.score, data.matchFormat);
        const coachId = side === "blue" ? "left" : "right";
        text("coach-name-" + coachId, team.coach || "");
        fitText(node("coach-name-" + coachId));
        const coach = node("coach-box-" + coachId);
        if (coach) coach.style.visibility = team.coach ? "" : "hidden";
        for (let i = 0; i < 5; i++) {
          const player = team.playerlist?.[i];
          text("name-box-" + (start + i), player?.name || "");
          const mug = node("name-image-box-" + (start + i));
          if (mug) {
            let img = mug.querySelector("img");
            if (!img) {
              img = element("img");
              img.alt = "";
              mug.append(img);
            }
            image(
              img,
              images.pairs({
                teamdata: {
                  blueteam: { playerlist: [player] },
                  redteam: { playerlist: [] },
                },
              })[0]?.blue?.images || [],
            );
          }
          const lane = node("player-lane-" + (i + 1) + "-" + side),
            value = player?.lane;
          const normalized = value === "jungle" ? "junggle" : value;
          image(
            lane,
            ["gold", "junggle", "mid", "roam", "exp"].includes(normalized)
              ? ["/Assets/lane/" + normalized + ".png"]
              : [],
          );
          if (lane) {
            lane.style.display = lane.hidden ? "none" : "";
            lane.style.opacity = lane.hidden ? "0" : "1";
          }
        }
      }
      const info = data.matchInfo || {};
      const label = [info.match, info.game]
        .filter((value) => typeof value === "string" && value.trim())
        .join(" · ");
      text("match-display", label);
    }
    function voice(src) {
      if (!audioEnabled || !src) return;
      if (!audio) {
        audio = node("hero-voice") || element("audio", "", "hero-voice");
        audio.hidden = true;
        if (!audio.isConnected) document.body.append(audio);
      }
      audio.pause();
      audio.currentTime = 0;
      audio.src = src;
      audio.volume = 1;
      audio.play()?.catch(() => {});
    }
    function clock() {
      if (!draft) return;
      const time = model.timer(draft.timer) ?? config.defaultTimer;
      text("timer", String(time).padStart(2, "0"));
      const clockNode = node("timer")?.closest(".draft-timer,.countdown");
      clockNode?.classList.toggle(
        "warning",
        time <= 5 && draft.timer_running === true,
      );
      const ratio = Math.min(1, time / phaseDuration);
      if (node("timer-bar")) {
        if (legacy) node("timer-bar").style.width = ratio * 100 + "%";
        else node("timer-bar").style.transform = "scaleX(" + ratio + ")";
      }
      for (const fill of document.querySelectorAll(".tb-fill")) {
        fill.style.transition = "transform .2s linear";
        fill.style.transform = "scaleX(" + ratio + ")";
      }
    }
    function renderDraft(data, silent = false) {
      if (!model.valid(data)) return;
      draft = data;
      const phase = model.phase(data, format);
      if (phase.index !== lastPhase) {
        phaseDuration = Math.max(
          config.defaultTimer,
          model.timer(data.timer) || 0,
        );
        lastPhase = phase.index;
      }
      const active = new Set(phase.slots);
      for (const slot of model.slots(data)) {
        const img = node("image-display-" + slot.id),
          box = node("image-box-" + slot.id),
          label = node("hero-name-" + slot.id),
          hero = model.hero(slot.hero, heroes);
        const source =
            images.safeImage(slot.hero) || images.safeImage(hero?.img),
          changed = box && box.dataset.hero !== slot.hero;
        if (box) {
          box.dataset.hero = slot.hero;
          box.classList.toggle("show", Boolean(source));
          const host = box.closest(".heropick,.banhero");
          host?.classList.toggle("has-hero", Boolean(source));
          if (changed && source && img) {
            image(img, [source]);
            img.style.opacity = "1";
            img.classList.remove("hero-reveal");
            void img.offsetWidth;
            img.classList.add("hero-reveal");
          } else if (!source && img) {
            image(img, []);
            img.style.opacity = "0";
          }
          if (
            changed &&
            source &&
            !silent &&
            hasSnapshot &&
            !freshConnection &&
            phase.type !== "ADJUSTMENT"
          )
            voice(images.safeImage(hero?.voice));
        }
        if (label) {
          label.textContent = slot.hero ? hero?.name || "" : "";
          label.classList.toggle("show", Boolean(source));
        }
      }
      for (const box of document.querySelectorAll(".box")) {
        const on = active.has(box.id);
        box.classList.toggle("active-pick", on && phase.type === "PICKING");
        box.classList.toggle("active-ban", on && phase.type === "BANNING");
        const host = box.closest(".heropick,.banhero");
        if (!host) continue;
        const growing =
          on &&
          phase.type === "PICKING" &&
          !host.querySelector(".image-box.show");
        host.classList.toggle("is-growing", growing);
        let label = host.querySelector(":scope > .picking-label");
        if (on) {
          if (!label) {
            label = element("div", "picking-label");
            label.setAttribute("aria-hidden", "true");
            host.append(label);
          }
          label.textContent = phase.type;
        } else label?.remove();
      }
      if (legacy)
        for (const holder of document.querySelectorAll(".pickholder")) {
          const nicks = holder.parentElement.querySelector(".nickholder");
          [...holder.children].forEach((slot, index) =>
            nicks?.children[index]?.classList.toggle(
              "is-growing",
              slot.classList.contains("is-growing"),
            ),
          );
        }
      text("phase", phase.type);
      for (const side of ["left", "right"]) {
        const arrow = node("turn-arrow-" + side),
          on =
            phase.side === "both" ||
            phase.side === (side === "left" ? "blue" : "red");
        arrow?.classList.toggle("on", on && phase.side !== "both");
        arrow?.classList.toggle("both-on", on && phase.side === "both");
        if (!legacy) arrow?.classList.toggle("on", on);
      }
      const arrow = node("arrow");
      if (arrow) {
        const direction =
          phase.side === "both"
            ? "Adjustment"
            : (phase.side === "blue" ? "Left" : "Right") +
              (phase.type === "BANNING" ? "Banning" : "Picking");
        image(arrow, ["/Assets/Other/" + direction + ".gif"]);
      }
      clock();
      hasSnapshot = true;
      freshConnection = false;
    }
    async function readDraft() {
      if (stopped || refreshing) return;
      const currentRun = run,
        version = fullVersion,
        ticks = tickVersion;
      refreshing = true;
      try {
        const response = await fetch("/api/matchdraft", { cache: "no-store" });
        if (!response.ok) throw Error("Draft unavailable");
        const snapshot = await response.json();
        if (
          !stopped &&
          currentRun === run &&
          version === fullVersion &&
          snapshot?.draftdata
        ) {
          const data =
            ticks !== tickVersion && lastTick
              ? { ...snapshot.draftdata, ...lastTick }
              : snapshot.draftdata;
          renderDraft(data, true);
        }
      } catch (error) {
        console.error(error.message);
      } finally {
        if (currentRun === run) refreshing = false;
      }
    }
    async function loadHeroes() {
      if (heroesLoading) return;
      heroesLoading = true;
      try {
        const response = await fetch("/database/herolist.json", {
          cache: "no-store",
        });
        if (response.ok) {
          const result = await response.json();
          if (Array.isArray(result)) {
            heroes = result;
            if (draft) renderDraft(draft, true);
          }
        }
      } catch (error) {
        console.error("Hero metadata unavailable:", error.message);
      } finally {
        heroesLoading = false;
      }
    }
    async function selectTheme(id) {
      try {
        await root.BroadcastThemeClient.apply(id, "draft");
      } catch (error) {
        console.error("Retained previous draft look:", error.message);
      } finally {
        if (!stopped && node("draft-stage"))
          node("draft-stage").style.visibility = "";
      }
    }
    async function readTheme() {
      if (legacy || pinned || stopped) return;
      const version = ++themeVersion;
      try {
        const response = await fetch("/api/broadcast-theme", {
          cache: "no-store",
        });
        if (!response.ok) throw Error("Theme unavailable");
        const snapshot = await response.json();
        if (version === themeVersion && !stopped)
          await selectTheme(snapshot.data.themeId);
      } catch (error) {
        console.error(error.message);
        if (!stopped) node("draft-stage").style.visibility = "";
      }
    }
    function onMessage(message) {
      if (message.type === "draftdata_update") {
        if (message.data) {
          fullVersion++;
          renderDraft(message.data);
        } else readDraft();
      } else if (message.type === "update" && message.data?.draftdata) {
        const tick = message.data.draftdata,
          value = model.timer(tick.timer);
        if (value !== null && typeof tick.timer_running === "boolean") {
          tickVersion++;
          lastTick = {
            timer: String(value),
            timer_running: tick.timer_running,
          };
          if (draft) {
            draft = { ...draft, ...lastTick };
            clock();
          }
        }
      } else if (message.type === "roster_theme_update" && !legacy && !pinned) {
        themeVersion++;
        selectTheme(message.data.themeId);
      }
    }
    function fit() {
      const stage = node("draft-stage");
      if (stage)
        stage.style.transform =
          "scale(" + Math.min(innerWidth / 1920, innerHeight / 1080) + ")";
    }
    function transport() {
      stopped = false;
      run++;
      refreshing = false;
      freshConnection = true;
      stopMatch = root.MatchDataClient.subscribe(
        (snapshot) => renderMatch(snapshot.data),
        (status) => {
          if (status === "connected") {
            freshConnection = true;
            readDraft();
            readTheme();
            if (!heroes.length) loadHeroes();
          }
        },
        { onMessage },
      );
      readDraft();
      loadHeroes();
      if (!legacy) {
        if (pinned) selectTheme(pinned);
        else readTheme();
      }
      poll = setInterval(() => {
        readDraft();
        readTheme();
        if (!heroes.length) loadHeroes();
      }, 5000);
    }
    function stop() {
      stopped = true;
      run++;
      themeVersion++;
      stopMatch?.();
      clearInterval(poll);
      root.BroadcastThemeClient?.cancel();
      audio?.pause();
    }
    root.addEventListener("resize", fit);
    root.addEventListener("pagehide", stop);
    root.addEventListener("pageshow", (event) => {
      if (event.persisted && stopped) transport();
    });
    root.fetchDraftData = readDraft;
    root.updateDisplay = () => {
      if (draft) renderDraft(draft, true);
    };
    root.DraftDisplay.state = () => ({
      format,
      phase: draft ? model.phase(draft, format) : null,
      timer: draft ? model.timer(draft.timer) : null,
      theme: document.body.dataset.draftTheme || "legacy",
    });
    fit();
    transport();
  }
  root.DraftDisplay = { start };
})(window);
