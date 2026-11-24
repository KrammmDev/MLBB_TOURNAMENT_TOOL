"use strict";
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

function inside(base, target) {
  const rel = path.relative(base, target);
  return rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}

function entries(mapping, root) {
  return Object.entries(mapping)
    .filter(([, v]) => v && v.type !== "placeholder" && v.name !== "idle" && typeof v.image === "string")
    .map(([id, v]) => {
      let location;
      try {
        location = path.resolve(root, decodeURIComponent(v.image.replace(/^[/]+/, "")));
      } catch {
        return null;
      }
      return inside(root, location) && fs.existsSync(location)
        ? { id, name: v.name, image: v.image, location }
        : null;
    })
    .filter(Boolean);
}

// Work with a single decoded screenshot rather than decoding the PNG for each slot.
async function decode(bytes) {
  const { data, info } = await sharp(bytes, { limitInputPixels: 20e6 })
    .flatten({ background: "#000000" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

const GRID = 14;
const ITEM_THRESHOLD = .80, SPELL_THRESHOLD = .79;
// Do not accept an enhancement-only result unless it agrees with the original
// candidate and exceeds the ordinary confidence and separation limits.
const RECOVERY_CONFIDENCE_EXTRA = .025;
const RECOVERY_MARGIN_EXTRA = .008;
function pixel(frame, x, y, channel) {
  const xx = Math.max(0, Math.min(frame.width - 1, Math.round(x)));
  const yy = Math.max(0, Math.min(frame.height - 1, Math.round(y)));
  return frame.data[(yy * frame.width + xx) * frame.channels + channel];
}

// Average around each sample point to reduce compression artifacts, especially for 35px icons.
// Each vector sample includes normalized chroma and luminance.
function vectorFromFrame(frame, rect, { spell = false } = {}) {
  const samples = [], weights = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const nx = (x + 0.5) / GRID, ny = (y + 0.5) / GRID;
    const radius = Math.hypot(nx - 0.5, ny - 0.5);
    // Ignore UI borders; circular spell images also have uninformative corners.
    if (nx < .09 || nx > .91 || ny < .09 || ny > .91 || (spell && radius > .44)) continue;
    const px = rect.left + nx * rect.width, py = rect.top + ny * rect.height;
    const rad = Math.max(.5, Math.min(rect.width, rect.height) / 42);
    let red = 0, green = 0, blue = 0;
    for (const [dx, dy] of [[0, 0], [-rad, 0], [rad, 0], [0, -rad], [0, rad]]) {
      red += pixel(frame, px + dx, py + dy, 0);
      green += pixel(frame, px + dx, py + dy, 1);
      blue += pixel(frame, px + dx, py + dy, 2);
    }
    red /= 5; green /= 5; blue /= 5;
    const lum = (red + green + blue) / 3;
    samples.push((red - lum) / 255, (green - lum) / 255, (blue - lum) / 255, lum / 255);
    // Cooldown numbers frequently cover the center of battle-spell icons.
    weights.push(spell && radius < .25 ? .15 : 1);
  }
  return { samples, weights };
}

function similarity(a, b) {
  // Retain the public utility used by earlier local tests.
  const av = Array.isArray(a) ? a : a.samples, bv = Array.isArray(b) ? b : b.samples;
  if (av.length !== bv.length) throw Error("Vector size mismatch");
  const weights = Array.isArray(a) ? null : a.weights;
  let err = 0, weight = 0;
  for (let i = 0; i < av.length; i++) {
    const w = weights ? weights[Math.floor(i / 4)] : 1;
    err += Math.abs(av[i] - bv[i]) * w;
    weight += w;
  }
  return Math.max(0, 1 - err / weight);
}

function classifyCandidates(vectors, library, threshold, margin) {
  if (!library.length) return { status: "missing_references", confidence: 0 };
  const ranked = library.map(entry => {
    const templates = entry.templates || [entry.vector];
    let score = 0;
    for (const v of vectors) for (const ref of templates) {
      if (!v || !ref) continue;
      score = Math.max(score, similarity(v, ref));
    }
    return { entry, score };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0], second = ranked[1];
  const gap = second ? best.score - second.score : 1;
  const info = {
    confidence: +best.score.toFixed(3),
    scoreGap: +gap.toFixed(3),
    candidate: best.entry.name,
    alternatives: ranked.slice(1, 3).map(r => ({ name: r.entry.name, confidence: +r.score.toFixed(3) }))
  };
  if (best.score < threshold || gap < margin) return {
    status: "uncertain", ...info,
    reason: best.score < threshold ? "low_similarity" : "close_candidates"
  };
  return { status: "matched", ...info, id: best.entry.id, name: best.entry.name, image: best.entry.image };
}
function classify(sample, library, threshold, margin) {
  return classifyCandidates([sample], library, threshold, margin);
}

// A conservative two-pass recognizer: successful original-image matches stay
// untouched, while enhancement may only rescue uncertain results with agreement.
// Conflicting strong identifications are held for manual review.
function classifyWithEnhancement(original, enhanced, library, threshold, margin) {
  const baseline = classifyCandidates(original, library, threshold, margin);
  const improved = classifyCandidates(enhanced, library, threshold, margin);
  const diagnostic = {
    originalConfidence: baseline.confidence,
    enhancedConfidence: improved.confidence,
    originalCandidate: baseline.candidate || null,
    enhancedCandidate: improved.candidate || null
  };
  if (baseline.status === "missing_references") return baseline;
  if (baseline.status === "matched") {
    if (improved.status === "matched" && baseline.id !== improved.id) {
      return {
        status: "uncertain", candidate: baseline.name,
        confidence: baseline.confidence, scoreGap: baseline.scoreGap,
        reason: "preprocessing_disagreement", alternatives: baseline.alternatives,
        diagnostic
      };
    }
    return { ...baseline, method: "original", diagnostic };
  }
  if (improved.status === "matched" &&
      improved.candidate === baseline.candidate &&
      improved.confidence >= threshold + RECOVERY_CONFIDENCE_EXTRA &&
      improved.scoreGap >= margin + RECOVERY_MARGIN_EXTRA) {
    return { ...improved, method: "enhanced", diagnostic };
  }
  return {
    ...baseline,
    reason: improved.status === "matched" && improved.candidate !== baseline.candidate
      ? "preprocessing_disagreement" : baseline.reason,
    diagnostic
  };
}

async function enhancedFrame(bytes) {
  const { data, info } = await sharp(bytes, { limitInputPixels: 20e6 })
    .flatten({ background: "#000000" })
    // Mild contrast and sharpening only; never use generative upscaling.
    .linear(1.055, -6).sharpen({ sigma: 1 })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function loadReferenceLibrary(root) {
  const result = { items: [], spells: [], missingItems: 0, missingSpells: 0 };
  for (const [key, filename] of [["items", "item-mappings.json"], ["spells", "spell-mappings.json"]]) {
    const mapping = JSON.parse(fs.readFileSync(path.join(root, "database", filename), "utf8"));
    const wanted = Object.values(mapping).filter(v => v.type !== "placeholder").length;
    for (const e of entries(mapping, root)) {
      try {
        const bytes = fs.readFileSync(e.location);
        const templates = [];
        // Small viewport icons often differ in scale from the PNG assets.
        for (const inset of [0, 2, 4]) {
          const image = await sharp(bytes).resize(42 - inset * 2, 42 - inset * 2, { fit: "fill" })
            .extend({ top: inset, bottom: inset, left: inset, right: inset, background: "#000000" })
            .flatten({ background: "#000000" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          const f = { data: image.data, width: image.info.width, height: image.info.height, channels: image.info.channels };
          templates.push(vectorFromFrame(f, { left: 0, top: 0, width: 42, height: 42 }, { spell: key === "spells" }));
        }
        result[key].push({ ...e, templates });
      } catch { /* A corrupt reference is counted as missing. */ }
    }
    result[key === "items" ? "missingItems" : "missingSpells"] = wanted - result[key].length;
  }
  return result;
}

function scaled(c, sx, sy) {
  return { left: Math.round(c.x * sx), top: Math.round(c.y * sy),
    width: Math.max(4, Math.round(c.width * sx)), height: Math.max(4, Math.round(c.height * sy)) };
}
function within(rect, frame) {
  return rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= frame.width && rect.top + rect.height <= frame.height;
}
function shifted(rect, dx, dy) {
  return { left: rect.left + dx, top: rect.top + dy, width: rect.width, height: rect.height };
}
function darkFraction(frame, rect) {
  let dark = 0, total = 0;
  for (let y = .22; y < .78; y += .045) for (let x = .22; x < .78; x += .045) {
    const px = rect.left + x * rect.width, py = rect.top + y * rect.height;
    if (Math.max(pixel(frame, px, py, 0), pixel(frame, px, py, 1), pixel(frame, px, py, 2)) < 34) dark++;
    total++;
  }
  return dark / Math.max(1, total);
}
function variants(frame, rect, { spell = false } = {}) {
  const offsets = spell ? [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]]
    : [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]];
  return offsets.map(([dx, dy]) => shifted(rect, Math.round(dx * frame.width / 1919), Math.round(dy * frame.height / 1078)))
    .filter(r => within(r, frame))
    .map(r => vectorFromFrame(frame, r, { spell }));
}
async function detect(bytes, map, library) {
  const frame = await decode(bytes);
  if (frame.width < 600 || frame.height < 400) throw Error("Image too small");
  const enhanced = await enhancedFrame(bytes);
  const sx = frame.width / map.reference_resolution.width, sy = frame.height / map.reference_resolution.height;
  const out = { source: { width: frame.width, height: frame.height },
    capturedAt: new Date().toISOString(), teams: { blue: [], red: [] },
    counts: { matched: 0, empty: 0, uncertain: 0, missing_references: 0 },
    diagnostics: { enhancedMatches: 0, conflictingResults: 0 } };
  for (const team of ["blue", "red"]) for (const p of map.teams[team]) {
    const player = { player_index: p.player_index, items: [], battleSpell: null };
    for (const slot of p.item_slots) {
      const rect = scaled(slot.crop, sx, sy);
      if (!within(rect, frame)) throw Error("Item crop outside image");
      const match = darkFraction(frame, rect) > .78
        ? { status: "empty", confidence: 1 }
        : classifyWithEnhancement(
            variants(frame, rect), variants(enhanced, rect), library.items, ITEM_THRESHOLD, .012
          );
      out.counts[match.status]++;
      if (match.method === "enhanced") out.diagnostics.enhancedMatches++;
      if (match.reason === "preprocessing_disagreement") out.diagnostics.conflictingResults++;
      player.items.push({ slot: slot.slot, ...match });
    }
    const rect = scaled(p.battle_spell.crop, sx, sy);
    if (!within(rect, frame)) throw Error("Spell crop outside image");
    player.battleSpell = classifyWithEnhancement(
      variants(frame, rect, { spell: true }),
      variants(enhanced, rect, { spell: true }),
      library.spells, SPELL_THRESHOLD, .015
    );
    if (player.battleSpell.method === "enhanced") out.diagnostics.enhancedMatches++;
    if (player.battleSpell.reason === "preprocessing_disagreement") out.diagnostics.conflictingResults++;
    out.counts[player.battleSpell.status]++;
    out.teams[team].push(player);
  }
  return out;
}
module.exports = {
  loadReferenceLibrary, detect, classify, classifyCandidates,
  classifyWithEnhancement, similarity, vectorFromFrame, darkFraction,
  enhancedFrame
};
