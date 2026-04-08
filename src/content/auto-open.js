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
        if (state.settings.autoCleanCollection) {
          window.clearTimeout(state.pendingAutoCleanTimerId);
          state.pendingAutoCleanTimerId = window.setTimeout(maybeAutoClean, 3000);
        }
      }
    };

    tick();
    state.autoOpenPackIntervalId = window.setInterval(tick, 1000);
  }

  function maybeAutoClean() {
    if (!state.settings.autoCleanCollection || !state.settings.autoOpenPacks) {
      return;
    }
    OGCT.autoCleanCollection().then(function (result) {
      if (!result || result.deletedCards === 0) {
        return;
      }
      console.log("[ogct] Auto-cleaned " + result.deletedCards + " card(s) (" + result.deleteTargets.length + " players)");
    }).catch(function (error) {
      console.error("[ogct] Auto-clean failed", error);
    });
  }

  function stopAutoOpenPacks() {
    if (!state.autoOpenPackIntervalId) {
      return;
    }

    window.clearInterval(state.autoOpenPackIntervalId);
    state.autoOpenPackIntervalId = null;
    window.clearTimeout(state.pendingAutoCleanTimerId);
    state.pendingAutoCleanTimerId = null;
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
