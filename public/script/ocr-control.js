/* Capture once at native resolution; bounded recognition, no queued video frames. */
(() => {
  "use strict";
  const M = window.OCRModel,
    $ = (id) => document.getElementById(id);
  const video = $("video"),
    preview = $("preview"),
    native = document.createElement("canvas");
  let stream,
    image,
    reference,
    settings,
    telemetry,
    sessionId,
    running = false,
    sequence = 0;
  let regions = {},
    dirty = false,
    lastFrame = 0,
    frameCount = 0,
    decodedFrames = null,
    captureStalled = false,
    captureEpoch = 0,
    drag;
  let inFlight = false,
    polling = false,
    timer,
    sampledFrame = null,
    lastLatency = 0;
  const message = (text, error = false) => {
    $("message").textContent = text;
    $("message").classList.toggle("error", error);
  };
  async function api(path, body, method = "POST", headers = {}) {
    const response = await fetch(`/api/ocr/${path}`, {
      method,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.message || `OCR request failed (${response.status})`,
      );
    return result;
  }
  function safe(action) {
    return async () => {
      try {
        await action();
      } catch (e) {
        message(e.message, true);
      }
    };
  }
  function controls() {
    $("start").disabled =
      !reference ||
      dirty ||
      captureStalled ||
      !settings?.data.profile ||
      inFlight;
    $("live").disabled =
      !sessionId ||
      !running ||
      dirty ||
      reference?.kind === "image" ||
      !telemetry?.preview;
    $("stop").disabled = !sessionId;
    $("output-state").textContent =
      `Output: ${telemetry?.source === "custom" ? "Custom OCR" : "FalseOCR"}${dirty ? " • unsaved calibration" : ""}`;
  }
  async function stop() {
    running = false;
    clearTimeout(timer);
    const old = sessionId;
    sessionId = null;
    if (old) {
      try {
        telemetry = await api("stop", { sessionId: old });
      } catch (e) {
        message(e.message, true);
      }
    }
    controls();
  }
  async function disconnect() {
    ++captureEpoch;
    await stop();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    image = null;
    reference = null;
    lastFrame = 0;
    decodedFrames = null;
    captureStalled = false;
    sampledFrame = null;
    $("capture-info").textContent = "Capture disconnected";
    controls();
  }
  function frameCallback(epoch) {
    if (!video.requestVideoFrameCallback) return;
    video.requestVideoFrameCallback(() => {
      if (epoch !== captureEpoch || !stream) return;
      lastFrame = performance.now();
      frameCount++;
      frameCallback(epoch);
    });
  }
  function observeDecodedFrames() {
    // Video-frame callbacks follow presentation and can be suppressed by Chromium.
    // Decode progress is independent evidence; a live track alone is not freshness.
    const total = video.getVideoPlaybackQuality?.().totalVideoFrames;
    if (!Number.isFinite(total)) return;
    if (decodedFrames !== null && total > decodedFrames) {
      lastFrame = performance.now();
      frameCount = Math.max(frameCount, total);
    }
    decodedFrames = total;
  }
  function stallCapture() {
    if (!captureStalled) {
      captureStalled = true;
      safe(stop)();
      message(
        "No decoded video frames. OCR paused; camera remains connected. Check OBS, then start preview again when frames return.",
        true,
      );
    }
    return false;
  }
  async function devices() {
    if (!navigator.mediaDevices)
      throw new Error(
        "Open http://localhost:3000/ocr-control.html on the server PC, or use HTTPS.",
      );
    const previous = $("camera").value;
    const found = await navigator.mediaDevices.enumerateDevices();
    $("camera").replaceChildren(new Option("Default camera", ""));
    found
      .filter((d) => d.kind === "videoinput")
      .forEach((d, i) =>
        $("camera").add(new Option(d.label || `Camera ${i + 1}`, d.deviceId)),
      );
    $("camera").value = previous;
  }
  async function connect(kind) {
    await disconnect();
    if (!navigator.mediaDevices)
      throw new Error(
        "Camera capture needs localhost or HTTPS. Open this panel on the server PC.",
      );
    const epoch = captureEpoch;
    const media =
      kind === "screen"
        ? await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          })
        : await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: $("camera").value
                ? { exact: $("camera").value }
                : undefined,
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          });
    if (epoch !== captureEpoch) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = media;
    video.srcObject = media;
    await video.play();
    const track = media.getVideoTracks()[0],
      actual = track.getSettings();
    reference = {
      width: video.videoWidth,
      height: video.videoHeight,
      kind,
      sourceKey:
        kind === "camera"
          ? actual.deviceId || track.label
          : `${actual.displaySurface || "screen"}:${track.label}`,
    };
    lastFrame = performance.now();
    frameCount = 0;
    decodedFrames = video.getVideoPlaybackQuality?.().totalVideoFrames ?? null;
    if (!video.requestVideoFrameCallback && !video.getVideoPlaybackQuality) {
      await disconnect();
      throw new Error(
        "Use current Chrome or Edge with video frame/decode monitoring.",
      );
    }
    frameCallback(captureEpoch);
    track.addEventListener("ended", () => {
      if (stream === media) safe(disconnect)();
    });
    $("capture-info").textContent =
      `${track.label} • native ${reference.width} × ${reference.height} • negotiated ${actual.frameRate ?? "?"} fps • ${kind}`;
    dirty =
      JSON.stringify(reference) !==
      JSON.stringify(settings?.data.profile?.reference);
    await devices();
    controls();
    message(
      "Source connected. Draw and save native regions, then start preview.",
    );
  }
  function snapshot() {
    if (!reference) return false;
    if (!image) {
      const track = stream?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") {
        safe(disconnect)();
        message(
          "Camera track ended. Restart OBS Virtual Camera and reconnect.",
          true,
        );
        return false;
      }
      observeDecodedFrames();
      if (performance.now() - lastFrame > 5000) return stallCapture();
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight)
        return false;
      if (captureStalled) {
        captureStalled = false;
        controls();
        message(
          "Video frames resumed. Verify the feed, then start preview again.",
        );
      }
    }
    if (
      !image &&
      (video.videoWidth !== reference.width ||
        video.videoHeight !== reference.height)
    ) {
      safe(disconnect)();
      message("Capture resolution changed. Reconnect and recalibrate.", true);
      return false;
    }
    if (
      native.width !== reference.width ||
      native.height !== reference.height
    ) {
      native.width = reference.width;
      native.height = reference.height;
      preview.width = reference.width;
      preview.height = reference.height;
    }
    native
      .getContext("2d")
      .drawImage(image || video, 0, 0, native.width, native.height);
    return true;
  }
  function crop(roi) {
    const r = M.cropRect(roi, native.width, native.height),
      raw = document.createElement("canvas");
    raw.width = r.width;
    raw.height = r.height;
    raw
      .getContext("2d")
      .drawImage(native, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    const processed = document.createElement("canvas");
    processed.width = raw.width * roi.scale + 16;
    processed.height = raw.height * roi.scale + 16;
    const ctx = processed.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, processed.width, processed.height);
    ctx.drawImage(raw, 8, 8, raw.width * roi.scale, raw.height * roi.scale);
    if (roi.mode !== "raw") {
      const pixels = ctx.getImageData(
          8,
          8,
          raw.width * roi.scale,
          raw.height * roi.scale,
        ),
        p = pixels.data;
      for (let i = 0; i < p.length; i += 4) {
        let gray = Math.round(
          p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114,
        );
        if (roi.mode === "invert") gray = 255 - gray;
        if (roi.mode === "threshold") gray = gray >= roi.threshold ? 255 : 0;
        p[i] = p[i + 1] = p[i + 2] = gray;
      }
      ctx.putImageData(pixels, 8, 8);
    }
    return { raw, processed, rect: r };
  }
  function inspect() {
    const roi = regions[$("field").value];
    if (!roi || !reference) {
      $("region-info").textContent = "No region drawn for this field";
      return;
    }
    const result = crop(roi);
    for (const key of ["raw", "processed"]) {
      const canvas = $(key);
      canvas.width = result[key].width;
      canvas.height = result[key].height;
      canvas.getContext("2d").drawImage(result[key], 0, 0);
    }
    $("region-info").textContent =
      `Raw ${result.rect.width} × ${result.rect.height}px at (${result.rect.x}, ${result.rect.y}) → processed ${result.processed.width} × ${result.processed.height}px`;
  }
  let lastPaint = 0;
  function draw(at) {
    if (at - lastPaint >= 100 && snapshot()) {
      lastPaint = at;
      const ctx = preview.getContext("2d");
      ctx.drawImage(native, 0, 0);
      ctx.font = `${Math.max(14, native.width / 100)}px system-ui`;
      ctx.lineWidth = Math.max(2, native.width / 700);
      for (const [id, roi] of Object.entries(regions)) {
        const r = M.cropRect(roi, native.width, native.height);
        ctx.strokeStyle = id === $("field").value ? "#ffe074" : "#50dacb";
        ctx.strokeRect(r.x, r.y, r.width, r.height);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(M.field(id).label, r.x, Math.max(20, r.y - 6));
      }
      inspect();
    }
    requestAnimationFrame(draw);
  }
  const point = (e) => {
    const r = preview.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          preview.width,
          ((e.clientX - r.left) * preview.width) / r.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          preview.height,
          ((e.clientY - r.top) * preview.height) / r.height,
        ),
      ),
    };
  };
  preview.onpointerdown = (e) => {
    if (!reference) return;
    drag = point(e);
    preview.setPointerCapture(e.pointerId);
  };
  preview.onpointerup = (e) => {
    if (!drag) return;
    const roi = {
      ...M.pixels(drag, point(e), preview.width, preview.height),
      mode: $("mode").value,
      scale: +$("scale").value,
      threshold: +$("threshold").value,
      minScore: +$("minScore").value,
    };
    drag = null;
    const next = { ...regions, [$("field").value]: roi };
    try {
      M.validateProfile({ schemaVersion: 1, reference, regions: next });
      regions = next;
      changed();
    } catch (error) {
      message(
        `${error.message} Keep regions tightly around the digits (at least 8 × 12 native pixels).`,
        true,
      );
    }
  };
  preview.onpointercancel = () => {
    drag = null;
  };
  function changed() {
    dirty = true;
    safe(stop)();
    controls();
    message("Calibration changed. Save before starting recognition.");
  }
  function fieldSettings() {
    const roi = regions[$("field").value];
    if (roi)
      for (const key of ["mode", "scale", "threshold", "minScore"])
        $(key).value = roi[key];
    inspect();
  }
  for (const spec of M.fields) {
    $("field").add(new Option(spec.label, spec.id));
    const row = document.createElement("tr");
    row.dataset.field = spec.id;
    const label = document.createElement("td");
    label.textContent = spec.label;
    row.append(label);
    for (const key of ["rawText", "score", "accepted", "status"]) {
      const td = document.createElement("td");
      td.dataset.key = key;
      row.append(td);
    }
    const manual = document.createElement("td"),
      input = document.createElement("input"),
      set = document.createElement("button"),
      auto = document.createElement("button");
    input.setAttribute("aria-label", `Manual ${spec.label}`);
    input.placeholder = spec.kind === "timer" ? "MM:SS" : "Value";
    set.textContent = "Lock";
    auto.textContent = "Auto";
    set.onclick = safe(async () => {
      telemetry = await api("manual", {
        generation: telemetry.generation,
        field: spec.id,
        value: input.value,
      });
      render();
    });
    auto.onclick = safe(async () => {
      telemetry = await api("manual", {
        generation: telemetry.generation,
        field: spec.id,
        value: null,
      });
      render();
    });
    manual.append(input, set, auto);
    row.append(manual);
    $("readings").append(row);
  }
  function render() {
    if (!telemetry) return;
    $("session-info").textContent =
      `${telemetry.active ? (telemetry.preview ? "PREVIEW" : "LIVE SESSION") : "STOPPED"} • ${frameCount} frames observed • last batch ${lastLatency}ms${telemetry.engineError ? ` • ${telemetry.engineError}` : ""}`;
    for (const spec of M.fields) {
      const row = document.querySelector(`tr[data-field="${spec.id}"]`),
        v = telemetry.fields[spec.id];
      for (const key of ["rawText", "score", "accepted", "status"]) {
        const cell = row.querySelector(`[data-key="${key}"]`);
        cell.textContent =
          key === "accepted" ? M.format(spec.id, v.accepted) : (v[key] ?? "--");
        cell.title = v.reason || "";
      }
      row.classList.toggle("accepted", v.status === "accepted" || v.locked);
      row
        .querySelectorAll("button")
        .forEach((b) => (b.disabled = !telemetry.active || telemetry.preview));
    }
    controls();
  }
  async function read() {
    if (!running || inFlight) return;
    if (!snapshot()) {
      if (running) timer = setTimeout(read, 350);
      return;
    }
    if (!image && sampledFrame === lastFrame) {
      timer = setTimeout(read, 350);
      return;
    }
    sampledFrame = lastFrame;
    inFlight = true;
    controls();
    const id = sessionId,
      capturedAt = Date.now(),
      start = performance.now();
    try {
      const crops = Object.entries(regions).map(([field, roi]) => ({
        field,
        png: crop(roi).processed.toDataURL("image/png"),
      }));
      const result = await api("read", {
        sessionId: id,
        sequence: ++sequence,
        capturedAt,
        reference,
        crops,
      });
      if (sessionId === id) {
        telemetry = result.state;
        lastLatency = Math.round(performance.now() - start);
        render();
      }
    } catch (e) {
      if (sessionId === id) {
        await stop();
        message(e.message, true);
      }
    } finally {
      inFlight = false;
      controls();
      if (running) timer = setTimeout(read, 350);
    }
  }
  async function reload() {
    await stop();
    settings = await api("config", undefined, "GET");
    telemetry = await api("state", undefined, "GET");
    regions = structuredClone(settings.data.profile?.regions || {});
    dirty = Boolean(
      reference &&
      JSON.stringify(reference) !==
        JSON.stringify(settings.data.profile?.reference),
    );
    fieldSettings();
    render();
    message(
      "Saved settings loaded. Connect the calibrated source or draw new regions.",
    );
  }
  $("field").onchange = fieldSettings;
  for (const key of ["mode", "scale", "threshold", "minScore"])
    $(key).onchange = () => {
      const roi = regions[$("field").value];
      if (roi) {
        roi[key] = key === "mode" ? $(key).value : +$(key).value;
        changed();
      }
    };
  $("devices").onclick = safe(devices);
  $("connect").onclick = safe(() => connect("camera"));
  $("screen").onclick = safe(() => connect("screen"));
  $("disconnect").onclick = safe(disconnect);
  $("stop").onclick = safe(stop);
  $("reload").onclick = safe(reload);
  $("remove").onclick = () => {
    delete regions[$("field").value];
    changed();
  };
  $("save").onclick = safe(async () => {
    await stop();
    const profile = M.validateProfile({ schemaVersion: 1, reference, regions });
    settings = await api("config", { profile }, "PUT", {
      "If-Match": settings.revision,
    });
    dirty = false;
    controls();
    message(
      "Calibration saved. Start preview and check readings against the game.",
    );
  });
  $("start").onclick = safe(async () => {
    await stop();
    telemetry = await api("state", undefined, "GET");
    const result = await api("session", {
      generation: telemetry.generation,
      expected: telemetry.context,
      reference,
    });
    sessionId = result.sessionId;
    telemetry = result.state;
    sequence = 0;
    running = true;
    render();
    message(
      "Preview running. Check raw crops and accepted readings before taking live.",
    );
    read();
  });
  $("live").onclick = safe(async () => {
    running = false;
    clearTimeout(timer);
    while (inFlight) await new Promise((resolve) => setTimeout(resolve, 50));
    if (!sessionId)
      throw new Error("Preview session stopped. Start preview again.");
    telemetry = await api("live", { sessionId });
    settings = await api("config", { source: "custom" }, "PUT", {
      "If-Match": settings.revision,
    });
    telemetry = await api("state", undefined, "GET");
    render();
    message("Custom OCR is live on scoreboardocr.html.");
    running = true;
    read();
  });
  $("legacy").onclick = safe(async () => {
    await stop();
    settings = await api("config", { source: "legacy" }, "PUT", {
      "If-Match": settings.revision,
    });
    telemetry = await api("state", undefined, "GET");
    render();
    message("Scoreboard output restored to FalseOCR.");
  });
  $("image").onchange = safe(async () => {
    const file = $("image").files[0];
    if (!file) return;
    await disconnect();
    const url = URL.createObjectURL(file),
      candidate = new Image();
    try {
      candidate.src = url;
      await candidate.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    image = candidate;
    reference = {
      width: image.naturalWidth,
      height: image.naturalHeight,
      kind: "image",
      sourceKey: file.name,
    };
    dirty = true;
    $("capture-info").textContent =
      `IMAGE TEST ONLY • ${reference.width} × ${reference.height}`;
    controls();
    message("Image sample loaded. Preview only; it cannot be taken live.");
  });
  function download(canvas, name) {
    if (!reference) return;
    const a = document.createElement("a");
    a.download = name;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }
  $("export-frame").onclick = () => {
    if (snapshot()) download(native, `ocr-native-${Date.now()}.png`);
  };
  $("export-crop").onclick = () =>
    download($("raw"), `ocr-${$("field").value}-raw-${Date.now()}.png`);
  window.addEventListener("pagehide", () => {
    running = false;
    stream?.getTracks().forEach((t) => t.stop());
    if (sessionId)
      fetch("/api/ocr/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      }).catch(() => {});
  });
  setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      telemetry = await api("state", undefined, "GET");
      if (sessionId && !telemetry.active) {
        running = false;
        sessionId = null;
      }
      render();
    } catch (e) {
      message(`Server unavailable: ${e.message}`, true);
    } finally {
      polling = false;
    }
  }, 1500);
  safe(async () => {
    await reload();
    if (navigator.mediaDevices) await devices();
    else
      message(
        "Open http://localhost:3000/ocr-control.html on the server PC to access OBS Virtual Camera.",
        true,
      );
  })();
  requestAnimationFrame(draw);
})();
