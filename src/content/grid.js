(function (OGCT) {
  const { GENERATED_ATTR, RARITY_ORDER, state, collectGridItems, clearGeneratedNodes } = OGCT;

  function decorateGrid(elements) {
    const allItems = collectGridItems(elements.grid);
    clearGeneratedNodes(elements.grid);

    if (allItems.length === 0) {
      return;
    }

    allItems.forEach((item) => {
      item.wrapper.classList.add("ogct-card-visible");
      item.wrapper.style.order = "";
    });

    applyFlatOrder(allItems);
  }

  function applyFlatOrder(items) {
    sortItems(items).forEach((item, index) => {
      item.wrapper.style.order = String(index);
    });
  }

  function sortItems(items) {
    return [...items].sort((left, right) => {
      return compareFavoritePriority(left, right) || compareItems(left, right, state.settings.sortBy);
    });
  }

  function compareFavoritePriority(left, right) {
    if (!state.settings.favoritesFirst) {
      return 0;
    }

    const leftIsFavorite = state.favoriteUserIds.has(getItemUserId(left));
    const rightIsFavorite = state.favoriteUserIds.has(getItemUserId(right));

    if (leftIsFavorite === rightIsFavorite) {
      return 0;
    }

    return leftIsFavorite ? -1 : 1;
  }

  function getItemUserId(item) {
    return String(item.userId || (item.entry && item.entry.id) || "");
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
