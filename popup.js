const SETTINGS_KEY = "ogct-settings";
const DEFAULT_SETTINGS = {
  groupByCountry: true,
  selectedCountry: "ALL",
  sortBy: "rank",
  autoOpenPacks: false
};

const autoOpenPacksInput = document.getElementById("autoOpenPacks");
const statusElement = document.getElementById("status");

initialize().catch((error) => {
  console.error("[ogct-popup] Failed to initialize popup", error);
  setStatus("Failed to load settings.");
});

async function initialize() {
  const settings = await loadSettings();
  autoOpenPacksInput.checked = settings.autoOpenPacks;
  setStatus(settings.autoOpenPacks ? "Auto Open Packs is enabled." : "Auto Open Packs is disabled.");

  autoOpenPacksInput.addEventListener("change", async () => {
    const nextSettings = {
      ...settings,
      autoOpenPacks: autoOpenPacksInput.checked
    };

    await chrome.storage.local.set({
      [SETTINGS_KEY]: nextSettings
    });

    settings.autoOpenPacks = nextSettings.autoOpenPacks;
    setStatus(settings.autoOpenPacks ? "Auto Open Packs is enabled." : "Auto Open Packs is disabled.");
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
