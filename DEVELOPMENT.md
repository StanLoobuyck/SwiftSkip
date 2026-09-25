# Developing SwiftSkip

One codebase in `src/`, built into a separate extension per browser in `dist/`.
Never edit `dist/` — it is regenerated on every build.

## First time

```bash
npm install
```

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev:firefox` | Opens Zen (or Firefox) with the dev build loaded and the local test page open. Every save in `src/` rebuilds and reloads the extension. |
| `npm run dev:chrome` | Same in Chromium / Chrome / Brave (`sudo pacman -S chromium`). |
| `npm test` | Unit tests (playlist parsing, downloader, filenames, manifests). |
| `npm run lint` | Mozilla's checker on the Firefox build (same one addons.mozilla.org runs). |
| `npm run build` | Release builds for all browsers + zips in `web-ext-artifacts/`. |

The dev browsers use their own profiles in `.profiles/` that are kept between
runs: log in to Toledo there once and you can test on real lectures too.
The dev build is called **SwiftSkip (dev)** and, unlike the release build, also
runs on `localhost` so the test page works.

### The test page

`test/fixtures/index.html` (served at http://localhost:8123) is a stand-in for
a Toledo lecture: a 2-minute video with a clock on it for the keybinds, and an
HLS playlist request so the **Download Lecture** button appears.
`iframe.html` (linked from it) puts the player in an iframe like Toledo does,
for testing shortcuts pressed outside the player. The media is
generated with ffmpeg on first run (`npm run fixtures` to redo it).

### Debugging

- **Content script** (keybinds, overlay, download button): the page's normal
  devtools console (F12).
- **Background / downloads**: Firefox → `about:debugging` → SwiftSkip →
  *Inspect*. Chrome → `chrome://extensions` → SwiftSkip → *service worker*
  (and *offscreen.html* while a download runs).
- **Popup**: right-click inside the popup → *Inspect*.

## Layout

```
src/
  background/core.js      download state + message handling (all browsers)
  background/firefox.js   runs the download in the background page
  background/chrome.js    runs it in the offscreen document (MV3 worker can't make blobs)
  background/safari.js    downloads disabled (Safari has no downloads API)
  offscreen/              Chrome only
  content/                keybinds, on-screen overlay, download button
  popup/                  toolbar popup
  shared/                 code used in several places (settings, HLS parsing, downloader)
scripts/
  manifest.js             per-browser manifest.json
  build.js / dev.js       build + dev mode
test/                     npm test
```

`__BROWSER__` (`"firefox"`, `"chrome"`, `"safari"`) and `__DEV__` are
replaced at build time, for the rare place where the code has to differ.

| | Firefox | Chrome | Safari |
|---|---|---|---|
| Manifest | V2 (persistent background, so long downloads aren't cut off) | V3 | V3 |
| Downloads | background page | offscreen document | not supported |
| Also covers | Zen, LibreWolf, Waterfox | Edge, Brave, Opera, Vivaldi, Arc | — |

## Safari (needs a Mac with Xcode)

```bash
npm install
npm run build:safari
xcrun safari-web-extension-converter dist/safari \
  --project-location safari-xcode --app-name SwiftSkip \
  --bundle-identifier be.swiftskip.SwiftSkip --macos-only
```

Open the generated Xcode project and press ▶ Run. In Safari: *Settings →
Advanced → Show features for web developers*, then *Develop → Allow Unsigned
Extensions*, and enable SwiftSkip under *Settings → Extensions*.
Publishing in the App Store requires an Apple Developer account (€99/year).

## Using SwiftSkip in your own browser

Don't load anything from `dist/` into your everyday browser: that folder is
wiped and rebuilt by every `npm run dev:*` / build, which breaks an add-on
loaded from it.

- **Firefox / Zen (permanent):** `npm run sign` → drag the `.xpi` from
  `web-ext-artifacts/` into the browser. Needs AMO API keys in `.env`
  (see `scripts/sign.js`). Signed as *unlisted*: private, not on the store.
- **Chrome:** `npm run build`, unzip `web-ext-artifacts/swiftskip-chrome-*.zip`
  somewhere outside this project, and *Load unpacked* that folder.

## Releasing

1. Add a `## <version>` section to `CHANGELOG.md` (what friends will notice) and commit it.
2. `npm run release <version> --dry-run` — checks everything and builds, publishes nothing.
3. `npm run release <version>` — bumps the version, tests, builds, has Mozilla sign the
   Firefox build (keys in `.env`), tags and pushes, creates the GitHub Release
   (`swiftskip-firefox.xpi` + `swiftskip-chrome.zip`), and only then adds the version to
   `updates.json`, which Firefox/Zen installs check for automatic updates.

Every version number can be signed only once, so a failed release needs a new number
if Mozilla already accepted the upload.
