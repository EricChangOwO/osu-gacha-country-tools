(function (OGCT) {
  const { GENERATED_ATTR, RARITY_ORDER, state, collectGridItems, clearGeneratedNodes,
          isCountryMatch, formatCountryName } = OGCT;

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

      const title = document.createElement("div");
      title.className = "ogct-country-title";
      title.textContent = formatCountryName(code);

      const meta = document.createElement("div");
      meta.className = "ogct-country-meta";
      meta.textContent = groupItems.length + " cards";

      header.append(title, meta);
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

  OGCT.decorateGrid = decorateGrid;
})(window.OGCT);
