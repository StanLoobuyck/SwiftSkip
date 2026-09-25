// One handle for the WebExtension API. Firefox and Safari expose `browser`
// (promise-based everywhere); Chrome only has `chrome` (promise-based in MV3).
export const ext = globalThis.browser ?? globalThis.chrome;
