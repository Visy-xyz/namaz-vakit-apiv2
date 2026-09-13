import fs from 'fs';
import { resolveAsset } from './paths.js';
import { catalogCountryMeta } from './prayerCatalog.js';

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
  kudus: 'Jerusalem',
  ua_crm: 'Crimea',
  xk: 'Kosovo',
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
let normalizationsCache = null;

export function loadCountryNormalizations() {
  if (normalizationsCache) return normalizationsCache;
  const file = resolveAsset('country-normalizations.json');
  if (!file) {
    normalizationsCache = { byCode: {} };
    return normalizationsCache;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    normalizationsCache = {
      byCode: raw.byCode && typeof raw.byCode === 'object' ? raw.byCode : {},
    };
  } catch {
    normalizationsCache = { byCode: {} };
  }
  return normalizationsCache;
}

/**
 * @param {string} code ISO 3166-1 alpha-2 folder name, or a project folder code.
 */
export function countryMeta(code) {
  const c = String(code).toLowerCase();
  const fromCatalog = catalogCountryMeta(c);
  const fromFile = loadCountryNormalizations().byCode[c];
  const normalized = fromCatalog || fromFile || {};

  let name = normalized.name || NAME_FALLBACK[c];
  if (!name) {
    try {
      name = regionNames.of(c.toUpperCase());
    } catch {
      name = c.toUpperCase();
    }
  }

  return {
    name,
    nameAl: normalized.nameAl || NAME_AL[c] || name,
    flag: normalized.flag != null ? normalized.flag : flagEmoji(c),
    ...(normalized.nameTr ? { nameTr: normalized.nameTr } : {}),
    ...(normalized.region ? { region: normalized.region } : {}),
    ...(normalized.diyanetCountryId ? { diyanetCountryId: normalized.diyanetCountryId } : {}),
  };
}

function flagEmoji(cc) {
  if (!/^[a-z]{2}$/.test(cc)) return '';
  const A = 0x1f1e6;
  const upper = cc.toUpperCase();
  return String.fromCodePoint(
    A + upper.charCodeAt(0) - 65,
    A + upper.charCodeAt(1) - 65
  );
}
