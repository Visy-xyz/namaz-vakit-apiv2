/** Optional Albanian UI labels (sidebar / locale). */
const NAME_AL = {
  al: 'Shqipëri',
  xk: 'Kosovë',
  mk: 'Maqedoni',
  me: 'Mali i Zi',
  ba: 'Bosnjë',
};

/** When `Intl.DisplayNames` has no region (rare) or a poor label. */
const NAME_FALLBACK = {
  xk: 'Kosovo',
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/**
 * @param {string} code ISO 3166-1 alpha-2 folder name (lowercase), e.g. `us`, `de`
 */
export function countryMeta(code) {
  const c = String(code).toLowerCase();
  let name = NAME_FALLBACK[c];
  if (!name) {
    try {
      name = regionNames.of(c.toUpperCase());
    } catch {
      name = c.toUpperCase();
    }
  }
  return {
    name,
    nameAl: NAME_AL[c] ?? name,
    flag: flagEmoji(c),
  };
}

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return '🏳️';
  const A = 0x1f1e6;
  const upper = cc.toUpperCase();
  return String.fromCodePoint(
    A + upper.charCodeAt(0) - 65,
    A + upper.charCodeAt(1) - 65
  );
}
