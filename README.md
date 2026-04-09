<a id="readme-top"></a>

<div align="center">

# osu!gacha Country Tools

A Chrome extension for `gacha.miz.to` that adds country grouping, country filters, favorites-aware sorting, collection cleanup tools, and optional pack-opening automation.

</div>

## Table of Contents

1. [About The Project](#about-the-project)
2. [Preview](#preview)
3. [Features](#features)
4. [Getting Started](#getting-started)
5. [Installation](#installation)
6. [Usage](#usage)
7. [Roadmap](#roadmap)
8. [License](#license)
9. [Acknowledgments](#acknowledgments)

## About The Project

`gacha.miz.to` already exposes useful collection data such as country codes, rarity, follower count, rank, and favorites, but the default UI is limited when you want to browse your collection by country, prioritize favorite players, or automate repetitive pack-opening and cleanup actions.

This extension improves the site without replacing its existing UI. It keeps the original cards and controls intact, then layers additional tooling on top of the collection and pull pages.

## Preview

The screenshot below shows the collection page grouped by country, with the `TW · Taiwan` section displayed as a clean card grid instead of a flat mixed list.

<div align="center">
  <img src="assets/collection-country-view.png" alt="Preview of the Taiwan country section in osu!gacha Country Tools" width="100%">
</div>

## Features

- Group collection cards by country inside the existing grid
- Filter loaded cards by country from a dropdown or quick country chips
- Sort cards by rank, followers, rarity, or name
- Push favorites to the top with a `Favorites first` toggle
- Automatically load the full collection when the collection page opens
- Show collection loading progress while additional pages are being fetched
- Copy currently visible usernames
- Delete duplicate normal cards from the collection toolbar
- Popup toggles for `Collection Tools`, `Auto Open Packs`, and `Auto Clean Collection`
- Auto-clean non-favorite duplicate and common cards when the collection becomes full
- Persistent settings via Chrome storage

### Built With

- Manifest V3
- Vanilla JavaScript
- Chrome Extension APIs
- Existing `gacha.miz.to` page DOM and `/api/collection`

## Getting Started

This project does not need a build step. You can load it directly as an unpacked Chrome extension.

### Prerequisites

- Google Chrome or another Chromium-based browser
- Access to `https://gacha.miz.to/`
- A downloaded or cloned copy of this repository

## Installation

### Option 1: Download the latest Release ZIP

This is the easiest GitHub-based install flow for most users.

1. Open the [Releases](https://github.com/EricChangOwO/osu-gacha-country-tools/releases) page.
2. Download the latest `osu-gacha-country-tools-*.zip` asset.
3. Extract the ZIP to a normal folder.
4. Open `chrome://extensions/`.
5. Enable `Developer mode`.
6. Click `Load unpacked`.
7. Select the extracted project folder.

Important:
- You cannot install this directly from a `.zip` file.
- Chrome requires the folder to be extracted first for `Load unpacked`.

### Option 2: Clone the repository

```bash
git clone https://github.com/EricChangOwO/osu-gacha-country-tools.git
```

Then load the cloned folder in `chrome://extensions/` with `Load unpacked`.

### Option 3: Install from the Chrome Web Store

You can also install the published version from the Chrome Web Store:

- [osu!gacha Country Tools](https://chromewebstore.google.com/detail/osugacha-country-tools/kgdofhmjceoeadfjfgadmnckdielmnho)

Important:
- Chrome Web Store releases may update more slowly than GitHub Releases, because new versions need to pass store review before they go live.
- If you want the newest changes immediately, use the GitHub Release ZIP or clone the repository and load it unpacked.

## Usage

### Collection Page

- Make sure `Collection Tools` is enabled in the extension popup.
- Use the injected toolbar above the search box.
- Opening the collection page automatically loads the full current collection view.
- While more collection pages are loading, the toolbar shows loading progress instead of staying blank.
- Toggle `Group by country` to insert country section headers into the existing grid.
- Pick a country from the dropdown or quick chips.
- Change sorting with `Rank`, `Followers`, `Rarity`, or `Name`.
- Turn on `Favorites first` to keep favorite players ahead of the normal sort order.
- Click `Copy visible names` to copy the usernames currently visible on screen.
- Click `Delete duplicate normal cards` to remove duplicate normal cards directly from the collection page.

### Extension Popup

- Click the extension icon in Chrome.
- `Collection Tools` shows or hides the collection toolbar on the collection page.
- Turn on `Auto Open Packs`.
- On the pull page, the extension will check once per second for:
  - `Open Pack`
  - `Open Next Pack`
- If the button exists and is enabled, it clicks it automatically.
- Turn on `Auto Clean Collection` if you also want cleanup automation.
- `Auto Clean Collection` requires `Auto Open Packs` and only runs after the site reports `collection_full`.
- Auto-clean removes non-favorite duplicate cards first, then falls back to non-favorite common cards when needed.

### Notes

- Country grouping uses the site's own collection data, not OCR or screenshot parsing.
- Favorites-aware sorting uses the site's own favorites collection data.
- The extension works against the current page view. If the site has not rendered a player into the DOM yet, the extension cannot visually place that card until the site loads it.
- After editing extension files locally, reload the extension in `chrome://extensions/` before testing again.

## Roadmap

- Add export options such as CSV or JSON
- Add country stats summaries in the popup
- Add optional favorites-only and rarity-only quick filters
- Add safer review and dry-run options for cleanup actions

## License

This project is released under the WTFPL (`Do What The Fuck You Want To Public License`).

You can do whatever you want with it. See [LICENSE](LICENSE) for the full text.

## Acknowledgments

- [Best README Template](https://github.com/othneildrew/Best-README-Template)
- [gacha.miz.to](https://gacha.miz.to/)
- [flag-icons](https://github.com/lipis/flag-icons)
