/* Shared field-change contract for Node and browser clients. No storage or DOM side effects. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MatchState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const blocked = new Set(['__proto__', 'prototype', 'constructor']);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function invalid(message) {
    const error = new Error(message); error.status = 400; throw error;
  }
  function validateJson(value, depth = 0) {
    if (depth > 32) invalid('Match data is too deeply nested');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!value || typeof value !== 'object') invalid('Expected a JSON value');
    for (const [key, child] of Object.entries(value)) {
      if (blocked.has(key)) invalid('Unsafe field name');
      validateJson(child, depth + 1);
    }
  }
  function validateMatch(data) {
    validateJson(data);
    if (!object(data) || !object(data.teamdata)) invalid('Expected a complete match document');
    for (const side of ['blueteam', 'redteam']) {
      const team = data.teamdata[side];
      if (!object(team) || !Array.isArray(team.playerlist) || team.playerlist.length !== 5 ||
          !team.playerlist.every(object)) invalid('Each match team must have five player objects');
    }
  }
  function validatePath(path) {
    if (!Array.isArray(path) || !path.length || path.length > 16 || path.some(k =>
      typeof k !== 'string' || !k.length || blocked.has(k))) invalid('Invalid change path');
  }
  function at(data, path) {
    let value = data;
    for (const key of path) {
      if (value === null || typeof value !== 'object' || !own(value, key)) return { exists: false };
      value = value[key];
    }
    return { exists: true, value: clone(value) };
  }
  function diff(before, after, path = []) {
    if (equal(before, after)) return [];
    if ((object(before) && object(after)) ||
        (Array.isArray(before) && Array.isArray(after) && before.length === after.length)) {
      const changes = [];
      for (const key of Object.keys(before)) {
        if (!own(after, key)) invalid('Field deletion is not supported');
      }
      for (const key of Object.keys(after)) {
        if (own(before, key)) changes.push(...diff(before[key], after[key], path.concat(key)));
        else changes.push({ path: path.concat(key), previous: { exists: false }, value: clone(after[key]) });
      }
      return changes;
    }
    if (!path.length) invalid('Cannot replace the match root with a field change');
    return [{ path, previous: { exists: true, value: clone(before) }, value: clone(after) }];
  }
  function applyChanges(current, changes, guards = []) {
    if (!Array.isArray(changes) || !changes.length || changes.length > 256 ||
        !Array.isArray(guards) || guards.length > 64) invalid('Expected 1 to 256 changes and at most 64 guards');
    for (const entry of changes.concat(guards)) {
      if (!object(entry)) invalid('Invalid change');
      validatePath(entry.path);
      if (!object(entry.previous) || typeof entry.previous.exists !== 'boolean' ||
          (entry.previous.exists && !own(entry.previous, 'value'))) invalid('Expected previous field value');
      if (entry.previous.exists) validateJson(entry.previous.value);
    }
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (!own(change, 'value')) invalid('Expected new field value');
      validateJson(change.value);
      for (let j = 0; j < i; j++) {
        const other = changes[j].path;
        const n = Math.min(change.path.length, other.length);
        if (change.path.slice(0, n).every((k, x) => k === other[x])) invalid('Overlapping change paths');
      }
    }
    const conflicts = changes.concat(guards).filter(entry => {
      const actual = at(current, entry.path);
      return actual.exists !== entry.previous.exists ||
        (actual.exists && !equal(actual.value, entry.previous.value));
    }).map(entry => entry.path);
    if (conflicts.length) {
      const error = new Error('Match changed in another panel. Reload before editing these fields.');
      error.status = 409; error.conflicts = conflicts; throw error;
    }
    const next = clone(current);
    for (const { path, value } of changes) {
      let parent = next;
      for (const key of path.slice(0, -1)) {
        if (!own(parent, key) || parent[key] === null || typeof parent[key] !== 'object') invalid('Change parent does not exist');
        parent = parent[key];
      }
      const key = path[path.length - 1];
      if (Array.isArray(parent) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= parent.length)) invalid('Invalid array index');
      parent[key] = clone(value);
    }
    validateMatch(next);
    return next;
  }
  function editorGuards(data) {
    const paths = [['game_number'], ['matchInfo']];
    for (const side of ['blueteam', 'redteam']) {
      paths.push(['teamdata', side, 'teamname']);
      for (let i = 0; i < (data.teamdata?.[side]?.playerlist?.length || 0); i++) {
        for (const field of ['name', 'hero']) paths.push(['teamdata', side, 'playerlist', String(i), field]);
      }
    }
    return paths.map(path => ({ path, previous: at(data, path) }));
  }
  return { clone, equal, diff, at, applyChanges, validateMatch, editorGuards };
});
