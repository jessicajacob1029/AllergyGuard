// Push addresses come from the browser, and our Edge Functions POST to them.
// Only the real push services are accepted, so nobody can point our server at
// another host. The same rule is in the database (is_known_push_endpoint() in
// migration 20261101020000_push_endpoint_allowlist.sql); keep the two in sync.
// Pure function, no Deno or Node APIs.

/** Hostnames of the browser push services. */
const KNOWN_PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Opera, Samsung Internet, Android
  /^android\.googleapis\.com$/, // older Chrome (GCM)
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari on macOS and iOS (web.push.apple.com)
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Windows (WNS)
];

/** True only for an https URL on a known push service, with no port or user name. */
export function isKnownPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  // The database checks the raw text, so the URL must already be in its normal form.
  if (!endpoint.toLowerCase().startsWith(`https://${url.hostname}/`)) return false;
  return KNOWN_PUSH_HOSTS.some((host) => host.test(url.hostname));
}
