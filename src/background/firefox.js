// Firefox: the background page is a real (persistent) page, so the download
// runs right here.

import { reportProgress, saveFile, startBackground } from "./core.js";
import { cancelHlsDownload, runHlsDownload } from "../shared/downloader.js";

startBackground({
  runDownload: (job) => runHlsDownload({ ...job, onProgress: reportProgress, saveFile }),
  cancelDownload: cancelHlsDownload,
});
