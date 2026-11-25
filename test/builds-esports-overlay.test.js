"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../public");
const page = fs.readFileSync(path.join(root, "builds.html"), "utf8");
const css = fs.readFileSync(path.join(root, "builds.css"), "utf8");
const metadata = fs.readFileSync(path.join(root, "script/builds-broadcast-metadata.js"), "utf8");

test("OBS keeps a transparent 1920x1080 layout with tournament equipment heading", () => {
  assert.match(css, /width:\s*1920px/);
  assert.match(css, /height:\s*1080px/);
  assert.match(css, /background:\s*transparent\s*!important/);
  assert.match(page, /IN-GAME EQUIPMENT/);
  assert.match(css, /grid-template-columns:\s*760px 280px 760px/);
});

test("all player identifiers, item slots and hero portraits remain intact", () => {
  for (const [team, offset] of [["blue", 0], ["red", 5]]) {
    for (let i = 1; i <= 5; i++) {
      const rowStart = page.indexOf('id="' + team + 'side' + i + '"');
      assert.ok(rowStart >= 0);
      const nextRow = page.indexOf('<div class="player"', rowStart + 1);
      const body = page.slice(rowStart, nextRow < 0 ? undefined : nextRow);
      const items = [...body.matchAll(/id="item([1-6])"/g)].map(v => +v[1]);
      assert.deepEqual(items, team === "blue" ? [1,2,3,4,5,6] : [6,5,4,3,2,1]);
      assert.match(body, new RegExp('id="image-display-' + (offset + i) + '"'));
      assert.match(body, new RegExp('id="build-role-' + (offset + i) + '"'));
    }
  }
  assert.equal((page.match(/class="itembox"/g) || []).length, 60);
  assert.equal((page.match(/class="rolebox"/g) || []).length, 10);
});

test("roles come from the control panel persisted lane, including junggle", () => {
  assert.match(metadata, /players\[i\]\?\.lane/);
  assert.match(metadata, /junggle:\s*\{ label:\s*"JUNGLE"/);
  assert.match(metadata, /\/database\/matchdatateam\.json/);
  assert.match(metadata, /setInterval\(refreshRoles, 3000\)/);
});

test("center logo uses broadcast-themes branding API, not mock branding", () => {
  assert.match(page, /id="build-tournament-logo"/);
  assert.match(metadata, /\/api\/scoreboard-branding/);
  assert.match(metadata, /\/scoreboard-branding\//);
  assert.match(page, /src="script\/builds-broadcast-metadata\.js"/);
  assert.doesNotMatch(page, /Infinix|MPL|battleSpell|class="gold"/i);
  assert.match(page, /src="script\/build\.js"/);
  assert.match(page, /src="script\/build-recognition-bridge\.js"/);
});


test("compact equipment panel restores previous on-screen size", () => {
  assert.match(css, /width:\s*1008px/);
  assert.match(css, /height:\s*325px/);
  assert.match(css, /grid-template-columns:\s*400px 176px 400px/);
  assert.match(css, /--slot:\s*43px/);
});

test("role logo is the existing lane PNG and sits between items and hero on blue, hero and items on red", () => {
  assert.match(metadata, /\/Assets\/lane\//);
  for (const lane of ["exp.png", "junggle.png", "mid.png", "roam.png", "gold.png"]) {
    assert.ok(metadata.includes(lane));
  }
  assert.equal((page.match(/class="role-icon"/g) || []).length, 10);
  for (let i = 1; i <= 5; i++) {
    const row = page.match(new RegExp('<div class="player" id="blueside' + i + '">([\\s\\S]*?)<\\/div>\\s*<\\/section>'));
    const start = page.indexOf('id="blueside' + i + '"');
    const next = page.indexOf('<div class="player"', start+1);
    const body = page.slice(start, next < 0 ? page.indexOf('</section>',start) : next);
    assert.ok(body.indexOf('id="item6"') < body.indexOf('id="build-role-' + i + '"'));
    assert.ok(body.indexOf('id="build-role-' + i + '"') < body.indexOf('id="image-box-' + i + '"'));
  }
  for (let i = 1; i <= 5; i++) {
    const num = i + 5;
    const start = page.indexOf('id="redside' + i + '"');
    const next = page.indexOf('<div class="player"', start+1);
    const body = page.slice(start, next < 0 ? page.indexOf('</section>',start) : next);
    assert.ok(body.indexOf('id="image-box-' + num + '"') < body.indexOf('id="build-role-' + num + '"'));
    assert.ok(body.indexOf('id="build-role-' + num + '"') < body.indexOf('id="item6"'));
  }
});
