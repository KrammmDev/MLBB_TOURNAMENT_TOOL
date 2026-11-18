/* Schedule-only transport. Never patches Storage or uploads unrelated browser state. */
(function (root) {
  "use strict";
  const validKey = (key) => /^schedule-[1-8]$/.test(key);
  const pending = new Map();
  let socket,
    ready = false,
    stopped = false,
    retry = 1000,
    reconnect,
    flushTimer;
  let receive = () => {},
    status = () => {};
  function flush() {
    clearTimeout(flushTimer);
    if (
      !ready ||
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !pending.size
    )
      return;
    const data = Object.fromEntries(pending);
    try {
      socket.send(JSON.stringify({ type: "update", data }));
      pending.clear();
      status("Live sync");
    } catch {
      status("Reconnecting — edits queued");
    }
  }
  function publish(key, value) {
    if (!validKey(key)) return;
    pending.set(key, value);
    status(ready ? "Syncing changes…" : "Reconnecting — edits queued");
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 120);
  }
  function connect() {
    if (stopped) return;
    ready = false;
    status("Connecting…");
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`,
    );
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "init") {
        const data = message.data || {};
        const hasSchedules = Object.keys(data).some(validKey);
        // One-time legacy import only when the server has no saved schedules.
        if (!hasSchedules) {
          for (let i = 1; i <= 8; i++) {
            const key = "schedule-" + i;
            try {
              const raw = localStorage.getItem(key);
              const parsed = raw && JSON.parse(raw);
              if (
                parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed) &&
                !pending.has(key)
              )
                pending.set(key, raw);
            } catch {}
          }
        }
        const snapshot = {};
        for (let i = 1; i <= 8; i++) {
          const key = "schedule-" + i;
          if (pending.has(key) && pending.get(key) === data[key])
            pending.delete(key);
          if (!pending.has(key)) snapshot[key] = data[key] ?? null;
        }
        receive(snapshot);
        ready = true;
        retry = 1000;
        flush();
        status("Live sync");
      } else if (message.type === "update" && message.data) {
        const changes = {};
        for (const [key, value] of Object.entries(message.data))
          if (validKey(key) && !pending.has(key)) changes[key] = value;
        if (Object.keys(changes).length) receive(changes);
      } else if (message.type === "clear") {
        const changes = {};
        for (let i = 1; i <= 8; i++)
          if (!pending.has("schedule-" + i)) changes["schedule-" + i] = null;
        receive(changes);
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      ready = false;
      if (stopped) return;
      status("Reconnecting — edits queued");
      reconnect = setTimeout(connect, retry);
      retry = Math.min(retry * 2, 15000);
    };
  }
  root.ScheduleControlSync = {
    publish,
    start(onState, onStatus) {
      receive = onState;
      status = onStatus || status;
      connect();
    },
  };
  addEventListener("pagehide", () => {
    flush();
    stopped = true;
    clearTimeout(reconnect);
    clearTimeout(flushTimer);
    if (socket) socket.close();
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
})(window);
