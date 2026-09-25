// Where SwiftSkip runs. Pure (used by the build script and the extension).

// Always on, granted at install: Toledo, KU Leuven's Kaltura (KAF) and
// Kaltura's own players/CDN — the latter also covers other schools that embed
// Kaltura in their learning platform.
export const REQUIRED_HOSTS = [
  "*://*.kuleuven.be/*",
  "*://*.kuleuven.cloud/*",
  "*://*.kaltura.com/*",
];

// Anything else is opt-in, one site at a time, from the popup.
export const OPTIONAL_HOSTS = ["*://*/*"];

// "https://example.edu/some/page" → "https://example.edu/*" (what we ask for).
export function originPattern(url) {
  try {
    const { protocol, host } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return null;
    return `${protocol}//${host}/*`;
  } catch {
    return null;
  }
}

// "https://example.edu/*" → "example.edu"
export function patternHost(pattern) {
  return pattern.replace(/^[^:]+:\/\//, "").replace(/\/\*$/, "");
}

// Does a match pattern like "*://*.kaltura.com/*" cover this URL?
export function patternMatches(pattern, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const match = /^(\*|https?):\/\/(\*|(?:\*\.)?[^/*]+)\/(.*)$/.exec(pattern);
  if (!match) return false;
  const [, scheme, host] = match;
  if (scheme === "*" ? !["http:", "https:"].includes(parsed.protocol) : parsed.protocol !== `${scheme}:`) {
    return false;
  }
  if (host === "*") return true;
  if (host.startsWith("*.")) {
    const base = host.slice(2);
    return parsed.hostname === base || parsed.hostname.endsWith(`.${base}`);
  }
  return parsed.host === host || parsed.hostname === host;
}

// Is this URL one where SwiftSkip always runs?
export function isBuiltInSite(url) {
  return REQUIRED_HOSTS.some((pattern) => patternMatches(pattern, url));
}
