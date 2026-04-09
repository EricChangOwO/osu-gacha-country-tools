(function () {
  const REQUEST_TYPE = "ogct:fetch-collection";
  const RESPONSE_TYPE = "ogct:collection-response";
  const PROGRESS_TYPE = "ogct:collection-progress";
  const DELETE_REQUEST_TYPE = "ogct:delete-collection";
  const DELETE_RESPONSE_TYPE = "ogct:delete-collection-response";
  const COLLECTION_FULL_TYPE = "ogct:collection-full";
  const PACK_OPENED_TYPE = "ogct:pack-opened";

  if (window.__OGCT_BRIDGE__) {
    return;
  }

  window.__OGCT_BRIDGE__ = true;

  // Intercept fetch to detect collection_full from /api/packs/open
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
    if (url.includes("/api/packs/open")) {
      if (response.ok) {
        window.postMessage({ type: PACK_OPENED_TYPE }, "*");
      } else {
        try {
          const cloned = response.clone();
          const body = await cloned.json();
          if (body && body.error === "collection_full") {
            window.postMessage({ type: COLLECTION_FULL_TYPE }, "*");
          }
        } catch (_) {}
      }
    }
    return response;
  };

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data) {
      return;
    }

    if (event.data.type === REQUEST_TYPE) {
      const requestId = event.data.requestId;

      try {
        const allEntries = [];
        let cursor = null;
        let firstPayload = null;
        let totalMatching = 0;

        const filter = event.data.filter || "all";

        for (let page = 0; page < 50; page++) {
          const params = new URLSearchParams({ filter });
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
            totalMatching = payload.totalMatching || 0;
          }

          const entries = Array.isArray(payload.entries) ? payload.entries : [];
          allEntries.push(...entries);

          window.postMessage({
            type: PROGRESS_TYPE,
            requestId,
            loaded: allEntries.length,
            total: totalMatching
          }, "*");

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
      return;
    }

    if (event.data.type !== DELETE_REQUEST_TYPE) {
      return;
    }

    const requestId = event.data.requestId;
    const deleteTargets = Array.isArray(event.data.deleteTargets) ? event.data.deleteTargets : [];

    try {
      const response = await window.fetch("/api/collection", {
        method: "DELETE",
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json"
        },
        body: JSON.stringify({ deleteTargets })
      });

      if (!response.ok) {
        throw new Error("Delete request failed with status " + response.status);
      }

      let payload = null;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        payload = await response.json();
      }

      window.postMessage(
        {
          type: DELETE_RESPONSE_TYPE,
          requestId,
          ok: true,
          payload
        },
        "*"
      );
    } catch (error) {
      window.postMessage(
        {
          type: DELETE_RESPONSE_TYPE,
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        },
        "*"
      );
    }
  });
})();
