"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyCandidates, similarity, vectorFromFrame, darkFraction } = require("../lib/build-recognizer");

test("best match is accepted only with a clear confidence gap", () => {
  const a = { samples: [.2, .3, .4, .5], weights: [1] };
  const b = { samples: [.9, .8, .7, .6], weights: [1] };
  const list = [{ id: "001", name: "Item A", image: "/A.png", templates: [a] },
    { id: "002", name: "Item B", image: "/B.png", templates: [b] }];
  const found = classifyCandidates([a], list, .8, .012);
  assert.equal(found.status, "matched");
  assert.equal(found.id, "001");
  assert.equal(found.confidence, 1);
  assert.equal(found.alternatives[0].name, "Item B");
});
test("ambiguous names remain uncertain, rather than being guessed", () => {
  const same = { samples: [.3, .2, .4, .9], weights: [1] };
  const list = [{ id: "001", name: "A", templates: [same] },
    { id: "002", name: "B", templates: [same] }];
  const found = classifyCandidates([same], list, .75, .012);
  assert.equal(found.status, "uncertain");
  assert.equal(found.scoreGap, 0);
});
test("shifted or scaled vectors can be compared against the same template", () => {
  const a = { samples: [.1, .4, .3, .2], weights: [1] };
  const b = { samples: [.7, .4, .2, .9], weights: [1] };
  const result = classifyCandidates([b, a], [{ id: "014", name: "Boots", image: "/Boots.png", templates: [a] }], .8, .012);
  assert.equal(result.status, "matched");
  assert.equal(result.id, "014");
  assert.equal(similarity(a, a), 1);
});
test("dark empty slots remain distinguishable from colorful item slots", () => {
  const width = 42, height = 42, channels = 3;
  const frame = { data: Buffer.alloc(width * height * channels, 0), width, height, channels };
  const rect = { left: 0, top: 0, width, height };
  assert.ok(darkFraction(frame, rect) > .78);
  const black = vectorFromFrame(frame, rect);
  assert.ok(black.samples.length > 0);
  for(let i=0;i<frame.data.length;i+=3){frame.data[i]=240;frame.data[i+1]=20;frame.data[i+2]=40;}
  assert.ok(darkFraction(frame, rect) < .78);
  const red = vectorFromFrame(frame, rect);
  assert.ok(similarity(black, red) < 1);
});
