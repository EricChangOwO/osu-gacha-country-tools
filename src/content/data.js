(function (OGCT) {
  const { state, REQUEST_TYPE, RESPONSE_TYPE, DELETE_REQUEST_TYPE, DELETE_RESPONSE_TYPE,
          countCountries, getMissingCollectionUserIds,
          STALE_COLLECTION_REFRESH_COOLDOWN_MS } = OGCT;

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
      }, 90000);

      const listener = (event) => {
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

    state.entriesByUserId = new Map(entries.map((entry) => {
      const normalized = entry.card ? { ...entry.card, count: entry.count, shinyCount: entry.shinyCount } : entry;
      return [String(normalized.id), normalized];
    }));
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
      const timeoutId = window.setTimeout(() => {
        reject(new Error("Timed out waiting for delete response"));
      }, 30000);

      const listener = (event) => {
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

    state.entriesByUserId = new Map();
    state.totalInstances = 0;
    state.totalUniquePlayers = 0;
    state.apiCountryCounts = new Map();
    state.lastStaleCollectionRefreshAt = 0;

    return {
      deleteTargets,
      deletedCards,
      affectedPlayers
    };
  }

  OGCT.ensureCollectionData = ensureCollectionData;
  OGCT.refreshCollectionDataIfStale = refreshCollectionDataIfStale;
  OGCT.deleteDuplicateNormalCards = deleteDuplicateNormalCards;
})(window.OGCT);
