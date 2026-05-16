<div align="center">

# Namaz Vakit API

Reliable prayer-time data API for websites, mobile apps, and community tools.

[![Production](https://img.shields.io/badge/API-namaz.frmsh.al-0366d6?style=flat-square)](https://namaz.frmsh.al/api/cities)

</div>

---

## Purpose

This project provides a fast, public JSON API for:

- listing supported countries and cities (from `data/**` — rebuild `generated/prayer-catalog.json` after changes)
- returning daily prayer times for a selected location
- returning monthly prayer times for calendar views

Supported locations are exactly those present under the repository `data/` tree. It also includes a simple bilingual landing page at `https://namaz.frmsh.al/`.

---

## Base URL

- Production: `https://namaz.frmsh.al`
- Local (Vercel dev): `http://localhost:3000`

---

## API Endpoints

### `GET /api/cities`

Returns supported locations (derived from `data/{country}/*.json`).

- all countries: `/api/cities`
- single country: `/api/cities?country=af` (use any code returned by the list endpoint)

### `GET /api/prayer`

Returns prayer times for one day.

- required: `country`, `city`
- optional: `date=YYYY-MM-DD`

Example:

```http
GET https://namaz.frmsh.al/api/prayer?country=af&city=calalabad
GET https://namaz.frmsh.al/api/prayer?country=af&city=calalabad&date=2026-05-04
```

### `GET /api/monthly`

Returns prayer times for a month.

- required: `country`, `city`
- optional: `month=YYYY-MM`

Example:

```http
GET https://namaz.frmsh.al/api/monthly?country=af&city=calalabad&month=2026-05
```

---

## Response shape (`GET /api/prayer`)

```json
{
  "country": "af",
  "city": "calalabad",
  "cityDisplayName": "Calalabad",
  "date": "2026-05-04",
  "times": {
    "fajr": "03:22",
    "sunrise": "04:49",
    "dhuhr": "11:50",
    "asr": "15:33",
    "maghrib": "18:41",
    "isha": "20:02"
  },
  "qiblaTime": "14:22",
  "moonPhaseUrl": "https://awqatsalah.diyanet.gov.tr/images/d3.gif",
  "hijriDate": "17 Zilkade 1447",
  "astronomicalSunrise": "04:56",
  "astronomicalSunset": "18:34",
  "timezoneOffset": 4.5,
  "fileMeta": { "country": "af", "districtId": "9956", "year": 2026, "fetchedAt": "…", "totalDays": 365 },
  "fetchedAt": "2026-05-04T21:37:45.545Z"
}
```

Add `detail=true` to include the full Diyanet row for that day. `fileMeta` mirrors `_meta` from `data/{country}/{city}.json`.

---

## Local Development

Requirements:

- Node.js 18+
- Vercel CLI

Run:

```bash
npm run build:catalog
npx vercel dev
```

After changing location data or importing a Diyanet city export:

```bash
node scripts/sync-location-metadata.mjs --all-cities C:\Users\visyy\Downloads\all_cities.json --base-city-normalizations C:\Users\visyy\OneDrive\Desktop\namaz-vakit-api\data\city-normalizations.json
node scripts/build-prayer-catalog.mjs
```

This rebuilds:

- `countries-all.json`
- `data/city-normalizations.json`
- `data/country-normalizations.json`
- `generated/prayer-catalog.json`

---

## Deployment Notes

- Vercel serves the API routes under `/api/*`.
- `DATA_BASE_URL` can point to a remote data mirror.
- `generated/prayer-catalog.json` should be rebuilt when location data changes.

---

## Repository

[Visy-xyz/namaz-vakit-api](https://github.com/Visy-xyz/namaz-vakit-api)
