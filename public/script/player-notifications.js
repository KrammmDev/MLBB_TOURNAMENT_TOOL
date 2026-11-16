/* Read the shared control session; send live cues without writing match state. */
(function (root) {
  "use strict";
  const model = root.NotificationModel;
  const session = root.ControlMatch;
  const host = document.getElementById("player-notif-teams");
  const status = document.getElementById("player-notif-status");
  if (!host || !session) return;
  let lineup,
    renderedKey,
    sending = false;
  function report(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function render(data) {
    lineup = data;
    const identities = ["blue", "red"].map((side) =>
      Array.from({ length: 5 }, (_, index) =>
        model.identity(data, side, index),
      ),
    );
    const teamIdentities = ["blue", "red"].map((side) =>
      model.teamIdentity(data, side),
    );
    const key = JSON.stringify({ identities, teamIdentities });
    if (key === renderedKey) return;
    renderedKey = key;
    host.replaceChildren();
    for (const [s, side] of ["blue", "red"].entries()) {
      const team = document.createElement("section");
      team.className = "player-notif-team";
      team.dataset.side = side;
      const heading = document.createElement("h3");
      heading.textContent =
        identities[s][0]?.teamName ||
        (side === "blue" ? "Blue team" : "Red team");
      const header = document.createElement("div");
      header.className = "team-notif-heading";
      const wipe = document.createElement("button");
      wipe.type = "button";
      wipe.className = "team-notif-event";
      wipe.dataset.teamSide = side;
      const wipeLabel = model.event("wipe-out").label;
      wipe.textContent = wipeLabel;
      wipe.setAttribute(
        "aria-label",
        `${wipeLabel} — ${teamIdentities[s]?.teamName || side}`,
      );
      wipe.disabled = sending || !teamIdentities[s]?.teamName.trim();
      wipe.addEventListener("click", () =>
        send(side, null, "wipe-out", teamIdentities[s]),
      );
      header.append(heading, wipe);
      team.append(header);
      for (let index = 0; index < 5; index++) {
        const identity = identities[s][index];
        const card = document.createElement("article");
        card.className = "player-notif-card";
        card.dataset.side = side;
        card.dataset.playerIndex = index;
        const name = document.createElement("h4");
        const slot = document.createElement("span");
        slot.className = "player-notif-slot";
        slot.textContent = String(index + 1).padStart(2, "0");
        const label = document.createElement("span");
        label.textContent = identity?.playerName || "No player";
        name.append(slot, label);
        const buttons = document.createElement("div");
        buttons.className = "player-notif-events";
        for (const event of model.events) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "player-notif-event";
          button.dataset.eventId = event.id;
          button.textContent = event.label;
          button.disabled =
            sending ||
            !identity?.playerName.trim() ||
            !identity?.teamName.trim();
          button.setAttribute(
            "aria-label",
            `${event.label} — ${identity?.playerName || "No player"} — ${identity?.teamName || side}`,
          );
          button.addEventListener("click", () =>
            send(side, index, event.id, identity),
          );
          buttons.append(button);
        }
        card.append(name, buttons);
        team.append(card);
      }
      host.append(team);
    }
  }
  async function send(teamSide, playerIndex, eventId, expected) {
    if (sending) return;
    const state = session.status();
    if (state.blocked || state.pending || state.timers || state.dirty) {
      report(
        "Save or reload your match edits before sending a notification.",
        true,
      );
      return;
    }
    sending = true;
    host
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    const scope = playerIndex === null ? "team" : "player";
    report(
      `Sending ${model.event(eventId).label} for ${expected.playerName || expected.teamName}…`,
    );
    try {
      const response = await fetch("/api/notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          eventId,
          teamSide,
          playerIndex,
          expected,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Notification was not sent");
      const cue = result.notification;
      report(
        `Sent · ${cue.scope === "team" ? cue.teamName : cue.playerName + " · " + cue.teamName} — ${cue.eventLabel}`,
      );
    } catch (error) {
      report(
        error.message || "Server unavailable. Notification was not sent.",
        true,
      );
    } finally {
      sending = false;
      host.querySelectorAll(".team-notif-event").forEach((button) => {
        button.disabled = !model
          .teamIdentity(lineup, button.dataset.teamSide)
          ?.teamName.trim();
      });
      host.querySelectorAll(".player-notif-card").forEach((card) => {
        const identity = model.identity(
          lineup,
          card.dataset.side,
          Number(card.dataset.playerIndex),
        );
        card.querySelectorAll("button").forEach((button) => {
          button.disabled =
            !identity?.playerName.trim() || !identity?.teamName.trim();
        });
      });
    }
  }
  session.onChange((data) => {
    render(data);
    if (status.textContent.trim() === "Loading players…")
      report(
        "Ready · choose a team or player event to send it to the broadcast overlay.",
      );
  });
})(window);
