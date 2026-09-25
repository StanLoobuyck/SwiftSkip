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

- [ ] Don't keep the whole lecture in RAM (store segments as Blobs so the browser can page them to disk)
- [ ] Output `.mp4` instead of `.ts` (remux with mux.js)
- [ ] Retry failed segments (3× with backoff) and fetch ~4 in parallel
- [ ] Clear error message instead of saving a useless `.m3u8`
- [ ] 🔍 Detect both streams (camera + slides) and let the user choose
- [ ] Filename from the Toledo breadcrumb: course – lecture – date
- [ ] Per-tab download state; several downloads at once; speed + time remaining

## Phase 2 — Playback controls

- [ ] Keybind changes apply to all open tabs immediately
- [ ] Keybinds with modifiers (Shift/Ctrl/Alt); `K` becomes a normal, rebindable keybind
- [ ] "Reset to defaults" button and conflict warning in the keybind editor
- [ ] 🔍 Dual-stream lectures: apply speed/seek to every video so they stay in sync
- [ ] Resume where you left off, per lecture
- [ ] Remember preferred playback speed
- [ ] Finer speed steps (0.1×, up to 4×)
- [ ] `?` shows a shortcut overlay on the video

## Phase 3 — Security, privacy, permissions

- [ ] 🔍 Replace `<all_urls>` with KU Leuven + Kaltura domains only
- [ ] Remove `innerHTML` usage (3 lint warnings)
- [ ] Privacy policy (no data is collected or sent)
- [ ] New Firefox add-on ID that doesn't suggest an official KU Leuven product (before first store release — can't change after)
- [ ] Check KU Leuven's rules on lecture recordings; add a "personal study use only" note
- [ ] Filenames: tabs/newlines in titles become spaces, not `_`

## Phase 4 — UX & languages

- [ ] Dutch + English (`_locales/`, follows browser language)
- [ ] Options page for settings/keybinds (instead of the cramped popup)
- [ ] Welcome page on first install
- [ ] Popup shows what was detected for the current tab
- [ ] Light/dark follows the system; keyboard + screen-reader accessible popup

## Phase 5 — Testing & code quality

- [ ] Unit tests for key matching and speed steps (split out of `content.js`)
- [ ] Playwright end-to-end tests on the test page, in CI
- [ ] Sanitized real Kaltura page as a test fixture
- [ ] ESLint + Prettier

## Phase 6 — Publishing

- [ ] Firefox Add-ons (free) — also covers Zen, LibreWolf
- [ ] Chrome Web Store ($5 once) — also Brave, Opera, Vivaldi, Arc
- [ ] Edge Add-ons (free, same zip as Chrome)
- [ ] README / small site with GIF demo and install buttons
- [ ] "Report a problem" link to GitHub Issues in the popup
- [ ] `CHANGELOG.md`, semantic versioning
- [ ] Safari — later (needs a Mac + €99/year Apple Developer account)
