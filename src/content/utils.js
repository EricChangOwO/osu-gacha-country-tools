window.OGCT = (function () {
  const ROOT_ID = "ogct-root";
  const GENERATED_ATTR = "data-ogct-generated";
  const REQUEST_TYPE = "ogct:fetch-collection";
  const RESPONSE_TYPE = "ogct:collection-response";
  const PROGRESS_TYPE = "ogct:collection-progress";
  const DELETE_REQUEST_TYPE = "ogct:delete-collection";
  const DELETE_RESPONSE_TYPE = "ogct:delete-collection-response";
  const SETTINGS_KEY = "ogct-settings";
  const STALE_COLLECTION_REFRESH_COOLDOWN_MS = 3000;
  const DEFAULT_SETTINGS = {
    collectionToolsEnabled: true,
    groupByCountry: true,
    selectedCountry: "ALL",
    sortBy: "rank",
    autoOpenPacks: false
  };
  const RARITY_ORDER = {
    mythic: 0,
    legendary: 1,
    epic: 2,
    rare: 3,
    uncommon: 4,
    common: 5
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    entriesByUserId: new Map(),
    totalInstances: 0,
    totalUniquePlayers: 0,
    apiCountryCounts: new Map(),
    bridgeInjected: false,
    pendingRequestId: null,
    applyTimer: null,
    domObserver: null,
    isApplying: false,
    isLoadingAll: false,
    isDeletingDuplicates: false,
    autoLoadedCollectionRoot: null,
    autoOpenPackIntervalId: null,
    lastStaleCollectionRefreshAt: 0
  };

  const regionNames = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatCountryName(code) {
    if (!code || code === "??") {
      return "Unknown";
    }

    const displayName = regionNames ? regionNames.of(code) : null;
    return displayName ? code + " \u00b7 " + displayName : code;
  }

  function getUserId(url) {
    const match = /\/users\/(\d+)/.exec(url || "");
    return match ? match[1] : null;
  }

  function extractUsername(link) {
    const firstLine = (link && link.textContent || "").split("\n").map((part) => part.trim()).find(Boolean);
    return firstLine || "Unknown";
  }

  function isGeneratedNode(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    return !!node.closest("#" + ROOT_ID) || node.hasAttribute(GENERATED_ATTR);
  }

  function waitFor(predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      function tick() {
        if (predicate()) {
          resolve();
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Timed out"));
          return;
        }

        window.setTimeout(tick, 120);
      }

      tick();
    });
  }

  async function loadSettings() {
    const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    if (!storage) {
      return { ...DEFAULT_SETTINGS };
    }

    const result = await storage.get(SETTINGS_KEY);
    return {
      ...DEFAULT_SETTINGS,
      ...(result[SETTINGS_KEY] || {})
    };
  }

  async function saveSettings() {
    const storage = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    if (!storage) {
      return;
    }

    await storage.set({
      [SETTINGS_KEY]: state.settings
    });
  }

  function findElements() {
    const collectionRoot = document.getElementById("tabs-content-collection");
    if (!collectionRoot) {
      return null;
    }

    const searchInput = collectionRoot.querySelector('input[placeholder="Search by name..."]');
    const grid = Array.from(collectionRoot.querySelectorAll("div.grid"))
      .find((element) => element.querySelector('a[href^="https://osu.ppy.sh/users/"]'));
    if (!searchInput || !grid) {
      return null;
    }

    const searchRow = searchInput.parentElement;
    const toolbarHost = searchRow ? searchRow.parentElement : null;
    if (!toolbarHost) {
      return null;
    }

    return {
      collectionRoot,
      searchInput,
      searchRow,
      toolbarHost,
      grid
    };
  }

  function collectGridItems(grid) {
    return Array.from(grid.children)
      .filter((child) => child instanceof HTMLElement)
      .filter((child) => child.querySelector('a[href^="https://osu.ppy.sh/users/"]'))
      .map((wrapper) => {
        const link = wrapper.querySelector('a[href^="https://osu.ppy.sh/users/"]');
        const userId = getUserId(link && link.href);
        const entry = userId ? state.entriesByUserId.get(userId) : null;
        const username = entry && entry.username
          ? entry.username
          : extractUsername(link);

        return {
          wrapper,
          link,
          userId,
          entry,
          username
        };
      });
  }

  function getMissingCollectionUserIds(grid) {
    return Array.from(new Set(
      collectGridItems(grid)
        .map((item) => item.userId)
        .filter((userId) => userId && !state.entriesByUserId.has(userId))
    ));
  }

  function countCountries(items) {
    return items.reduce((counts, item) => {
      const code = item.entry && item.entry.countryCode ? item.entry.countryCode : "??";
      counts.set(code, (counts.get(code) || 0) + 1);
      return counts;
    }, new Map());
  }

  function isCountryMatch(item, selectedCountry) {
    if (selectedCountry === "ALL") {
      return true;
    }

    return item.entry && item.entry.countryCode === selectedCountry;
  }

  function clearGeneratedNodes(grid) {
    Array.from(grid.querySelectorAll("[" + GENERATED_ATTR + "]")).forEach((node) => node.remove());
  }

  return {
    ROOT_ID,
    GENERATED_ATTR,
    REQUEST_TYPE,
    RESPONSE_TYPE,
    PROGRESS_TYPE,
    DELETE_REQUEST_TYPE,
    DELETE_RESPONSE_TYPE,
    SETTINGS_KEY,
    STALE_COLLECTION_REFRESH_COOLDOWN_MS,
    DEFAULT_SETTINGS,
    RARITY_ORDER,
    state,
    escapeHtml,
    formatCountryName,
    getUserId,
    extractUsername,
    isGeneratedNode,
    waitFor,
    loadSettings,
    saveSettings,
    findElements,
    collectGridItems,
    getMissingCollectionUserIds,
    countCountries,
    isCountryMatch,
    clearGeneratedNodes,
    queueApply: null
  };
})();
