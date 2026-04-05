(function () {
  const ROOT_ID = "ogct-root";
  const GENERATED_ATTR = "data-ogct-generated";
  const REQUEST_TYPE = "ogct:fetch-collection";
  const RESPONSE_TYPE = "ogct:collection-response";
  const SETTINGS_KEY = "ogct-settings";
  const STALE_COLLECTION_REFRESH_COOLDOWN_MS = 3000;
  const DEFAULT_SETTINGS = {
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
    autoOpenPackIntervalId: null,
    lastStaleCollectionRefreshAt: 0
  };

  const regionNames = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

  window.addEventListener("message", handleBridgeMessage);
  chrome.storage.onChanged.addListener(handleStorageChange);
  initialize().catch((error) => {
    console.error("[ogct] Initialization failed", error);
  });

  async function initialize() {
    state.settings = await loadSettings();
    injectBridge();
    syncAutoOpenPacks();
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

    if (node.matches("button") && /load more/i.test(node.textContent || "")) {
      return true;
    }

    return !!node.querySelector(
      'input[placeholder="Search by name..."], a[href^="https://osu.ppy.sh/users/"], div.grid'
    ) || !!Array.from(node.querySelectorAll("button")).find((button) => /load more/i.test(button.textContent || ""));
  }

  function injectBridge() {
    if (state.bridgeInjected || document.getElementById("ogct-page-bridge")) {
      state.bridgeInjected = true;
      return;
    }

    const script = document.createElement("script");
    script.id = "ogct-page-bridge";
    script.src = chrome.runtime.getURL("page-bridge.js");
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
      removeToolbar();
      return;
    }

    state.isApplying = true;

    try {
      await ensureCollectionData();
      await refreshCollectionDataIfStale(elements.grid);
      mountToolbar(elements);
      syncToolbarOptions(elements);
      decorateGrid(elements);
    } finally {
      state.isApplying = false;
    }
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

  async function ensureCollectionData(force) {
    if (!force && state.entriesByUserId.size > 0) {
      return;
    }

    const requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    state.pendingRequestId = requestId;

    const response = await new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (state.pendingRequestId === requestId) {
          state.pendingRequestId = null;
        }
        reject(new Error("Timed out waiting for collection data"));
      }, 6000);

      const listener = (event) => {
        if (event.source !== window || !event.data || event.data.type !== RESPONSE_TYPE || event.data.requestId !== requestId) {
          return;
        }

        window.removeEventListener("message", listener);
        window.clearTimeout(timeoutId);
        resolve(event.data);
      };

      window.addEventListener("message", listener);
      window.postMessage({ type: REQUEST_TYPE, requestId }, "*");
    });

    if (!response.ok) {
      throw new Error(response.error || "Collection data request failed");
    }

    const entries = Array.isArray(response.payload && response.payload.entries)
      ? response.payload.entries
      : [];

    state.entriesByUserId = new Map(entries.map((entry) => [String(entry.id), entry]));
    state.totalInstances = entries.length;
    state.totalUniquePlayers = state.entriesByUserId.size;
    state.apiCountryCounts = countCountries(
      Array.from(state.entriesByUserId.values()).map((entry) => ({ entry }))
    );
  }

  async function refreshCollectionDataIfStale(grid) {
    const missingUserIds = getMissingCollectionUserIds(grid);
    if (missingUserIds.length === 0) {
      return;
    }

    const now = Date.now();
    if (now - state.lastStaleCollectionRefreshAt < STALE_COLLECTION_REFRESH_COOLDOWN_MS) {
      return;
    }

    state.lastStaleCollectionRefreshAt = now;
    await ensureCollectionData(true);
  }

  function handleBridgeMessage(event) {
    if (event.source !== window || !event.data || event.data.type !== RESPONSE_TYPE) {
      return;
    }
  }

  function mountToolbar(elements) {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      root.innerHTML = [
        '<div class="ogct-panel">',
        '  <div class="ogct-row">',
        '    <span class="ogct-label">Country Tools</span>',
        '    <label class="ogct-toggle">',
        '      <input type="checkbox" data-ogct-control="group-toggle">',
        "      <span>Group by country</span>",
        "    </label>",
        '    <label class="ogct-inline">',
        '      <span class="ogct-label">Country</span>',
        '      <select class="ogct-select" data-ogct-control="country-select"></select>',
        "    </label>",
        '    <label class="ogct-inline">',
        '      <span class="ogct-label">Sort</span>',
        '      <select class="ogct-select" data-ogct-control="sort-select">',
        '        <option value="rank">Rank</option>',
        '        <option value="followers">Followers</option>',
        '        <option value="rarity">Rarity</option>',
        '        <option value="name">Name</option>',
        "      </select>",
        "    </label>",
        '    <button class="ogct-button" type="button" data-kind="primary" data-ogct-control="load-all">Load all cards</button>',
        '    <button class="ogct-button" type="button" data-kind="ghost" data-ogct-control="copy-visible">Copy visible names</button>',
        '    <button class="ogct-button" type="button" data-kind="ghost" data-ogct-control="reload-page">Reload page</button>',
        "  </div>",
        '  <div class="ogct-row ogct-summary" data-ogct-control="summary"></div>',
        '  <div class="ogct-row ogct-chip-list" data-ogct-control="chip-list"></div>',
        "</div>"
      ].join("");

      attachToolbarEvents(root);
    }

    if (root.parentElement !== elements.toolbarHost) {
      elements.searchRow.before(root);
    }

    root.dataset.totalUniquePlayers = String(state.totalUniquePlayers);
  }

  function attachToolbarEvents(root) {
    const groupToggle = root.querySelector('[data-ogct-control="group-toggle"]');
    const countrySelect = root.querySelector('[data-ogct-control="country-select"]');
    const sortSelect = root.querySelector('[data-ogct-control="sort-select"]');
    const loadAllButton = root.querySelector('[data-ogct-control="load-all"]');
    const copyButton = root.querySelector('[data-ogct-control="copy-visible"]');
    const reloadButton = root.querySelector('[data-ogct-control="reload-page"]');

    groupToggle.addEventListener("change", async () => {
      state.settings.groupByCountry = groupToggle.checked;
      await saveSettings();
      queueApply();
    });

    countrySelect.addEventListener("change", async () => {
      state.settings.selectedCountry = countrySelect.value;
      await saveSettings();
      queueApply();
    });

    sortSelect.addEventListener("change", async () => {
      state.settings.sortBy = sortSelect.value;
      await saveSettings();
      queueApply();
    });

    loadAllButton.addEventListener("click", async () => {
      await loadAllCards();
    });

    copyButton.addEventListener("click", async () => {
      await copyVisibleNames();
    });

    reloadButton.addEventListener("click", () => {
      window.location.reload();
    });
  }

  function syncToolbarOptions(elements) {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    const allItems = collectGridItems(elements.grid);
    const countryCounts = countCountries(allItems);
    const availableCodes = Array.from(countryCounts.keys()).sort((left, right) => {
      const countDelta = (countryCounts.get(right) || 0) - (countryCounts.get(left) || 0);
      return countDelta || formatCountryName(left).localeCompare(formatCountryName(right));
    });

    if (state.settings.selectedCountry !== "ALL" && !countryCounts.has(state.settings.selectedCountry)) {
      state.settings.selectedCountry = "ALL";
      saveSettings();
    }

    const groupToggle = root.querySelector('[data-ogct-control="group-toggle"]');
    const countrySelect = root.querySelector('[data-ogct-control="country-select"]');
    const sortSelect = root.querySelector('[data-ogct-control="sort-select"]');

    groupToggle.checked = state.settings.groupByCountry;
    sortSelect.value = state.settings.sortBy;

    const currentValue = state.settings.selectedCountry;
    const options = [
      { value: "ALL", label: "All loaded countries" }
    ].concat(
      availableCodes.map((code) => ({
        value: code,
        label: formatCountryName(code) + " (" + (countryCounts.get(code) || 0) + ")"
      }))
    );

    countrySelect.replaceChildren(...options.map((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      return element;
    }));
    countrySelect.value = currentValue;

    renderChips(root, availableCodes, countryCounts);
    renderSummary(root, allItems, countryCounts);
    updateLoadAllButton(root, elements.collectionRoot, allItems.length);
  }

  function renderChips(root, availableCodes, countryCounts) {
    const chipList = root.querySelector('[data-ogct-control="chip-list"]');
    const chipStates = [{
      code: "ALL",
      label: "All",
      active: state.settings.selectedCountry === "ALL"
    }].concat(
      availableCodes.slice(0, 12).map((code) => ({
        code,
        label: code + " " + (countryCounts.get(code) || 0),
        active: state.settings.selectedCountry === code
      }))
    );
    const nextSignature = JSON.stringify(chipStates);

    if (chipList.dataset.signature === nextSignature) {
      return;
    }

    chipList.replaceChildren(...chipStates.map((chipState) => createChip(chipState)));
    chipList.dataset.signature = nextSignature;
  }

  function createChip({ label, code, active }) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ogct-chip";
    chip.textContent = label;
    chip.classList.toggle("is-active", active);
    chip.addEventListener("click", async () => {
      state.settings.selectedCountry = code;
      await saveSettings();
      queueApply();
    });
    return chip;
  }

  function renderSummary(root, allItems, countryCounts) {
    const summary = root.querySelector('[data-ogct-control="summary"]');
    const visibleItems = allItems.filter((item) => isCountryMatch(item, state.settings.selectedCountry));
    const loadedUserIds = new Set(allItems.map((item) => item.userId).filter(Boolean));
    const selectedLabel = state.settings.selectedCountry === "ALL"
      ? "all loaded countries"
      : formatCountryName(state.settings.selectedCountry);

    const notes = [
      "<strong>" + visibleItems.length + "</strong> visible card" + (visibleItems.length === 1 ? "" : "s"),
      "in <strong>" + selectedLabel + "</strong>",
      "from <strong>" + allItems.length + "</strong> loaded card" + (allItems.length === 1 ? "" : "s"),
      "across <strong>" + countryCounts.size + "</strong> loaded countr" + (countryCounts.size === 1 ? "y" : "ies")
    ];

    if (state.totalUniquePlayers > allItems.length) {
      const selectedApiCount = state.settings.selectedCountry === "ALL"
        ? state.totalUniquePlayers
        : (state.apiCountryCounts.get(state.settings.selectedCountry) || 0);
      const selectedMissingCount = Math.max(selectedApiCount - visibleItems.length, 0);
      const totalMissingCount = Math.max(state.totalUniquePlayers - loadedUserIds.size, 0);
      const missingCount = state.settings.selectedCountry === "ALL"
        ? totalMissingCount
        : selectedMissingCount;

      if (missingCount > 0) {
        notes.push(
          "<strong>" + missingCount + "</strong> API player" + (missingCount === 1 ? "" : "s") +
          " not present in the current page view"
        );
      }
    }

    if (state.totalInstances > state.totalUniquePlayers) {
      notes.push(
        "API also reports <strong>" + state.totalInstances + "</strong> total instances" +
        " across <strong>" + state.totalUniquePlayers + "</strong> unique players"
      );
    }

    const nextSummaryHtml = notes.join(" · ");
    if (summary.innerHTML !== nextSummaryHtml) {
      summary.innerHTML = nextSummaryHtml;
    }
  }

  function updateLoadAllButton(root, collectionRoot, loadedCount) {
    const button = root.querySelector('[data-ogct-control="load-all"]');
    if (!button) {
      return;
    }

    const hasLoadMore = !!findLoadMoreButton(collectionRoot);
    let nextText = "";
    let nextDisabled = false;

    if (state.isLoadingAll) {
      nextDisabled = true;
      nextText = "Loading cards...";
    } else if (!hasLoadMore) {
      nextDisabled = true;
      if (state.totalUniquePlayers > loadedCount) {
        nextText = "Page view fully loaded (" + loadedCount + "/" + state.totalUniquePlayers + " API players)";
      } else {
        nextText = "All cards loaded for this view";
      }
    } else {
      nextDisabled = false;
      if (state.totalUniquePlayers > 0) {
        nextText = "Load all cards (" + loadedCount + "/" + state.totalUniquePlayers + ")";
      } else {
        nextText = "Load all cards";
      }
    }

    if (button.disabled !== nextDisabled) {
      button.disabled = nextDisabled;
    }

    if (button.textContent !== nextText) {
      button.textContent = nextText;
    }
  }

  function decorateGrid(elements) {
    const allItems = collectGridItems(elements.grid);
    clearGeneratedNodes(elements.grid);

    if (allItems.length === 0) {
      return;
    }

    allItems.forEach((item) => {
      item.wrapper.classList.add("ogct-card-visible");
      item.wrapper.classList.toggle("ogct-hidden", !isCountryMatch(item, state.settings.selectedCountry));
      item.wrapper.style.order = "";
    });

    const visibleItems = allItems.filter((item) => !item.wrapper.classList.contains("ogct-hidden"));
    if (visibleItems.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "ogct-empty";
      emptyState.setAttribute(GENERATED_ATTR, "empty");
      emptyState.textContent = "No loaded cards match the selected country in the current site view.";
      elements.grid.appendChild(emptyState);
      return;
    }

    if (state.settings.groupByCountry) {
      applyGroupedLayout(elements.grid, visibleItems);
      return;
    }

    applyFlatOrder(visibleItems);
  }

  function applyGroupedLayout(grid, items) {
    const groups = new Map();

    items.forEach((item) => {
      const code = item.entry && item.entry.countryCode ? item.entry.countryCode : "??";
      if (!groups.has(code)) {
        groups.set(code, []);
      }
      groups.get(code).push(item);
    });

    const orderedGroups = Array.from(groups.entries()).sort((left, right) => {
      const countDelta = right[1].length - left[1].length;
      return countDelta || formatCountryName(left[0]).localeCompare(formatCountryName(right[0]));
    });

    let order = 0;
    orderedGroups.forEach(([code, groupItems]) => {
      const header = document.createElement("div");
      header.className = "ogct-country-header";
      header.setAttribute(GENERATED_ATTR, "header");
      header.style.order = String(order++);
      header.innerHTML = [
        '<div class="ogct-country-title">' + escapeHtml(formatCountryName(code)) + "</div>",
        '<div class="ogct-country-meta">' + groupItems.length + " cards</div>"
      ].join("");
      grid.appendChild(header);

      sortItems(groupItems).forEach((item) => {
        item.wrapper.style.order = String(order++);
      });
    });
  }

  function applyFlatOrder(items) {
    sortItems(items).forEach((item, index) => {
      item.wrapper.style.order = String(index);
    });
  }

  function sortItems(items) {
    return [...items].sort((left, right) => compareItems(left, right, state.settings.sortBy));
  }

  function compareItems(left, right, mode) {
    if (mode === "followers") {
      return (
        (right.entry && right.entry.followerCount ? right.entry.followerCount : 0) -
        (left.entry && left.entry.followerCount ? left.entry.followerCount : 0)
      ) || compareItems(left, right, "rank");
    }

    if (mode === "rarity") {
      return (
        (RARITY_ORDER[left.entry && left.entry.rarity || "common"] ?? 99) -
        (RARITY_ORDER[right.entry && right.entry.rarity || "common"] ?? 99)
      ) || compareItems(left, right, "rank");
    }

    if (mode === "name") {
      return left.username.localeCompare(right.username) || compareItems(left, right, "rank");
    }

    const leftRank = left.entry && left.entry.followerRank ? left.entry.followerRank : Number.MAX_SAFE_INTEGER;
    const rightRank = right.entry && right.entry.followerRank ? right.entry.followerRank : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.username.localeCompare(right.username);
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

  async function loadAllCards() {
    const elements = findElements();
    if (!elements || state.isLoadingAll) {
      return;
    }

    state.isLoadingAll = true;
    queueApply();

    try {
      let safetyCounter = 30;

      while (safetyCounter-- > 0) {
        const button = findLoadMoreButton(elements.collectionRoot);
        if (!button || button.disabled) {
          break;
        }

        const beforeCount = collectGridItems(elements.grid).length;
        button.click();

        await waitFor(() => {
          const nextButton = findLoadMoreButton(elements.collectionRoot);
          const afterCount = collectGridItems(elements.grid).length;
          return afterCount > beforeCount || !nextButton || nextButton.disabled;
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
      .find((button) => /Load more/i.test(button.textContent || ""));
  }

  async function copyVisibleNames() {
    const elements = findElements();
    const root = document.getElementById(ROOT_ID);
    if (!elements || !root) {
      return;
    }

    const visibleItems = collectGridItems(elements.grid)
      .filter((item) => isCountryMatch(item, state.settings.selectedCountry))
      .map((item) => item.username)
      .filter(Boolean);

    if (visibleItems.length === 0) {
      return;
    }

    const text = visibleItems.join("\n");

    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
    }

    const summary = root.querySelector('[data-ogct-control="summary"]');
    summary.innerHTML += " · copied <strong>" + visibleItems.length + "</strong> name" + (visibleItems.length === 1 ? "" : "s");
  }

  function clearGeneratedNodes(grid) {
    Array.from(grid.querySelectorAll("[" + GENERATED_ATTR + "]")).forEach((node) => node.remove());
  }

  function removeToolbar() {
    const root = document.getElementById(ROOT_ID);
    if (root) {
      root.remove();
    }
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

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) {
      return;
    }

    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(changes[SETTINGS_KEY].newValue || {})
    };

    syncAutoOpenPacks();
    queueApply();
  }

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

  function getUserId(url) {
    const match = /\/users\/(\d+)/.exec(url || "");
    return match ? match[1] : null;
  }

  function extractUsername(link) {
    const firstLine = (link && link.textContent || "").split("\n").map((part) => part.trim()).find(Boolean);
    return firstLine || "Unknown";
  }

  function formatCountryName(code) {
    if (!code || code === "??") {
      return "Unknown";
    }

    const displayName = regionNames ? regionNames.of(code) : null;
    return displayName ? code + " · " + displayName : code;
  }

  function isGeneratedNode(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    return !!node.closest("#" + ROOT_ID) || node.hasAttribute(GENERATED_ATTR);
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
