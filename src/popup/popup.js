const SETTINGS_KEY = "ogct-settings";
const DEFAULT_SETTINGS = {
  sortBy: "rank",
  autoOpenPacks: false,
  autoCleanCollection: false
};

const autoOpenPacksInput = document.getElementById("autoOpenPacks");
const autoCleanCollectionInput = document.getElementById("autoCleanCollection");
const statusElement = document.getElementById("status");

initialize().catch((error) => {
  console.error("[ogct-popup] Failed to initialize popup", error);
  setStatus("Failed to load settings.");
});

async function initialize() {
  const settings = await loadSettings();
  autoOpenPacksInput.checked = settings.autoOpenPacks;
  autoCleanCollectionInput.checked = settings.autoCleanCollection;
  renderStatus(settings);

  autoOpenPacksInput.addEventListener("change", async () => {
    const nextSettings = {
      ...settings,
      autoOpenPacks: autoOpenPacksInput.checked
    };

    await chrome.storage.local.set({
      [SETTINGS_KEY]: nextSettings
    });

    settings.autoOpenPacks = nextSettings.autoOpenPacks;
    renderStatus(settings);
  });

  autoCleanCollectionInput.addEventListener("change", async () => {
    const nextSettings = {
      ...settings,
      autoCleanCollection: autoCleanCollectionInput.checked
    };

    await chrome.storage.local.set({
      [SETTINGS_KEY]: nextSettings
    });

    settings.autoCleanCollection = nextSettings.autoCleanCollection;
    renderStatus(settings);
  });
}

async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[SETTINGS_KEY] || {})
  };
}

function setStatus(message) {
  statusElement.textContent = message;
}

function renderStatus(settings) {
  setStatus(settings.autoOpenPacks ? "Auto Open Packs is enabled." : "Ready.");
}
