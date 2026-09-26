import assert from "node:assert/strict";
import { test } from "node:test";
import { isBuiltInSite, originPattern, patternHost, patternMatches } from "../src/shared/sites.js";

test("built-in sites: Toledo, KU Leuven's Kaltura, Kaltura players anywhere", () => {
  assert.ok(isBuiltInSite("https://ultra.edu.kuleuven.cloud/ultra/courses/_1/lti/launchFrame"));
  assert.ok(
    isBuiltInSite(
      "https://kaltura-kaf.edu.kuleuven.cloud/browseandembed/index/media-redirect/entryid/1_x/show",
    ),
  );
  assert.ok(isBuiltInSite("https://www.kuleuven.be/"));
  assert.ok(isBuiltInSite("https://kuleuven.be/"));
  assert.ok(isBuiltInSite("https://cdnapisec.kaltura.com/p/1/embedPlaykitJs/uiconf_id/2"));
  assert.ok(isBuiltInSite("https://2375821.kaf.kaltura.com/"));
});

test("everything else is not built in", () => {
  assert.ok(!isBuiltInSite("https://canvas.example.edu/courses/1"));
  assert.ok(!isBuiltInSite("https://notkuleuven.be/"));
  assert.ok(!isBuiltInSite("https://kuleuven.be.evil.com/"));
  assert.ok(!isBuiltInSite("https://evil.com/?kuleuven.be"));
  assert.ok(!isBuiltInSite("file:///home/x.html"));
  assert.ok(!isBuiltInSite("not a url"));
});

test("patternMatches handles schemes and ports", () => {
  assert.ok(patternMatches("*://*.kaltura.com/*", "http://x.kaltura.com:8080/a"));
  assert.ok(patternMatches("https://example.edu/*", "https://example.edu/a/b"));
  assert.ok(!patternMatches("https://example.edu/*", "http://example.edu/a"));
  assert.ok(patternMatches("*://*/*", "https://anything.org/"));
});

test("originPattern / patternHost for 'Enable on this site'", () => {
  assert.equal(originPattern("https://canvas.example.edu/courses/1?x=2"), "https://canvas.example.edu/*");
  assert.equal(originPattern("http://localhost:8123/"), "http://localhost:8123/*");
  assert.equal(originPattern("chrome://extensions/"), null);
  assert.equal(originPattern("about:blank"), null);
  assert.equal(patternHost("https://canvas.example.edu/*"), "canvas.example.edu");
});
