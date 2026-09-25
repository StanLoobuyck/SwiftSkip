# SwiftSkip roadmap

Goal: a version (v4.0) that is reliable on 2-hour lectures, safe to install,
listed in the Firefox and Chrome stores, and easy to share with students.

Suggested order: **0 → 3 (permissions + Firefox ID) → 1 → 2 / 4 / 5 → 6**.
Items marked 🔍 first need a look at a real Toledo lecture page.

## Phase 0 — Foundation

- [x] Dev script: fall back to a free port when 8123 is taken, stop cleanly on errors
- [x] Code on GitHub (`StanLoobuyck/SwiftSkip`), old zips replaced by GitHub Releases
- [x] CI: tests + lint + build on every push
- [x] Release workflow: pushing a `v*` tag builds the zips and attaches them to a GitHub Release
- [x] `LICENSE` (MIT)

## Phase 1 — Downloads that hold up on real lectures

- [x] Download button and on-screen overlay positioned over the player, not the window (test page / non-iframe players)
- [x] Don't keep the whole lecture in RAM (store segments as Blobs so the browser can page them to disk)
- [ ] 🔍 Check memory use on a real 2-hour lecture
- [x] Output `.mp4` instead of `.ts` (remux with mux.js; falls back to `.ts` if that fails)
- [x] Retry failed segments (3× with backoff) and fetch 4 in parallel
- [x] Clear error message instead of saving a useless `.m3u8`
- [x] ~~🔍 Detect both streams (camera + slides)~~ — checked on a real lecture: Kaltura serves camera + slides as **one** composited video, so the download already contains both
- [x] Filename from the Toledo page: `<course> - <lecture title (date)>.mp4`
- [x] Per-tab download state; several downloads at once; speed + time remaining

## Phase 2 — Playback controls

- [x] Keybind changes apply to all open tabs immediately
- [x] Keybinds with modifiers (Shift/Ctrl/Alt), up to two per action; `K` is a normal, rebindable keybind
- [x] "Reset to defaults" button and conflict handling in the keybind editor
- [x] ~~🔍 Dual-stream sync~~ — not needed: camera + slides are one video
- [x] Resume where you left off, per lecture ("Resumed at 1:05 · Start over")
- [x] Remember preferred playback speed
- [x] Speed steps of 0.25× (or 0.1×), from 0.25× up to 4×
- [x] `?` shows a shortcut overlay on the video
- [x] Shortcuts work with focus outside the player (forwarded to the player iframe)
- [x] AZERTY: `^`/`$` and the unshifted number row work like `[`/`]` and `0`–`9`
- [x] New minimal popup (lecture + download, speed, skip) and a full settings page
- [x] Light/dark follows the system

## Phase 3 — Security, privacy, permissions

- [ ] 🔍 Replace `<all_urls>` with KU Leuven + Kaltura domains only
- [x] Remove `innerHTML` usage (3 lint warnings)
- [ ] Privacy policy (no data is collected or sent)
- [x] New Firefox add-on ID that doesn't suggest an official KU Leuven product (`swiftskip@stanloobuyck.github.io`; fixed once signed)
- [x] "Not affiliated with KU Leuven" disclaimer in the READMEs
- [ ] Check KU Leuven's rules on lecture recordings; add a "personal study use only" note
- [x] Filenames: tabs/newlines in titles become spaces, not `_`

## Phase 4 — UX & languages

- [ ] Dutch + English (`_locales/`, follows browser language)
- [x] Options page for settings/keybinds (instead of the cramped popup)
- [ ] Welcome page on first install
- [x] Popup shows what was detected for the current tab
- [ ] After an update, open Toledo tabs need a refresh in Chrome — inject into open tabs on update (needs `scripting` permission)
- [x] Light/dark follows the system
- [ ] Full keyboard + screen-reader pass over popup and settings page

## Phase 5 — Testing & code quality

- [ ] Unit tests for key matching and speed steps (split out of `content.js`)
- [ ] Playwright end-to-end tests on the test page, in CI
- [ ] Sanitized real Kaltura page as a test fixture
- [ ] ESLint + Prettier

## Phase 6 — Publishing

- [x] `npm run sign`: Mozilla-signed unlisted .xpi for permanent install in your own Firefox/Zen
- [ ] Firefox Add-ons (free) — also covers Zen, LibreWolf
- [ ] Chrome Web Store ($5 once) — also Brave, Opera, Vivaldi, Arc
- [ ] Edge Add-ons (free, same zip as Chrome)
- [ ] README / small site with GIF demo and install buttons
- [ ] "Report a problem" link to GitHub Issues in the popup
- [ ] `CHANGELOG.md`, semantic versioning
- [ ] Safari — later (needs a Mac + €99/year Apple Developer account)
