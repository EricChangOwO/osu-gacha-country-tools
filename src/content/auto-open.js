(function (OGCT) {
  const { state, COLLECTION_FULL_TYPE, PACK_OPENED_TYPE } = OGCT;

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

    if (!state.packEventListener) {
      state.packEventListener = handlePackEvent;
      window.addEventListener("message", state.packEventListener);
    }

    const tick = () => {
      if (state.isAutoCleanRunning || state.autoCleanExhausted) {
        return;
      }
      tryClickOpenPack();
    };

    tick();
    state.autoOpenPackIntervalId = window.setInterval(tick, 1000);
  }

  function handlePackEvent(event) {
    if (event.source !== window || !event.data) {
      return;
    }

    if (event.data.type === PACK_OPENED_TYPE) {
      state.autoCleanExhausted = false;
      return;
    }

    if (event.data.type !== COLLECTION_FULL_TYPE) {
      return;
    }

    if (!state.settings.autoCleanCollection || !state.settings.autoOpenPacks) {
      return;
    }

    if (state.isAutoCleanRunning || state.autoCleanExhausted) {
      return;
    }

    console.log("[ogct] Collection full detected, starting auto-clean");
    OGCT.autoCleanCollection().then(function (result) {
      if (!result || result.deletedCards === 0) {
        console.log("[ogct] Auto-clean: no deletable cards found, pausing until next successful open");
        state.autoCleanExhausted = true;
        return;
      }
      console.log("[ogct] Auto-cleaned " + result.deletedCards + " card(s)");
    }).catch(function (error) {
      console.error("[ogct] Auto-clean failed, retrying in 30s", error);
      state.autoCleanExhausted = true;
      state.autoCleanRetryTimerId = window.setTimeout(function () {
        state.autoCleanExhausted = false;
      }, 30000);
    });
  }

  function stopAutoOpenPacks() {
    if (state.autoOpenPackIntervalId) {
      window.clearInterval(state.autoOpenPackIntervalId);
      state.autoOpenPackIntervalId = null;
    }

    if (state.packEventListener) {
      window.removeEventListener("message", state.packEventListener);
      state.packEventListener = null;
    }

    state.autoCleanExhausted = false;
    window.clearTimeout(state.autoCleanRetryTimerId);
    state.autoCleanRetryTimerId = null;
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
