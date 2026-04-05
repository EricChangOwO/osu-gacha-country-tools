(function (OGCT) {
  const { state, REQUEST_TYPE, RESPONSE_TYPE, countCountries, getMissingCollectionUserIds,
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

  OGCT.ensureCollectionData = ensureCollectionData;
  OGCT.refreshCollectionDataIfStale = refreshCollectionDataIfStale;
})(window.OGCT);
