# SwiftSkip roadmap

Goal: a version (v4.0) that is reliable on 2-hour lectures, safe to install,
and easy to share with a small group of friends (10–20 people). No public
store listings: see Phase 6.

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

- [x] Downloads also work from Kaltura CDNs SwiftSkip has no access to (retry without cookies)
- [x] Replace `<all_urls>` with KU Leuven + Kaltura domains; other sites opt-in per site from the popup (optional permission)
- [x] Remove `innerHTML` usage (3 lint warnings)
- [x] Privacy policy (PRIVACY.md, linked from the settings page)
- [x] New Firefox add-on ID that doesn't suggest an official KU Leuven product (`swiftskip@stanloobuyck.github.io`; fixed once signed)
- [x] "Not affiliated with KU Leuven" disclaimer in the READMEs
- [x] "Personal study use only" note (README, settings page, privacy policy)
- [x] KU Leuven's rules (OER art. 99): decided to keep downloads as is — private use + friends only, with the "personal study only" note
- [x] Filenames: tabs/newlines in titles become spaces, not `_`

## Phase 4 — UX & languages

- [x] Dutch + English; "Automatic" follows the browser, or pick one in Settings (both bundled, switchable live)
- [x] Errors and download phases translated too (error codes instead of English text)
- [x] Options page for settings/keybinds (instead of the cramped popup)
- [x] Welcome page on first install (how it works + pin the icon), with a language switch
- [x] Popup shows what was detected for the current tab
- [x] After an install/update, SwiftSkip starts in already-open tabs (no refresh needed)
- [x] Light/dark follows the system
- [x] Accessibility: keyboard-operable radio groups (arrow keys), progressbar/alert/live-region roles, labelled controls, WCAG AA contrast, "reduce motion" respected

## Phase 5 — Testing & code quality

- [ ] Unit tests for key matching and speed steps (split out of `content.js`)
- [ ] Playwright end-to-end tests on the test page, in CI
- [ ] Sanitized real Kaltura page as a test fixture
- [ ] ESLint + Prettier

## Phase 6 — Sharing with friends (no public stores)

- [x] `npm run sign`: Mozilla-signed unlisted .xpi for permanent install in Firefox/Zen
- [x] Firefox/Zen: automatic updates via a self-hosted `update_url` (`updates.json` in the repo)
- [x] `npm run release <version>`: GitHub Release with the signed .xpi + Chrome zip (fixed "latest" download links)
- [x] Install guides for friends (README_NL.md / README_EN.md)
- [ ] Optional: Chrome Web Store *unlisted* ($5 once) for automatic Chrome updates
- [x] `CHANGELOG.md`, semantic versioning
- [x] "Report a problem" link (Settings → About)
- [ ] Safari — only if a friend needs it (needs a Mac + €99/year Apple Developer account)
