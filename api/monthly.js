import { getQuery } from '../lib/query.js';
import { dayDateKey, coverageRange } from '../lib/dayDate.js';
import { normalizeYearMonth } from '../lib/dateParams.js';
import { displayCityName } from '../lib/cityNormalizations.js';
import { readCityJson, dataBaseUrlHint } from '../lib/readCityData.js';

/**
 * GET /api/monthly?country=af&city=calalabad
 * GET /api/monthly?country=af&city=calalabad&month=2026-04
 *
 * Returns all prayer times for a full month.
 * Each day includes `detail` — the full Diyanet row (hijri, moon URL, astronomical times, …).
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  const { country, city, month } = getQuery(req);

  if (!country || !city) {
    return res.status(400).json({
      error: 'Missing params',
      example: '/api/monthly?country=af&city=calalabad&month=2026-05',
    });
  }

  const cityData = await readCityJson(country, city);

  if (!cityData) {
    const hint = dataBaseUrlHint();
    return res.status(404).json({
      error: `City not found: ${country}/${city}`,
      ...(hint ? { setup: hint } : {}),
    });
  }

  const rows = Array.isArray(cityData.data) ? cityData.data : null;
  if (!rows?.length) {
    return res.status(500).json({ error: 'Invalid city JSON: missing or empty data array' });
  }

  const targetMonth = normalizeYearMonth(month || currentMonth());

  const days = rows.filter(d => {
    const key = dayDateKey(d);
    return key?.startsWith(targetMonth);
  });

  if (days.length === 0) {
    return res.status(404).json({
      error: `No data for month ${targetMonth}`,
      coverage: coverageRange(rows),
    });
  }

  return res.status(200).json({
    country,
    city,
    cityDisplayName: displayCityName(country, city),
    month: targetMonth,
    days: days.length,
    fileMeta: cityData._meta ?? null,
    data: days.map(d => ({
      date: dayDateKey(d),
      times: {
        fajr: d.fajr,
        sunrise: d.sunrise,
        dhuhr: d.dhuhr,
        asr: d.asr,
        maghrib: d.maghrib,
        isha: d.isha,
      },
      detail: d,
    })),
    fetchedAt: cityData._meta?.fetchedAt,
  });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
