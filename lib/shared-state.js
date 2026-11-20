"use strict";
// Broadcasts may still be meaningful commands; only skip unchanged disk persistence.
function mergeSharedState(target, changes, removeNull = false) {
  let changed = false;
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined) {
      if (removeNull && Object.hasOwn(target, key)) {
        delete target[key];
        changed = true;
      }
      continue;
    }
    const exists = Object.hasOwn(target, key);
    if (
      exists &&
      (target[key] === value ||
        (typeof value === "object" &&
          JSON.stringify(target[key]) === JSON.stringify(value)))
    )
      continue;
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    changed = true;
  }
  return changed;
}
module.exports = { mergeSharedState };
