"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { fixture } = require("./fixtures");
const model = require("../public/script/notification-model");
const { installNotificationRoutes } = require("../lib/notifications");
test("notification API preserves general cues and resolves all player events without match writes", async (t) => {
  const match = fixture();
  match.teamdata.blueteam.logo = "Assets/Team/blue.png";
  match.teamdata.redteam.logo = "Assets/Team/red.png";
  match.teamdata.blueteam.playerlist[0].image = "player/portrait.png";
  const original = structuredClone(match),
    cues = [],
    records = [];
  const app = express();
  app.use(express.json());
  installNotificationRoutes(app, {
    getMatch: () => match,
    broadcast: (cue) => cues.push(cue),
    record: (cue) => records.push(cue),
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const send = async (body) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/notification`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return { status: response.status, body: await response.json() };
  };
  for (const videoId of Object.keys(model.videos)) {
    const result = await send({ videoId });
    assert.equal(result.status, 200);
    assert.equal(cues.at(-1).videoId, videoId);
    assert.equal(cues.at(-1).scope, "general");
    assert.equal(records.at(-1).currentVideo, videoId);
  }
  for (const teamSide of ["blue", "red"])
    for (let playerIndex = 0; playerIndex < 5; playerIndex++)
      for (const event of model.events) {
        const expected = model.identity(match, teamSide, playerIndex);
        const result = await send({
          eventId: event.id,
          teamSide,
          playerIndex,
          expected,
          videoId: "videoPlayer11",
          playerImages: ["/Assets/forged.png"],
          teamLogo: "/Assets/forged-logo.png",
          playerName: "Forged name",
          teamName: "Forged team",
        });
        assert.equal(result.status, 200);
        const cue = result.body.notification;
        assert.equal(cue.playerName, expected.playerName);
        assert.equal(cue.teamName, expected.teamName);
        assert.equal(cue.teamSide, teamSide);
        assert.equal(cue.playerIndex, playerIndex);
        assert.equal(cue.eventLabel, event.label);
        assert.equal(cue.videoId, null, "individual cues never select a WebM");
        assert.equal(cue.teamLogo, `/Assets/Team/${teamSide}.png`);
        assert.ok(
          cue.playerImages.includes(
            "/Assets/player/" +
              encodeURIComponent(expected.playerName) +
              ".png",
          ),
        );
        if (teamSide === "blue" && playerIndex === 0)
          assert.ok(cue.playerImages.includes("/Assets/player/portrait.png"));
        assert.ok(
          !cue.playerImages.some(
            (src) =>
              src.endsWith("noplayer.png") || src.endsWith("transparent.png"),
          ),
        );
        assert.deepEqual(cue, cues.at(-1));
      }
  assert.deepEqual(match, original);
  assert.equal(
    new Set(cues.map((cue) => cue.id)).size,
    cues.length,
    "repeated cues have unique identities",
  );
  const count = cues.length;
  for (const body of [
    {},
    { videoId: "__proto__" },
    { eventId: "unknown" },
    { eventId: "savage", teamSide: "blue", playerIndex: 5 },
    { eventId: "savage", teamSide: "blue", playerIndex: 0 },
  ])
    assert.equal((await send(body)).status, 400);
  const command = {
    eventId: "savage",
    teamSide: "blue",
    playerIndex: 0,
    expected: model.identity(match, "blue", 0),
  };
  match.teamdata.blueteam.playerlist[0].name = "Replacement";
  assert.equal((await send(command)).status, 409);
  match.teamdata.blueteam.playerlist[0].name =
    original.teamdata.blueteam.playerlist[0].name;
  match.game_number++;
  assert.equal((await send(command)).status, 409);
  match.game_number--;
  match.teamdata.blueteam.teamname = "Other team";
  assert.equal((await send(command)).status, 409);
  assert.equal(
    cues.length,
    count,
    "rejected commands never broadcast or record",
  );
  assert.equal(records.length, count);
  match.teamdata.blueteam.teamname = original.teamdata.blueteam.teamname;
  match.teamdata.blueteam.totalgold = 1234;
  assert.equal(
    (await send(command)).status,
    200,
    "unrelated statistics do not invalidate a player cue",
  );
});
