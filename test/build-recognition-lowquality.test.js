"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { classifyWithEnhancement, enhancedFrame } = require("../lib/build-recognizer");

const vec = (...samples) => ({ samples, weights: Array(samples.length / 4).fill(1) });
const a = vec(.1, .2, .3, .4);
const b = vec(.9, .85, .85, .9);
const library = [
  { id: "a", name: "Item A", image: "/A.png", templates: [a] },
  { id: "b", name: "Item B", image: "/B.png", templates: [b] }
];

test("confident original match stays unchanged if enhancement is uncertain", () => {
  const result = classifyWithEnhancement([a], [vec(.35, .45, .55, .65)], library, .8, .012);
  assert.equal(result.status, "matched");
  assert.equal(result.id, "a");
  assert.equal(result.method, "original");
});

test("enhancement rescues uncertain low-quality capture only with same original candidate", () => {
  const degraded = vec(.35, .45, .55, .65);
  const result = classifyWithEnhancement([degraded], [a], library, .8, .012);
  assert.equal(result.status, "matched");
  assert.equal(result.id, "a");
  assert.equal(result.method, "enhanced");
  assert.ok(result.diagnostic.originalConfidence < .8);
});

test("conflicting confident preprocessing passes never guess a detected item", () => {
  const result = classifyWithEnhancement([a], [b], library, .8, .012);
  assert.equal(result.status, "uncertain");
  assert.equal(result.reason, "preprocessing_disagreement");
  assert.equal(result.diagnostic.originalCandidate, "Item A");
  assert.equal(result.diagnostic.enhancedCandidate, "Item B");
});

test("unknown capture remains uncertain even when enhancement agrees weakly", () => {
  const degraded = vec(.35, .45, .55, .65);
  const result = classifyWithEnhancement([degraded], [degraded], library, .8, .012);
  assert.equal(result.status, "uncertain");
  assert.equal(result.reason, "low_similarity");
});

test("mild enhancement preserves dimensions and returns RGB pixels", async () => {
  const image = await sharp({
    create: { width: 48, height: 48, channels: 3, background: { r: 60, g: 120, b: 180 } }
  }).png().toBuffer();
  const frame = await enhancedFrame(image);
  assert.equal(frame.width, 48);
  assert.equal(frame.height, 48);
  assert.equal(frame.channels, 3);
  assert.equal(frame.data.length, 48 * 48 * 3);
});
