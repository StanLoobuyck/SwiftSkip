// Safari: no downloads API, so lecture downloads are disabled (the content
// script and popup hide the download UI). Keybinds work as everywhere else.

import { startBackground } from "./core.js";

startBackground({
  runDownload: async () => ({
    ok: false,
    error: "Lecture downloads are not supported in Safari yet.",
    errorCode: "errSafari",
    errorParams: {},
  }),
  cancelDownload: async () => ({ ok: true, canceled: false }),
});
