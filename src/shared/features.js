// What the current browser build supports (__BROWSER__ is set at build time).

// Safari has no downloads API, so the download UI is hidden there.
export const SUPPORTS_DOWNLOAD = __BROWSER__ !== "safari";
