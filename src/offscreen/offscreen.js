// Chrome only: runs the HLS download in an offscreen document, because the
// MV3 service worker can't create blob URLs. Progress and the final save go
// back to the service worker via messages.

import { cancelHlsDownload, runHlsDownload } from "../shared/downloader.js";

function onProgress(progress) {
  chrome.runtime.sendMessage({ action: "relayLectureDownloadProgress", ...progress });
}

async function saveFile(url, title, extension) {
  const response = await chrome.runtime.sendMessage({
    action: "downloadGeneratedFile",
    url,
    title,
    extension,
  });

  if (!response || !response.ok) {
    throw new Error(response && response.error ? response.error : "Chrome did not start the download.");
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) {
    return false;
  }

  if (msg.action === "offscreenCancelLectureDownload") {
    sendResponse(cancelHlsDownload(msg.jobId));
    return false;
  }

  if (msg.action !== "offscreenDownloadLecture") {
    return false;
  }

  runHlsDownload({
    url: msg.url,
    title: msg.title,
    tabId: msg.tabId,
    jobId: msg.jobId,
    onProgress,
    saveFile,
  })
    .then(sendResponse)
    .catch((error) => {
      const message = error && error.message ? error.message : String(error);
      console.error("SwiftSkip download failed:", error);
      sendResponse({ ok: false, error: message });
    });

  return true;
});
