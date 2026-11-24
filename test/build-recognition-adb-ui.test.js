"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "../public");
const html = fs.readFileSync(path.join(root, "build-recognition-test.html"), "utf8");
const client = fs.readFileSync(path.join(root, "script/build-recognition-test.js"), "utf8");

test("ADB recognition controls are present with a manual Apply step", () => {
  for (const id of ["adb-device", "adb-refresh", "adb-capture", "adb-auto-start", "adb-auto-stop", "adb-status",
    "upload", "scan", "apply", "stop", "preview", "summary", "teams"]) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.match(html, /Apply to Builds remains manual/);
  assert.ok(!client.includes("setInterval(captureAndScan"), "ADB capture must not queue overlapping frames");
});

function fakeElement() {
  return {
    value: "", disabled: false, textContent: "", dataset: {}, hidden: false, src: "",
    files: [], children: [], title: "", className: "",
    appendChild(child) { this.children.push(child); },
    replaceChildren(...nodes) { this.children = nodes; this.value = ""; },
    addEventListener() {},
    set onclick(fn) { this._onclick = fn; },
    get onclick() { return this._onclick; }
  };
}

test("ADB capture is scanned but never auto-applied; unauthorized device is excluded", async () => {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, fakeElement());
    return elements.get(id);
  };
  const requests = [];
  const png = new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" });
  const json = value => ({ ok: true, json: async () => value });
  const fetch = async (url, opts = {}) => {
    requests.push({ url, method: opts.method || "GET" });
    if (url === "/api/adb/devices")
      return json({ devices: [{ serial: "connected", status: "device" }, { serial: "blocked", status: "unauthorized" }] });
    if (url.startsWith("/api/adb/frame?serial="))
      return { ok: true, blob: async () => png };
    if (url === "/api/build-recognition/scan")
      return json({ counts: { matched: 1, empty: 0, uncertain: 0, missing_references: 0 },
        referenceCount: { items: 1, spells: 1 },
        teams: { blue: [], red: [] }, diagnostics: {} });
    if (url === "/api/build-recognition/status")
      return json({ items: 1, spells: 1, missingItems: 0, missingSpells: 0 });
    throw Error("Unexpected URL: " + url);
  };
  const window = { addEventListener() {} };
  const URL = { createObjectURL: () => "blob:preview", revokeObjectURL() {} };
  const context = vm.createContext({
    document: { getElementById: el, createElement: () => fakeElement(), addEventListener() {}, body: { classList: { add() {}, remove() {} } } },
    window, URL, Blob, fetch, encodeURIComponent,
    setTimeout: () => 1, clearTimeout() {}
  });
  vm.runInContext(client, context);
  // Flush the startup device-listing request.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const options = el("adb-device").children;
  assert.equal(options.length, 3);
  assert.equal(options[2].disabled, true);
  assert.equal(el("adb-device").value, "connected");

  await el("adb-capture").onclick();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.ok(requests.some(x => x.url === "/api/adb/frame?serial=connected"));
  assert.ok(requests.some(x => x.url === "/api/build-recognition/scan" && x.method === "POST"));
  assert.ok(!requests.some(x => x.url === "/api/build-recognition/apply"));
  assert.equal(el("apply").disabled, false);
});
