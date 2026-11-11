(() => {
  const STAGES = ["reveal-blue", "reveal-red", "reveal-all"];
  const BLUE_DURATION = 4000;
  const RED_DURATION = 4000;

  let timers = [];

  function clearTimers() {
    timers.forEach(window.clearTimeout);
    timers = [];
  }

  function showStage(mainbox, stage) {
    mainbox.classList.remove(...STAGES);
    /* Force one clean frame so OBS renders every transition reliably. */
    void mainbox.offsetWidth;
    mainbox.classList.add(stage);
  }

  function playPostDraftReveal() {
    const mainbox = document.querySelector(".mainbox");
    if (!mainbox) return;

    clearTimers();
    mainbox.classList.add("reveal-ready");
    mainbox.classList.remove(...STAGES);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => showStage(mainbox, "reveal-blue"));
    });

    timers.push(
      window.setTimeout(() => showStage(mainbox, "reveal-red"), BLUE_DURATION),
      window.setTimeout(
        () => showStage(mainbox, "reveal-all"),
        BLUE_DURATION + RED_DURATION,
      ),
    );
  }

  document.addEventListener("DOMContentLoaded", playPostDraftReveal);

  /* Optional manual replay: call playPostDraftReveal() from the console/control script. */
  window.playPostDraftReveal = playPostDraftReveal;
})();
