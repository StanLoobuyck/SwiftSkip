// Generates manifest.json for each browser from one shared base.

import { OPTIONAL_HOSTS, REQUIRED_HOSTS } from "../src/shared/sites.js";

const ICONS = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

const ACTION = {
  default_popup: "popup.html",
  default_title: "SwiftSkip",
  default_icon: ICONS,
};

// Dev builds also run on the local test pages (npm run dev:*).
const DEV_HOSTS = ["http://localhost/*", "http://127.0.0.1/*"];

export function buildManifest(target, { version, dev }) {
  const hosts = dev ? [...REQUIRED_HOSTS, ...DEV_HOSTS] : REQUIRED_HOSTS;
  const base = {
    name: dev ? "SwiftSkip (dev)" : "SwiftSkip",
    version,
    description: "Keyboard shortcuts, resume, speed memory and downloads for Toledo and other Kaltura lecture recordings.",
    icons: ICONS,
    // Sites the user enables later are registered at runtime (background/sites.js).
    content_scripts: [
      {
        matches: hosts,
        js: ["content.js"],
        css: ["style.css"],
        all_frames: true,
        run_at: "document_idle",
      },
    ],
    options_ui: { page: "options.html", open_in_tab: true },
  };
  // activeTab: the popup may read the current tab's address (to offer
  // "Enable on this site"). scripting: register/inject on enabled sites.
  const permissions = ["activeTab", "storage", "scripting"];

  switch (target) {
    // Firefox stays on MV2: its MV3 background is an event page that can be
    // suspended mid-download, while the MV2 page is persistent.
    case "firefox":
      return {
        manifest_version: 2,
        ...base,
        browser_specific_settings: {
          gecko: {
            id: "swiftskip@stanloobuyck.github.io",
            strict_min_version: "109.0",
            // SwiftSkip sends no data anywhere (required by addons.mozilla.org).
            data_collection_permissions: { required: ["none"] },
          },
        },
        permissions: [...permissions, "downloads", ...hosts],
        optional_permissions: OPTIONAL_HOSTS,
        background: { scripts: ["background.js"], persistent: true },
        browser_action: ACTION,
      };

    case "chrome":
      return {
        manifest_version: 3,
        ...base,
        permissions: [...permissions, "downloads", "offscreen"],
        host_permissions: hosts,
        optional_host_permissions: OPTIONAL_HOSTS,
        background: { service_worker: "background.js" },
        action: ACTION,
      };

    case "safari":
      return {
        manifest_version: 3,
        ...base,
        permissions,
        host_permissions: hosts,
        optional_host_permissions: OPTIONAL_HOSTS,
        background: { scripts: ["background.js"], persistent: false },
        action: ACTION,
      };

    default:
      throw new Error(`Unknown target "${target}"`);
  }
}
