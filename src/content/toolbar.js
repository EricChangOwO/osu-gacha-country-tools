(function (OGCT) {
  const { ROOT_ID, state, saveSettings, collectGridItems, countCountries,
          isCountryMatch, formatCountryName } = OGCT;

  function mountToolbar(elements) {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
      // Static toolbar HTML — no user input is interpolated
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
        '    <button class="ogct-button" type="button" data-kind="ghost" data-ogct-control="copy-visible">Copy visible names</button>',
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
    const copyButton = root.querySelector('[data-ogct-control="copy-visible"]');

    groupToggle.addEventListener("change", async () => {
      state.settings.groupByCountry = groupToggle.checked;
      await saveSettings();
      OGCT.queueApply();
    });

    countrySelect.addEventListener("change", async () => {
      state.settings.selectedCountry = countrySelect.value;
      await saveSettings();
      OGCT.queueApply();
    });

    sortSelect.addEventListener("change", async () => {
      state.settings.sortBy = sortSelect.value;
      await saveSettings();
      OGCT.queueApply();
    });

    copyButton.addEventListener("click", async () => {
      await copyVisibleNames();
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
      OGCT.queueApply();
    });
    return chip;
  }

  // Summary HTML is built from internal state and escaped API data only — no raw user input
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

    if (state.isLoadingAll) {
      notes.push("loading remaining cards for this view...");
    }

    const nextSummaryHtml = notes.join(" \u00b7 ");
    if (summary.innerHTML !== nextSummaryHtml) {
      summary.innerHTML = nextSummaryHtml;
    }
  }

  async function copyVisibleNames() {
    const elements = OGCT.findElements();
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
    summary.innerHTML += " \u00b7 copied <strong>" + visibleItems.length + "</strong> name" + (visibleItems.length === 1 ? "" : "s");
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
