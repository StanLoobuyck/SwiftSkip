# SwiftSkip privacy policy

_Last updated: 26 September 2026_

**In short: SwiftSkip collects no personal data and sends nothing to the developer or anyone else.** There are no accounts, no analytics and no tracking.

## What SwiftSkip stores

Everything stays in your own browser's extension storage:

| What | Where | Why |
|---|---|---|
| Your settings (on/off, skip interval, speed steps, shortcuts, remembered speed) | Browser sync storage (synced between your own browsers only if you use your browser's sync) | So your settings are the same everywhere |
| Resume positions: a lecture's ID (e.g. its Kaltura entry ID) and where you stopped | Local storage on this device | "Continue where you left off". Removed after about four months, or immediately with *Forget saved positions* in the settings |

Lecture titles and download progress are kept in memory only while the browser is open.

## Network requests

SwiftSkip only makes network requests when **you** download a lecture. It then fetches that recording from the same servers your browser already uses to play it (Kaltura). Nothing is sent anywhere else.

## Permissions

| Permission | Why SwiftSkip needs it |
|---|---|
| Access to `kuleuven.be`, `kuleuven.cloud` and `kaltura.com` | To add keyboard shortcuts, the on-screen overlay and the download button to lecture recordings |
| Access to other sites (optional) | Only for sites you enable yourself from the SwiftSkip popup; you can remove them in the settings |
| `storage` | To save your settings and resume positions (see above) |
| `downloads` | To save a lecture you chose to download |
| `scripting` | To run on sites you enabled, and to start working in open tabs right after an install or update |
| `activeTab` | So the popup can see which site you're on, to offer "Enable on this site" |
| `offscreen` (Chrome only) | To assemble a downloaded lecture into one video file |

## Downloaded recordings

Lecture recordings belong to their makers. Only download recordings you're allowed to watch, keep them for your own study, and don't share them.

## Contact

Questions or concerns: open an issue at https://github.com/StanLoobuyck/SwiftSkip/issues.

SwiftSkip is an independent student project, not affiliated with, endorsed by or supported by KU Leuven.
