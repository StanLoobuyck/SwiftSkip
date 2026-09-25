// Chrome: the MV3 service worker can't create blob URLs, so the download runs
// in an offscreen document (src/offscreen/) and this worker only relays.

import { ext, saveFile, startBackground } from "./core.js";

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

let creatingOffscreenDocument = null;
let offscreenDocumentReady = false;

async function hasOffscreenDocument() {
  if (!ext.runtime.getContexts) {
    return false;
  }

  const documentUrl = ext.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const contexts = await ext.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl],
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (offscreenDocumentReady || (await hasOffscreenDocument())) {
    offscreenDocumentReady = true;
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = ext.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["BLOBS"],
      justification: "Create a local video blob from Kaltura HLS lecture segments.",
    });
  }

  try {
    await creatingOffscreenDocument;
    offscreenDocumentReady = true;
  } finally {
    creatingOffscreenDocument = null;
  }
}

startBackground({
  async runDownload(job) {
    await ensureOffscreenDocument();
    return ext.runtime.sendMessage({ action: "offscreenDownloadLecture", ...job });
  },

  async cancelDownload(jobId) {
    await ensureOffscreenDocument();
    return ext.runtime.sendMessage({ action: "offscreenCancelLectureDownload", jobId });
  },

  extraHandlers: {
    // The offscreen document has no downloads API, so it asks us to save.
    downloadGeneratedFile(msg) {
      return saveFile(msg.url, msg.title, msg.extension || "ts").then((downloadId) => ({
        ok: true,
        downloadId,
      }));
    },
  },
});
