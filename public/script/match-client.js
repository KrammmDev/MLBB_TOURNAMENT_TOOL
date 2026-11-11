/* Explicit match API client. Does not patch fetch, localStorage or any legacy global. */
(function (root) {
  'use strict';
  const state = root.MatchState;
  async function request(method, body) {
    const response = await fetch('/api/matchdata', {
      method, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.message || `Match request failed (${response.status})`);
      error.status = response.status; error.conflicts = result.conflicts; throw error;
    }
    return method === 'GET'
      ? { data: result, revision: response.headers.get('X-Match-Revision') }
      : result;
  }
  // Reconnect and poll recovery always fetch a current snapshot; never replay old browser state.
  function subscribe(listener, onStatus = () => {}, options = {}) {
    let socket, reconnect, poll, stopped = false, generation = 0, refreshing = false;
    let retry = 1000;
    async function refresh() {
      if (stopped || refreshing) return;
      refreshing = true;
      const started = generation;
      try {
        const snapshot = await request('GET');
        if (!stopped && started === generation) listener(snapshot);
      } catch (error) {
        if (!stopped) onStatus('offline', error);
      } finally { refreshing = false; }
    }
    function connect() {
      if (stopped) return;
      onStatus('connecting');
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
      socket.onopen = () => { retry = 1000; onStatus('connected'); refresh(); };
      socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (typeof options.onMessage === 'function') options.onMessage(message);
        if (message.type === 'matchdata_update' && message.data) {
          generation++;
          listener({ data: message.data, revision: message.revision });
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (stopped) return;
        onStatus('reconnecting');
        reconnect = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 15000);
      };
    }
    connect();
    refresh();
    poll = setInterval(refresh, 5000);
    const stop = () => {
      stopped = true; clearTimeout(reconnect); clearInterval(poll);
      if (socket) socket.close();
      root.removeEventListener('pagehide', stop);
    };
    root.addEventListener('pagehide', stop);
    return stop;
  }
  root.MatchDataClient = { read: () => request('GET'),
    patch: (changes, guards = []) => request('PATCH', { changes, guards }), subscribe,
    ...state };
})(window);
