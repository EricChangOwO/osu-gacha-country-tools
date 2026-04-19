(function (OGCT) {
  const { state, DEFAULT_SETTINGS, SETTINGS_KEY, RESPONSE_TYPE, PROGRESS_TYPE, GENERATED_ATTR,
          isGeneratedNode, waitFor, loadSettings, findElements, collectGridItems,
          clearGeneratedNodes } = OGCT;

  window.addEventListener("message", handleBridgeMessage);
  chrome.storage.onChanged.addListener(handleStorageChange);

  OGCT.queueApply = queueApply;

  initialize().catch((error) => {
    console.error("[ogct] Initialization failed", error);
  });

  async function initialize() {
    state.settings = await loadSettings();
    injectBridge();
    OGCT.syncAutoOpenPacks();
    queueApply();
    observePage();
  }

  function observePage() {
    if (state.domObserver) {
      state.domObserver.disconnect();
    }

    state.domObserver = new MutationObserver((mutations) => {
      if (mutations.length === 0 || state.isApplying) {
        return;
      }

      const collectionRoot = document.getElementById("tabs-content-collection");
      const hasRelevantChange = mutations.some((mutation) => isRelevantMutation(mutation, collectionRoot));

      if (hasRelevantChange) {
        queueApply();
      }
    });

    state.domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function isRelevantMutation(mutation, collectionRoot) {
    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];

    if (!collectionRoot) {
      return changedNodes.some((node) => containsCollectionRoot(node) || isCollectionStructureNode(node));
    }

    const target = mutation.target instanceof HTMLElement ? mutation.target : null;
    const touchesCollection = (
      target && collectionRoot.contains(target)
    ) || changedNodes.some((node) => isNodeInside(node, collectionRoot) || containsCollectionRoot(node));

    if (!touchesCollection) {
      return false;
    }

    return changedNodes.some((node) => isCollectionStructureNode(node));
  }

  function containsCollectionRoot(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    return node.id === "tabs-content-collection" || !!node.querySelector("#tabs-content-collection");
  }

  function isNodeInside(node, container) {
    return node instanceof HTMLElement && container.contains(node);
  }

  function isCollectionStructureNode(node) {
    if (!(node instanceof HTMLElement) || isGeneratedNode(node)) {
      return false;
    }

    if (
      node.matches('input[placeholder="Search by name..."]') ||
      node.matches('a[href^="https://osu.ppy.sh/users/"]') ||
      node.matches('div.grid')
    ) {
      return true;
    }

    if (node.matches("button") && /load more|show next/i.test(node.textContent || "")) {
      return true;
    }

    return !!node.querySelector(
      'input[placeholder="Search by name..."], a[href^="https://osu.ppy.sh/users/"], div.grid'
    ) || !!Array.from(node.querySelectorAll("button")).find((button) => /load more|show next/i.test(button.textContent || ""));
  }

  function injectBridge() {
    if (state.bridgeInjected || document.getElementById("ogct-page-bridge")) {
      state.bridgeInjected = true;
      return;
    }

    const script = document.createElement("script");
    script.id = "ogct-page-bridge";
    script.src = chrome.runtime.getURL("src/bridge/page-bridge.js");
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    state.bridgeInjected = true;
  }

  function queueApply() {
    window.clearTimeout(state.applyTimer);
    state.applyTimer = window.setTimeout(() => {
      applyEnhancements().catch((error) => {
        console.error("[ogct] Apply failed", error);
      });
    }, 120);
  }

  async function applyEnhancements() {
    const elements = findElements();
    if (!elements) {
      state.autoLoadedCollectionRoot = null;
      OGCT.removeToolbar();
      return;
    }

    state.isApplying = true;

    try {
      showLoadingProgress(elements, 0, 0);
      await OGCT.ensureCollectionData();
      await OGCT.refreshCollectionDataIfStale(elements.grid);
      removeLoadingProgress(elements);
      OGCT.mountToolbar(elements);
      OGCT.syncToolbarOptions(elements);
      OGCT.decorateGrid(elements);
      await maybeAutoLoadAllCards(elements);
    } finally {
      removeLoadingProgress(elements);
      state.isApplying = false;
    }
  }

  async function maybeAutoLoadAllCards(elements) {
    if (state.autoLoadedCollectionRoot !== elements.collectionRoot) {
      state.autoLoadedCollectionRoot = null;
    }

    if (state.autoLoadedCollectionRoot || state.isLoadingAll) {
      return;
    }

    if (!findLoadMoreButton(elements.collectionRoot)) {
      return;
    }

    state.autoLoadedCollectionRoot = elements.collectionRoot;
    await loadAllCards(elements);
  }

  async function loadAllCards(elements) {
    const activeElements = elements || findElements();
    if (!activeElements || state.isLoadingAll) {
      return;
    }

    state.isLoadingAll = true;
    queueApply();

    try {
      let safetyCounter = 30;

      while (safetyCounter-- > 0) {
        const button = findLoadMoreButton(activeElements.collectionRoot);
        if (!button || button.disabled) {
          break;
        }

        const beforeCount = collectGridItems(activeElements.grid).length;
        button.click();

        await waitFor(() => {
          const afterCount = collectGridItems(activeElements.grid).length;
          return afterCount > beforeCount;
        }, 3500);
      }
    } catch (error) {
      console.error("[ogct] Load all failed", error);
    } finally {
      state.isLoadingAll = false;
      queueApply();
    }
  }

  function findLoadMoreButton(collectionRoot) {
    return Array.from(collectionRoot.querySelectorAll("button"))
      .find((button) => /Load more|Show next/i.test(button.textContent || ""));
  }

  function resetCollectionEnhancements(elements) {
    removeLoadingProgress(elements);
    OGCT.removeToolbar();
    clearGeneratedNodes(elements.grid);

    collectGridItems(elements.grid).forEach((item) => {
      item.wrapper.classList.remove("ogct-hidden", "ogct-card-visible");
      item.wrapper.style.order = "";
    });

    state.autoLoadedCollectionRoot = null;
  }

  function showLoadingProgress(elements, loaded, total) {
    let bar = elements.toolbarHost.querySelector("[" + GENERATED_ATTR + '="progress"]');
    if (!bar) {
      bar = document.createElement("div");
      bar.setAttribute(GENERATED_ATTR, "progress");
      bar.className = "ogct-loading-bar";

      var track = document.createElement("div");
      track.className = "ogct-loading-track";
      var fill = document.createElement("div");
      fill.className = "ogct-loading-fill";
      track.appendChild(fill);

      var text = document.createElement("span");
      text.className = "ogct-loading-text";

      bar.appendChild(track);
      bar.appendChild(text);
      elements.toolbarHost.insertBefore(bar, elements.searchRow);
    }

    var pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    bar.querySelector(".ogct-loading-fill").style.width = pct + "%";
    bar.querySelector(".ogct-loading-text").textContent =
      total > 0 ? "Loading collection\u2026 " + loaded + " / " + total : "Loading collection\u2026";
  }

  function removeLoadingProgress(elements) {
    var bar = elements.toolbarHost.querySelector("[" + GENERATED_ATTR + '="progress"]');
    if (bar) {
      bar.remove();
    }
  }

  function handleBridgeMessage(event) {
    if (event.source !== window || !event.data) {
      return;
    }

    if (event.data.type === PROGRESS_TYPE) {
      if (!state.pendingRequestId || event.data.requestId !== state.pendingRequestId) {
        return;
      }

      var elements = findElements();
      if (elements) {
        showLoadingProgress(elements, event.data.loaded, event.data.total);
      }
      return;
    }

    if (event.data.type !== RESPONSE_TYPE) {
      return;
    }

    if (state.pendingRequestId && event.data.requestId === state.pendingRequestId) {
      var responseElements = findElements();
      if (responseElements) {
        removeLoadingProgress(responseElements);
      }
    }
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) {
      return;
    }

    var prev = state.settings;
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(changes[SETTINGS_KEY].newValue || {})
    };

    if (state.settings.autoCleanCollection !== prev.autoCleanCollection) {
      state.autoCleanExhausted = false;
      window.clearTimeout(state.autoCleanRetryTimerId);
      state.autoCleanRetryTimerId = null;
    }

    OGCT.syncAutoOpenPacks();
    queueApply();
  }
})(window.OGCT);
