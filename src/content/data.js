(function (OGCT) {
  const { state, REQUEST_TYPE, RESPONSE_TYPE, DELETE_REQUEST_TYPE, DELETE_RESPONSE_TYPE,
          getMissingCollectionUserIds,
          STALE_COLLECTION_REFRESH_COOLDOWN_MS } = OGCT;

  async function ensureCollectionData(force) {
    if (!force && state.entriesByUserId.size > 0) {
      return;
    }

    const requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    state.pendingRequestId = requestId;
    const favoriteResponsePromise = fetchCollectionEntries("favorites").catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }));

    const response = await new Promise((resolve, reject) => {
      let listener;
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("message", listener);
        if (state.pendingRequestId === requestId) {
          state.pendingRequestId = null;
        }
        reject(new Error("Timed out waiting for collection data"));
      }, 90000);

      listener = (event) => {
        if (event.source !== window || !event.data || event.data.type !== RESPONSE_TYPE || event.data.requestId !== requestId) {
          return;
        }

        if (state.pendingRequestId === requestId) {
          state.pendingRequestId = null;
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
    let favoriteEntries = [];

    try {
      const favoriteResponse = await favoriteResponsePromise;
      if (!favoriteResponse.ok) {
        throw new Error(favoriteResponse.error || "Favorites collection data request failed");
      }

      favoriteEntries = Array.isArray(favoriteResponse.payload && favoriteResponse.payload.entries)
        ? favoriteResponse.payload.entries
        : [];
    } catch (error) {
      console.warn("[ogct] Failed to load favorites for sorting", error);
    }

    state.entriesByUserId = new Map(entries.map((entry) => {
      const normalized = entry.card ? { ...entry.card, count: entry.count, shinyCount: entry.shinyCount } : entry;
      return [String(normalized.id), normalized];
    }));
    state.favoriteUserIds = new Set(favoriteEntries.map((entry) => {
      const favoriteEntry = entry.card ? entry.card : entry;
      return String(favoriteEntry.id);
    }));
    state.totalInstances = entries.length;
    state.totalUniquePlayers = state.entriesByUserId.size;
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

  async function deleteDuplicateNormalCards() {
    await ensureCollectionData();

    const deleteTargets = [];
    let deletedCards = 0;
    let affectedPlayers = 0;

    state.entriesByUserId.forEach((entry) => {
      const playerId = Number(entry && entry.id);
      const normalCount = Number(entry && entry.count) || 0;
      const duplicateCount = normalCount - 1;

      if (!playerId || duplicateCount <= 0) {
        return;
      }

      deleteTargets.push({
        playerId,
        isShiny: false,
        isSigned: false,
        quantity: duplicateCount
      });
      deletedCards += duplicateCount;
      affectedPlayers += 1;
    });

    if (deleteTargets.length === 0) {
      return {
        deleteTargets,
        deletedCards: 0,
        affectedPlayers: 0
      };
    }

    const requestId = "delete-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    const response = await new Promise((resolve, reject) => {
      let listener;
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("message", listener);
        reject(new Error("Timed out waiting for delete response"));
      }, 30000);

      listener = (event) => {
        if (event.source !== window || !event.data || event.data.type !== DELETE_RESPONSE_TYPE || event.data.requestId !== requestId) {
          return;
        }

        window.removeEventListener("message", listener);
        window.clearTimeout(timeoutId);
        resolve(event.data);
      };

      window.addEventListener("message", listener);
      window.postMessage({ type: DELETE_REQUEST_TYPE, requestId, deleteTargets }, "*");
    });

    if (!response.ok) {
      throw new Error(response.error || "Delete request failed");
    }

    resetCollectionState();

    return {
      deleteTargets,
      deletedCards,
      affectedPlayers
    };
  }

  function fetchCollectionEntries(filter) {
    var requestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    return new Promise(function (resolve, reject) {
      var listener;
      var timeoutId = window.setTimeout(function () {
        window.removeEventListener("message", listener);
        reject(new Error("Timed out waiting for " + filter + " collection data"));
      }, 90000);

      listener = function (event) {
        if (event.source !== window || !event.data || event.data.type !== RESPONSE_TYPE || event.data.requestId !== requestId) {
          return;
        }
        window.removeEventListener("message", listener);
        window.clearTimeout(timeoutId);
        resolve(event.data);
      };

      window.addEventListener("message", listener);
      window.postMessage({ type: REQUEST_TYPE, requestId: requestId, filter: filter }, "*");
    });
  }

  async function autoCleanCollection() {
    var BATCH_SIZE = 10;

    if (state.isAutoCleanRunning) {
      return null;
    }

    state.isAutoCleanRunning = true;

    try {
      var allResponse = await fetchCollectionEntries("all");
      if (!allResponse.ok) {
        throw new Error(allResponse.error || "Failed to fetch collection");
      }

      var favResponse = await fetchCollectionEntries("favorites");
      if (!favResponse.ok) {
        throw new Error(favResponse.error || "Failed to fetch favorites");
      }

      var allEntries = Array.isArray(allResponse.payload && allResponse.payload.entries)
        ? allResponse.payload.entries
        : [];
      var favEntries = Array.isArray(favResponse.payload && favResponse.payload.entries)
        ? favResponse.payload.entries
        : [];

      var favIds = new Set(favEntries.map(function (e) {
        return Number(e.card ? e.card.id : e.id);
      }));

      // Priority 1: non-favorite common cards (delete entirely)
      var candidates = [];
      allEntries.forEach(function (entry) {
        var card = entry.card || entry;
        var playerId = Number(card.id);
        var rarity = card.rarity || "common";
        var normalCount = Number(entry.count) || 0;
        if (!playerId || rarity !== "common" || normalCount <= 0 || favIds.has(playerId)) {
          return;
        }
        candidates.push({
          playerId: playerId,
          isShiny: false,
          isSigned: false,
          quantity: normalCount
        });
      });

      // Priority 2 fallback: non-favorite duplicate normal cards of any rarity (keep 1)
      if (candidates.length === 0) {
        allEntries.forEach(function (entry) {
          var card = entry.card || entry;
          var playerId = Number(card.id);
          var normalCount = Number(entry.count) || 0;
          var duplicateCount = normalCount - 1;
          if (!playerId || duplicateCount <= 0 || favIds.has(playerId)) {
            return;
          }
          candidates.push({
            playerId: playerId,
            isShiny: false,
            isSigned: false,
            quantity: duplicateCount
          });
        });
      }

      if (candidates.length === 0) {
        return { deletedCards: 0, deleteTargets: [] };
      }

      // Limit to BATCH_SIZE cards total
      var deleteTargets = [];
      var remaining = BATCH_SIZE;
      for (var i = 0; i < candidates.length && remaining > 0; i++) {
        var qty = Math.min(candidates[i].quantity, remaining);
        deleteTargets.push({
          playerId: candidates[i].playerId,
          isShiny: false,
          isSigned: false,
          quantity: qty
        });
        remaining -= qty;
      }

      var totalDeleted = deleteTargets.reduce(function (sum, t) { return sum + t.quantity; }, 0);

      var deleteRequestId = "delete-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      var deleteResponse = await new Promise(function (resolve, reject) {
        var deleteListener;
        var timeoutId = window.setTimeout(function () {
          window.removeEventListener("message", deleteListener);
          reject(new Error("Timed out waiting for delete response"));
        }, 30000);

        deleteListener = function (event) {
          if (event.source !== window || !event.data || event.data.type !== DELETE_RESPONSE_TYPE || event.data.requestId !== deleteRequestId) {
            return;
          }
          window.removeEventListener("message", deleteListener);
          window.clearTimeout(timeoutId);
          resolve(event.data);
        };

        window.addEventListener("message", deleteListener);
        window.postMessage({ type: DELETE_REQUEST_TYPE, requestId: deleteRequestId, deleteTargets: deleteTargets }, "*");
      });

      if (!deleteResponse.ok) {
        throw new Error(deleteResponse.error || "Auto-clean delete failed");
      }

      // Invalidate cached collection data
      resetCollectionState();

      return { deletedCards: totalDeleted, deleteTargets: deleteTargets };
    } finally {
      state.isAutoCleanRunning = false;
    }
  }

  function resetCollectionState() {
    state.entriesByUserId = new Map();
    state.favoriteUserIds = new Set();
    state.totalInstances = 0;
    state.totalUniquePlayers = 0;
    state.lastStaleCollectionRefreshAt = 0;
  }

  OGCT.ensureCollectionData = ensureCollectionData;
  OGCT.refreshCollectionDataIfStale = refreshCollectionDataIfStale;
  OGCT.deleteDuplicateNormalCards = deleteDuplicateNormalCards;
  OGCT.autoCleanCollection = autoCleanCollection;
})(window.OGCT);
