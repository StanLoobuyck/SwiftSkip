# SwiftSkip - Installation Guide (English)

## Overview

SwiftSkip is a powerful Chrome/Edge/Firefox extension that provides full keyboard control for video playback on the Toledo/Ultra platforms used at KU Leuven.

**Features:**
- Skip videos (forward/backward)
- Adjust volume
- Change playback speed
- Mute/unmute
- Fullscreen control
- Seek to position
- Fully customizable keybindings

---

## Installation

### Chrome Installation

#### Step 1: Download the package
1. Navigate to the extension download location
2. Download the SwiftSkip package
3. Extract it to a folder of your choice

#### Step 2: Open Chrome Extensions
1. Open **Google Chrome**
2. Click the menu in the top-right
3. Go to **More tools** → **Extensions**
4. Or open directly: `chrome://extensions/`

#### Step 3: Enable Developer Mode
- Toggle **"Developer mode"** on (top-right corner)

#### Step 4: Load the extension
1. Click **"Load unpacked"** (top-left area)
2. Navigate to the SwiftSkip folder
3. Select the folder and click **"Select Folder"**
4. The extension now appears in your list

Done! - SwiftSkip is now active in Chrome

---

### Edge Installation

#### Step 1: Download the package
1. Navigate to the extension download location
2. Download the SwiftSkip package
3. Extract it to a folder of your choice

#### Step 2: Open Edge Extensions
1. Open **Microsoft Edge**
2. Click the menu in the top-right
3. Go to **Extensions** → **Manage extensions**
4. Or open directly: `edge://extensions/`

#### Step 3: Enable Developer Mode
- Toggle **"Developer mode"** on (bottom-left corner)

#### Step 4: Load the extension
1. Click **"Load unpacked"** (left side)
2. Navigate to the SwiftSkip folder
3. Select the folder and click **"Select folder"**
4. The extension now appears in your list

Done! - SwiftSkip is now active in Edge

---

### Firefox Installation

#### Step 1: Download the package
1. Navigate to the extension download location
2. Download the SwiftSkip package
3. Extract it to a folder of your choice

#### Step 2: Open Firefox Add-ons Screen
1. Open **Mozilla Firefox**
2. Click the **hamburger menu** in the top-right
3. Go to **Add-ons and themes**
4. Or open directly: `about:addons`

#### Step 3: Open Debugging Settings
2. Click the **gear icon** in the top-right
2. Select **"Debug Add-ons"**
3. Or open directly: `about:debugging#/runtime/this-firefox`

#### Step 4: Load the extension
1. Click **"Load Temporary Add-on..."**
2. Navigate to the SwiftSkip folder
3. Select the **`manifest.json`** file
4. Click **"Select"**
5. The extension now appears in your Add-ons list

Note: In Firefox, you must reload the extension each time you restart Firefox, as it loads as "temporary". For permanent installation, use Firefox ESR or the alternative method.

Done! - SwiftSkip is now active in Firefox

---

## Keyboard Shortcuts

| Action | Key | Customizable |
|--------|-----|--------------|
| Skip forward | `→` | Yes |
| Skip backward | `←` | Yes |
| Play/Pause | `Space` / `K` | Yes |
| Volume up | `↑` | Yes |
| Volume down | `↓` | Yes |
| Speed up | `]` or `$` | Yes |
| Speed down | `[` or `^` | Yes |
| Reset speed | `R` | Yes |
| Mute/Unmute | `M` | Yes |
| Fullscreen | `F` | Yes |
| Seek to 0%-90% | `0`-`9` | Yes |

---

## Configuration

### Customize Keybindings

1. Click the **extension icon** in your browser
2. Click the **gear icon** (⚙️) next to "Keybinds"
3. Click on a keybinding you want to change
4. Press your desired new key
5. Click **"Done"** when finished

### Reset to Defaults

All keybindings can be reset to their default values by re-installing the extension or clearing your browser's storage.

---

## Troubleshooting

### Extension not working on Toledo/Ultra

**Make sure:**
- You are on a Toledo or Ultra platform (kuleuven.cloud or kuleuven.be)
- The extension is enabled in your browser settings
- No content blocking is interfering (check console)

### Keyboard commands not working

1. Verify the page has an **active video element**
2. Ensure focus is NOT on a **text input field**
3. Try disabling and re-enabling the extension

### Firefox: Extension stops working after restart

This is normal behavior for temporarily loaded add-ons in Firefox. You can:
- **A)** Reload the extension via `about:debugging`
- **B)** Use Firefox ESR for permanent installation

---

## License

SwiftSkip is open source under the [MIT license](LICENSE). It is an independent student project, not affiliated with, endorsed by or supported by KU Leuven.

---

## Questions or Feedback?

Please contact support or report issues through the support channel.

Enjoy SwiftSkip!
