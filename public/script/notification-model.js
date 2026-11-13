/* Shared event catalog; IDs 1–12 retain their original general-notification meaning. */
(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.NotificationModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const videos = Object.freeze({
    videoPlayer1: "Assets/notification/turtlespawn.webm",
    videoPlayer2: "Assets/notification/blueturtleslain.webm",
    videoPlayer3: "Assets/notification/redturtleslain.webm",
    videoPlayer4: "Assets/notification/lordspawnn.webm",
    videoPlayer5: "Assets/notification/bluelordslain.webm",
    videoPlayer6: "Assets/notification/redlordslain.webm",
    videoPlayer7: "Assets/notification/firstblood.webm",
    videoPlayer8: "Assets/notification/doublekill.webm",
    videoPlayer9: "Assets/notification/triplekill.webm",
    videoPlayer10: "Assets/notification/maniac.webm",
    videoPlayer11: "Assets/notification/savage.webm",
    videoPlayer12: "Assets/notification/wipeout.webm",
  });
  const events = Object.freeze(
    [
      { id: "first-blood", label: "First Blood" },
      { id: "double-kill", label: "Double Kill" },
      { id: "triple-kill", label: "Triple Kill" },
      { id: "maniac", label: "Maniac" },
      { id: "savage", label: "Savage" },
      {
        id: "turtle-slain",
        label: "Turtle Slain",
      },
      {
        id: "lord-slain",
        label: "Lord Slain",
      },
      { id: "shutdown", label: "Shutdown" },
      { id: "killing-spree", label: "Killing Spree" },
      { id: "wipe-out", label: "Wipe Out" },
    ].map(Object.freeze),
  );
  const event = (id) => events.find((item) => item.id === id);
  function identity(data, side, index) {
    const team =
      data?.teamdata?.[
        side === "blue" ? "blueteam" : side === "red" ? "redteam" : ""
      ];
    const player = team?.playerlist?.[index];
    if (!team || !player) return null;
    return {
      teamName: String(team.teamname || team.name || ""),
      playerName: String(player.name || player.ign || ""),
      gameNumber: data.game_number ?? null,
      matchInfo: data.matchInfo || {},
    };
  }
  return Object.freeze({ events, event, videos, identity });
});
