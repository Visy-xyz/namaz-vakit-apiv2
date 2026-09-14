/**
 * Slugs that older app builds still send, mapped to the file that exists.
 *
 * `tirane` came from a pre-catalog build and it is the capital, so every
 * request from those installs 404'd — and each 404 made the client retry the
 * backup URL and then the other host before giving up: four edge requests for
 * nothing, on every app open. Resolving it here fixes installs that will never
 * be updated. Kept tiny and explicit; anything broader belongs in the catalog.
 */
export const CITY_SLUG_ALIASES = {
  al: { tirane: 'tirana', tiran: 'tirana' },
};

/** The slug to read from disk for a requested one; unchanged when no alias applies. */
export function resolveCitySlug(countryCode, slug) {
  const cc = String(countryCode).toLowerCase();
  const s = String(slug).toLowerCase();
  return CITY_SLUG_ALIASES[cc]?.[s] ?? s;
}
