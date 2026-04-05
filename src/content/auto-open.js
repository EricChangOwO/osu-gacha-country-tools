(function (OGCT) {
  const { state } = OGCT;

  function syncAutoOpenPacks() {
    if (state.settings.autoOpenPacks) {
      startAutoOpenPacks();
      return;
    }

    stopAutoOpenPacks();
  }

  function startAutoOpenPacks() {
    if (state.autoOpenPackIntervalId) {
      return;
    }

    const tick = () => {
      const clicked = tryClickOpenPack();
      if (clicked) {
        console.log("[ogct] Opened pack at", new Date().toLocaleTimeString());
      }
    };

    tick();
    state.autoOpenPackIntervalId = window.setInterval(tick, 1000);
  }

  function stopAutoOpenPacks() {
    if (!state.autoOpenPackIntervalId) {
      return;
    }

    window.clearInterval(state.autoOpenPackIntervalId);
    state.autoOpenPackIntervalId = null;
  }

  function tryClickOpenPack() {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) => {
      const text = candidate.textContent ? candidate.textContent.trim().toLowerCase() : "";
      return text === "open pack" || text === "open next pack";
    });

    if (!button || button.disabled) {
      return false;
    }

    button.click();
    return true;
  }

  OGCT.syncAutoOpenPacks = syncAutoOpenPacks;
})(window.OGCT);
