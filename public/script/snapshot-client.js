/* Read-only, conditional snapshots. A 304 reuses the parsed value instead of parsing megabytes again. */
(function (root) {
  "use strict";
  const entries = new Map();
  root.SnapshotClient = {
    read(url) {
      let state = entries.get(url);
      if (!state) {
        state = {};
        entries.set(url, state);
      }
      if (state.pending) return state.pending;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const headers = state.etag ? { "If-None-Match": state.etag } : {};
      state.pending = (async () => {
        try {
          const response = await fetch(url, {
            cache: "no-store",
            headers,
            signal: controller.signal,
          });
          if (response.status === 304 && state.loaded) return state.value;
          if (!response.ok)
            throw Error("Snapshot unavailable: " + response.status);
          const value = await response.json();
          state.value = value;
          state.loaded = true;
          state.etag = response.headers.get("ETag");
          return value;
        } finally {
          clearTimeout(timeout);
          state.pending = null;
        }
      })();
      return state.pending;
    },
  };
})(window);
