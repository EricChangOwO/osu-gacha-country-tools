(function (OGCT) {
  const { ROOT_ID, state, saveSettings, collectGridItems } = OGCT;
  const TOOLBAR_STRUCTURE_VERSION = "3";
  const REQUIRED_CONTROLS = [
    "sort-select",
    "favorites-first-toggle",
    "copy-visible",
    "delete-duplicates",
    "summary"
  ];

  function mountToolbar(elements) {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
    }

    ensureToolbarStructure(root);
    attachToolbarEvents(root);

    if (root.parentElement !== elements.toolbarHost) {
      elements.searchRow.before(root);
    }

    root.dataset.totalUniquePlayers = String(state.totalUniquePlayers);
  }

  function getToolbarMarkup() {
    return [
      '<div class="ogct-panel">',
      '  <div class="ogct-row">',
      '    <span class="ogct-label">Collection Tools</span>',
      '    <label class="ogct-inline">',
      '      <span class="ogct-label">Sort</span>',
      '      <select class="ogct-select" data-ogct-control="sort-select">',
      '        <option value="rank">Rank</option>',
      '        <option value="followers">Followers</option>',
      '        <option value="rarity">Rarity</option>',
      '        <option value="name">Name</option>',
      "      </select>",
      "    </label>",
      '    <label class="ogct-toggle">',
      '      <input type="checkbox" data-ogct-control="favorites-first-toggle">',
      "      <span>Favorites first</span>",
      "    </label>",
      '    <button class="ogct-button" type="button" data-kind="ghost" data-ogct-control="copy-visible">Copy visible names</button>',
      '    <button class="ogct-button" type="button" data-kind="danger" data-ogct-control="delete-duplicates">Delete duplicate normal cards</button>',
      "  </div>",
      '  <div class="ogct-row ogct-summary" data-ogct-control="summary"></div>',
      "</div>"
    ].join("");
  }

  function ensureToolbarStructure(root) {
    const hasAllControls = REQUIRED_CONTROLS.every((control) => (
      !!root.querySelector('[data-ogct-control="' + control + '"]')
    ));

    if (root.dataset.ogctStructureVersion === TOOLBAR_STRUCTURE_VERSION && hasAllControls) {
      return;
    }

    root.innerHTML = getToolbarMarkup();
    root.dataset.ogctStructureVersion = TOOLBAR_STRUCTURE_VERSION;
    delete root.dataset.ogctEventsBound;
  }

  function attachToolbarEvents(root) {
    if (root.dataset.ogctEventsBound === "1") {
      return;
    }

    const sortSelect = root.querySelector('[data-ogct-control="sort-select"]');
    const favoritesFirstToggle = root.querySelector('[data-ogct-control="favorites-first-toggle"]');
    const copyButton = root.querySelector('[data-ogct-control="copy-visible"]');
    const deleteDuplicatesButton = root.querySelector('[data-ogct-control="delete-duplicates"]');

    if (!sortSelect || !favoritesFirstToggle || !copyButton || !deleteDuplicatesButton) {
      return;
    }

    sortSelect.addEventListener("change", async () => {
      state.settings.sortBy = sortSelect.value;
      await saveSettings();
      OGCT.queueApply();
    });

    favoritesFirstToggle.addEventListener("change", async () => {
      state.settings.favoritesFirst = favoritesFirstToggle.checked;
      await saveSettings();
      OGCT.queueApply();
    });

    copyButton.addEventListener("click", async () => {
      await copyVisibleNames();
    });

    deleteDuplicatesButton.addEventListener("click", async () => {
      await deleteDuplicateNormalCards(deleteDuplicatesButton);
    });

    root.dataset.ogctEventsBound = "1";
  }

  function syncToolbarOptions(elements) {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    ensureToolbarStructure(root);
    attachToolbarEvents(root);

    const allItems = collectGridItems(elements.grid);
    const sortSelect = root.querySelector('[data-ogct-control="sort-select"]');
    const favoritesFirstToggle = root.querySelector('[data-ogct-control="favorites-first-toggle"]');
    const deleteDuplicatesButton = root.querySelector('[data-ogct-control="delete-duplicates"]');
    const duplicatePlan = getDuplicateNormalDeletePlan();

    sortSelect.value = state.settings.sortBy;
    favoritesFirstToggle.checked = !!state.settings.favoritesFirst;
    deleteDuplicatesButton.disabled = state.isDeletingDuplicates || duplicatePlan.deletedCards === 0;
    deleteDuplicatesButton.textContent = state.isDeletingDuplicates
      ? "Deleting..."
      : (
        duplicatePlan.deletedCards > 0
          ? "Delete duplicate normal cards (" + duplicatePlan.deletedCards + ")"
          : "No duplicate normal cards"
      );

    renderSummary(root, allItems);
  }

  function renderSummary(root, allItems) {
    const summary = root.querySelector('[data-ogct-control="summary"]');

    const notes = [
      "<strong>" + allItems.length + "</strong> loaded card" + (allItems.length === 1 ? "" : "s")
    ];

    if (state.totalUniquePlayers > allItems.length) {
      const missingCount = Math.max(state.totalUniquePlayers - allItems.length, 0);
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

    if (state.isLoadingAll) {
      notes.push("loading remaining cards for this view...");
    }

    const nextSummaryHtml = notes.join(" \u00b7 ");
    if (summary.innerHTML !== nextSummaryHtml) {
      summary.innerHTML = nextSummaryHtml;
    }
  }

  function getDuplicateNormalDeletePlan() {
    let deletedCards = 0;
    let affectedPlayers = 0;
    const playerDetails = [];

    state.entriesByUserId.forEach((entry) => {
      const normalCount = Number(entry && entry.count) || 0;
      if (normalCount <= 1) {
        return;
      }

      const duplicateCount = normalCount - 1;
      deletedCards += duplicateCount;
      affectedPlayers += 1;
      playerDetails.push({
        playerId: Number(entry.id),
        username: entry.username || ("ID " + entry.id),
        totalNormal: normalCount,
        deleting: duplicateCount
      });
    });

    return {
      deletedCards,
      affectedPlayers,
      playerDetails
    };
  }

  async function copyVisibleNames() {
    const elements = OGCT.findElements();
    const root = document.getElementById(ROOT_ID);
    if (!elements || !root) {
      return;
    }

    const visibleItems = collectGridItems(elements.grid)
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
    summary.innerHTML += " \u00b7 copied <strong>" + visibleItems.length + "</strong> name" + (visibleItems.length === 1 ? "" : "s");
  }

  async function deleteDuplicateNormalCards(button) {
    const deletePlan = getDuplicateNormalDeletePlan();
    if (deletePlan.deletedCards === 0 || state.isDeletingDuplicates) {
      return;
    }

    const playerLines = deletePlan.playerDetails
      .sort((a, b) => b.deleting - a.deleting)
      .map((p) => "  " + p.username + ": " + p.totalNormal + " cards -> delete " + p.deleting)
      .join("\n");

    const confirmed = window.confirm(
      "Delete " + deletePlan.deletedCards + " duplicate normal card" + (deletePlan.deletedCards === 1 ? "" : "s") +
      " across " + deletePlan.affectedPlayers + " player" + (deletePlan.affectedPlayers === 1 ? "" : "s") + "?\n\n" +
      "Players affected:\n" + playerLines + "\n\n" +
      "This keeps 1 normal card per player and does not touch shiny or signed cards."
    );
    if (!confirmed) {
      return;
    }

    state.isDeletingDuplicates = true;
    button.disabled = true;
    button.textContent = "Deleting...";

    try {
      const result = await OGCT.deleteDuplicateNormalCards();
      if (result.deletedCards === 0) {
        window.alert("No duplicate normal cards were found.");
        return;
      }

      const deletedLines = result.deleteTargets
        .sort((a, b) => b.quantity - a.quantity)
        .map((t) => {
          const entry = deletePlan.playerDetails.find((p) => p.playerId === t.playerId);
          const name = entry ? entry.username : ("ID " + t.playerId);
          return "  " + name + ": deleted " + t.quantity;
        })
        .join("\n");

      window.alert(
        "Deleted " + result.deletedCards + " duplicate normal card" + (result.deletedCards === 1 ? "" : "s") +
        " across " + result.affectedPlayers + " player" + (result.affectedPlayers === 1 ? "" : "s") + ".\n\n" +
        "Players:\n" + deletedLines + "\n\n" +
        "The page will now reload to sync the updated collection."
      );
      window.location.reload();
    } catch (error) {
      window.alert("Failed to delete duplicate normal cards: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      state.isDeletingDuplicates = false;
      const elements = OGCT.findElements();
      if (elements) {
        syncToolbarOptions(elements);
      }
    }
  }

  function removeToolbar() {
    const root = document.getElementById(ROOT_ID);
    if (root) {
      root.remove();
    }
  }

  OGCT.mountToolbar = mountToolbar;
  OGCT.syncToolbarOptions = syncToolbarOptions;
  OGCT.removeToolbar = removeToolbar;
})(window.OGCT);
