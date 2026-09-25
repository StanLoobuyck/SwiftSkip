// Generates manifest.json for each browser from one shared base.

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

const CONTENT_SCRIPTS = [
  {
    matches: ["<all_urls>"],
    js: ["content.js"],
    css: ["style.css"],
    all_frames: true,
    run_at: "document_idle",
  },
];

export function buildManifest(target, { version, dev }) {
  const base = {
    name: dev ? "SwiftSkip (dev)" : "SwiftSkip",
    version,
    description: "Full keyboard controls for Toledo/Ultra recordings, plus Kaltura lecture downloads.",
    icons: ICONS,
    content_scripts: CONTENT_SCRIPTS,
  };

  switch (target) {
    // Firefox stays on MV2: its MV3 background is an event page that can be
    // suspended mid-download, while the MV2 page is persistent.
    case "firefox":
      return {
        manifest_version: 2,
        ...base,
        browser_specific_settings: {
          gecko: {
            id: "swiftskip@kuleuven",
            strict_min_version: "109.0",
            // SwiftSkip sends no data anywhere (required by addons.mozilla.org).
            data_collection_permissions: { required: ["none"] },
          },
        },
        permissions: ["activeTab", "storage", "downloads", "<all_urls>"],
        background: { scripts: ["background.js"], persistent: true },
        browser_action: ACTION,
      };

    case "chrome":
      return {
        manifest_version: 3,
        ...base,
        permissions: ["activeTab", "storage", "downloads", "offscreen"],
        host_permissions: ["<all_urls>"],
        background: { service_worker: "background.js" },
        action: ACTION,
      };

    case "safari":
      return {
        manifest_version: 3,
        ...base,
        permissions: ["activeTab", "storage"],
        host_permissions: ["<all_urls>"],
        background: { scripts: ["background.js"], persistent: false },
        action: ACTION,
      };

    default:
      throw new Error(`Unknown target "${target}"`);
  }
}
