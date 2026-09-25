# SwiftSkip — guide

SwiftSkip makes Toledo (Kaltura) lecture recordings nicer to watch:

- **Keyboard shortcuts** to skip, pause, speed up/slow down, change the volume … — even without clicking in the player first
- **Continue where you left off** when you reopen a lecture
- **Remembers your playback speed**
- **Download lectures** as `.mp4`, with a clear name (course – lecture – date)

Works in **Zen, Firefox, LibreWolf** and **Chrome, Edge, Brave, Opera, Vivaldi, Arc**.

---

## Installing

### Zen, Firefox or LibreWolf (recommended: updates itself)

1. Download **[swiftskip-firefox.xpi](https://github.com/StanLoobuyck/SwiftSkip/releases/latest/download/swiftskip-firefox.xpi)**.
2. Open `about:addons`, click the **gear** (⚙) → **Install Add-on From File…** and choose the downloaded file. (Dragging the file into the window works too.)
3. Click **Add**.

New versions are then installed **automatically**.

### Chrome, Edge, Brave, Opera, Vivaldi or Arc

1. Download **[swiftskip-chrome.zip](https://github.com/StanLoobuyck/SwiftSkip/releases/latest/download/swiftskip-chrome.zip)** and unzip it into a folder you'll **keep** (e.g. `Documents/SwiftSkip`). Deleting the folder removes the extension.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right; in Edge on the left).
4. Click **Load unpacked** and choose the unzipped folder.

**Updating:** Chrome doesn't update this by itself. For a new version, download the zip again, unzip it **over the same folder**, and click the **reload icon** (↻) on SwiftSkip in `chrome://extensions`.

### Pin the icon

Click the **puzzle piece** next to the address bar and pin SwiftSkip. Its menu lets you download the lecture, change the speed and open the settings.

---

## Using it

Open a lecture recording in Toledo. Press **`?`** to see every shortcut.

| Action | Keys |
|--------|------|
| Play / pause | `Space` or `K` |
| Skip back / forward | `←` / `→` (5, 10, 15 or 30 s) |
| Slower / faster | `[` / `]` or `<` / `>` (on AZERTY also `^` / `$`) |
| Normal speed | `R` |
| Volume down / up | `↓` / `↑` |
| Mute | `M` |
| Fullscreen | `F` |
| Jump to 0% – 90% | `0` – `9` (on AZERTY without Shift too) |
| Show all shortcuts | `?` |

**Downloading:** click **Download** at the top left of the player (or in the icon's menu). **‹** collapses the button into a small circle; during a download the circle shows the progress.

### Settings

Click the icon → **Settings**:

- **Language** — English or Dutch; *Automatic* follows your browser
- **Skip interval** and **speed steps** (0.25× or 0.1×, from 0.25× to 4×)
- **Remember playback speed** and **Continue where you left off**
- **Keyboard shortcuts** — click a key to change it (up to two keys per action, also with Shift/Ctrl/Alt)
- **Sites** — SwiftSkip always works on Toledo and in Kaltura players; turn it on elsewhere with **Enable on …** in the icon's menu

---

## Troubleshooting

**Shortcuts do nothing**
- Is SwiftSkip on? (switch in the icon's menu)
- Typing in a text field? Shortcuts are deliberately off there.
- Reload the page once.

**No download button**
- Play the recording for a few seconds; the button appears once the video has loaded.

**The icon isn't visible (Zen)**
- Zen sometimes hides the extensions button. In `about:config`, set `zen.theme.hide-unified-extensions-button` to `false`, then pin SwiftSkip.

**Something else?** Report it on [GitHub](https://github.com/StanLoobuyck/SwiftSkip/issues), or via SwiftSkip's menu → Settings → *Report a problem*.

---

SwiftSkip is an independent, open-source student project ([MIT license](LICENSE)). It is not affiliated with, endorsed by or supported by KU Leuven, and collects no data ([privacy](PRIVACY.md)). Downloaded recordings are for your personal study only — please don't share them.
