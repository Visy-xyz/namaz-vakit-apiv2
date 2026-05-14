const PRAYER_FIELDS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Returns the names of any prayer time fields that are missing or not "HH:MM".
 * Empty array means the day is valid.
 * @param {object} day
 * @returns {string[]}
 */
export function invalidFields(day) {
  if (!day || typeof day !== 'object') return [...PRAYER_FIELDS];
  return PRAYER_FIELDS.filter(f => !TIME_RE.test(day[f]));
}
