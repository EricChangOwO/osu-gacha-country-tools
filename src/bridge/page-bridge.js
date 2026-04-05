(function () {
  const REQUEST_TYPE = "ogct:fetch-collection";
  const RESPONSE_TYPE = "ogct:collection-response";

  if (window.__OGCT_BRIDGE__) {
    return;
  }

  window.__OGCT_BRIDGE__ = true;

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.type !== REQUEST_TYPE) {
      return;
    }

    const requestId = event.data.requestId;

    try {
      const allEntries = [];
      let cursor = null;
      let firstPayload = null;

      for (let page = 0; page < 50; page++) {
        const params = new URLSearchParams({ filter: "all" });
        if (cursor) {
          params.set("cursorPlayerId", cursor.playerId);
          params.set("cursorSortRank", cursor.sortRank);
          params.set("cursorVariantSort", cursor.variantSort);
        }

        const response = await window.fetch("/api/collection?" + params, {
          credentials: "include"
        });

        if (!response.ok) {
          throw new Error("Collection request failed with status " + response.status);
        }

        const payload = await response.json();

        if (!firstPayload) {
          firstPayload = payload;
        }

        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        allEntries.push(...entries);

        if (!payload.nextCursor || entries.length === 0) {
          break;
        }

        cursor = payload.nextCursor;
      }

      firstPayload.entries = allEntries;
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId,
          ok: true,
          payload: firstPayload
        },
        "*"
      );
    } catch (error) {
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        },
        "*"
      );
    }
  });
})();
