import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseBestVariant,
  isLectureManifestUrl,
  parseAttributes,
  parseMediaPlaylist,
} from "../src/shared/hls.js";

const BASE = "https://cdn.example.com/p/1/playManifest/a.m3u8";

test("parseAttributes handles quoted values containing commas", () => {
  const attrs = parseAttributes('#EXT-X-STREAM-INF:BANDWIDTH=800000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720');
  assert.equal(attrs.BANDWIDTH, "800000");
  assert.equal(attrs.CODECS, "avc1.4d401f,mp4a.40.2");
  assert.equal(attrs.RESOLUTION, "1280x720");
});

test("chooseBestVariant picks the highest bandwidth and resolves relative URLs", () => {
  const master = [
    "#EXTM3U",
    "#EXT-X-STREAM-INF:BANDWIDTH=400000",
    "low/index.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=2500000",
    "high/index.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=1200000",
    "mid/index.m3u8",
  ].join("\n");
  const best = chooseBestVariant(master, BASE);
  assert.equal(best.bandwidth, 2500000);
  assert.equal(best.url, "https://cdn.example.com/p/1/playManifest/high/index.m3u8");
});

test("chooseBestVariant returns null for a media playlist", () => {
  assert.equal(chooseBestVariant("#EXTM3U\n#EXTINF:10,\nseg1.ts\n", BASE), null);
});

test("parseMediaPlaylist returns absolute segment URLs", () => {
  const playlist = "#EXTM3U\r\n#EXTINF:10,\r\nseg1.ts\r\n#EXTINF:10,\r\n/abs/seg2.ts\r\n#EXT-X-ENDLIST\r\n";
  assert.deepEqual(parseMediaPlaylist(playlist, BASE), [
    "https://cdn.example.com/p/1/playManifest/seg1.ts",
    "https://cdn.example.com/abs/seg2.ts",
  ]);
});

test("parseMediaPlaylist rejects encrypted streams, but not METHOD=NONE", () => {
  assert.throws(
    () => parseMediaPlaylist('#EXT-X-KEY:METHOD=AES-128,URI="k"\n#EXTINF:10,\ns.ts', BASE),
    /Encrypted/,
  );
  assert.doesNotThrow(() => parseMediaPlaylist("#EXT-X-KEY:METHOD=NONE\n#EXTINF:10,\ns.ts", BASE));
});

test("parseMediaPlaylist rejects fragmented MP4 and empty playlists", () => {
  assert.throws(() => parseMediaPlaylist('#EXT-X-MAP:URI="init.mp4"\ns.m4s', BASE), /Fragmented MP4/);
  assert.throws(() => parseMediaPlaylist("#EXTM3U\n#EXT-X-ENDLIST", BASE), /No media segments/);
});

test("isLectureManifestUrl recognises Kaltura HLS manifests", () => {
  assert.ok(isLectureManifestUrl("https://x/index.M3U8?token=1"));
  assert.ok(isLectureManifestUrl("https://cfvod.kaltura.com/p/1/playManifest/entryId/0_x/format/applehttp/a"));
  assert.ok(!isLectureManifestUrl("https://cfvod.kaltura.com/p/1/playManifest/entryId/0_x/format/url/a.mp4"));
  assert.ok(!isLectureManifestUrl(null));
});
