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
      const response = await window.fetch("/api/collection", {
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error("Collection request failed with status " + response.status);
      }

      const payload = await response.json();
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId,
          ok: true,
          payload
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
