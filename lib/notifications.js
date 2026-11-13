"use strict";
const { randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const model = require("../public/script/notification-model");
const roster = require("../public/script/roster-model");
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function createCue(body, match) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail(400, "Invalid notification");
  const cue = {
    type: "notification_trigger",
    id: randomUUID(),
    timestamp: Date.now(),
  };
  if (body.eventId === undefined) {
    if (
      typeof body.videoId !== "string" ||
      !Object.hasOwn(model.videos, body.videoId)
    )
      fail(400, "Unknown general notification");
    return { ...cue, scope: "general", videoId: body.videoId };
  }
  const event = model.event(body.eventId);
  if (
    !event ||
    !["blue", "red"].includes(body.teamSide) ||
    !Number.isInteger(body.playerIndex) ||
    body.playerIndex < 0 ||
    body.playerIndex > 4
  )
    fail(400, "Select a valid event, team and player");
  if (
    !body.expected ||
    typeof body.expected !== "object" ||
    Array.isArray(body.expected) ||
    typeof body.expected.playerName !== "string" ||
    typeof body.expected.teamName !== "string" ||
    !Object.hasOwn(body.expected, "gameNumber") ||
    !body.expected.matchInfo ||
    typeof body.expected.matchInfo !== "object" ||
    Array.isArray(body.expected.matchInfo)
  )
    fail(400, "Player context is required");
  const identity = model.identity(match, body.teamSide, body.playerIndex);
  if (!identity || !identity.playerName.trim() || !identity.teamName.trim())
    fail(409, "The selected player or team is unavailable");
  if (!isDeepStrictEqual(body.expected, identity))
    fail(
      409,
      "Player or match changed. Wait for the latest lineup and try again.",
    );
  const team =
    match.teamdata[body.teamSide === "blue" ? "blueteam" : "redteam"];
  const portrait = roster.pairs({
    teamdata: { blueteam: { playerlist: [team.playerlist[body.playerIndex]] } },
  })[0]?.blue;
  const playerImages = (portrait?.images || []).filter(
    (src) =>
      ![
        roster.transparent.toLowerCase(),
        "/assets/player/noplayer.png",
      ].includes(src.toLowerCase()),
  );
  const rawRole = String(team.playerlist[body.playerIndex].lane || "")
    .trim()
    .toLowerCase();
  const playerRole = [
    "gold",
    "jungle",
    "junggle",
    "mid",
    "exp",
    "roam",
  ].includes(rawRole)
    ? rawRole === "junggle"
      ? "jungle"
      : rawRole
    : "";
  return {
    ...cue,
    scope: "player",
    eventId: event.id,
    eventLabel: event.label,
    videoId: null,
    playerImages,
    playerRole,
    teamLogo: roster.safeImage(team.logo),
    teamSide: body.teamSide,
    playerIndex: body.playerIndex,
    teamName: identity.teamName,
    playerName: identity.playerName,
  };
}
function installNotificationRoutes(
  app,
  { getMatch, broadcast, record = () => {} },
) {
  app.post("/api/notification", (req, res) => {
    try {
      const cue = createCue(req.body, getMatch());
      broadcast(cue);
      // Notifications are live cues. This legacy file is diagnostic, never replayed on reconnect.
      try {
        Promise.resolve(record({ ...cue, currentVideo: cue.videoId })).catch(
          (error) => console.error("Notification log failed:", error.message),
        );
      } catch (error) {
        console.error("Notification log failed:", error.message);
      }
      res.json({ message: "Notification triggered", notification: cue });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.status
          ? error.message
          : "Unable to trigger notification",
      });
    }
  });
}
module.exports = { createCue, installNotificationRoutes };
