(async () => {
  // Gamitin kung anong address ang ginamit sa pagbukas ng page (localhost man o LAN IP)
  const wsProto = location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = `${wsProto}${location.host}`;
  console.log(`Attempting WebSocket connection to ${wsUrl}`);
  const ws = new WebSocket(wsUrl);

  const timerKeys = [
    "timer",
    "timerRunning",
    "resetTimerBar",
    "currentPhaseIndex",
    "updateTime",
  ];
  const alwaysUpdateKeys = ["currentVideo", "logo1", "logo2"];
  // ⭐ Idagdag ang schedule keys
  for (let i = 1; i <= 8; i++) {
    alwaysUpdateKeys.push(`schedule-${i}`);
  }
  let previousStorage = { ...localStorage };

  const originalSetItem = localStorage.setItem;
  const originalRemoveItem = localStorage.removeItem;
  const originalClear = localStorage.clear;

  localStorage.setItem = function (key, value) {
    originalSetItem.call(this, key, value);
    sendStorageDelta(key, value);
  };
  localStorage.removeItem = function (key) {
    originalRemoveItem.call(this, key);
    sendStorageDelta(key, null);
  };
  localStorage.clear = function () {
    originalClear.call(this);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "clear" }));
      previousStorage = {};
    }
  };

  function sendStorageDelta(key, value) {
    const delta = {};
    if (value === null) {
      if (key in previousStorage) {
        delta[key] = null;
        delete previousStorage[key];
      }
    } else if (
      alwaysUpdateKeys.includes(key) ||
      previousStorage[key] !== value
    ) {
      delta[key] = value;
      previousStorage[key] = value;
    }
    for (const timerKey of timerKeys) {
      const currentValue = localStorage.getItem(timerKey);
      if (currentValue !== previousStorage[timerKey]) {
        delta[timerKey] = currentValue;
        previousStorage[timerKey] = currentValue;
      }
    }
    if (Object.keys(delta).length && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "update", data: delta }));
    }
  }

  ws.onopen = () => {
    console.log(`✅ Connected to WebSocket server at ${wsUrl}`);
    const currentData = { ...localStorage };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "init", data: currentData }));
      previousStorage = currentData;
    }
  };

  ws.onerror = (error) => console.error("❌ WebSocket error:", error);
  ws.onclose = () => console.log("WebSocket connection closed");
})();