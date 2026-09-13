<div align="center">

# Namaz Vakit API v2

Prayer-time JSON API for the rest of the world (167 countries).

[![Production](https://img.shields.io/badge/API-namazv2.frmsh.al-0366d6?style=flat-square)](https://namazv2.frmsh.al/api/cities)

</div>

Sister repo: [**namaz-vakit-api**](https://github.com/Visy-xyz/namaz-vakit-api) serves the
Balkans, Western/Central Europe, US and Canada from `namaz.frmsh.al`. The two country
catalogs are disjoint, and `lib/` and `api/` are kept **byte-identical** between them —
fix a handler here, copy it there.

---

## How it works

Prayer times come from [Diyanet](https://awqatsalah.diyanet.gov.tr) and are fetched
**once a year** into `data/{country}/{city}.json` (one file per city, a full year of days).
At request time the API only reads those files — there are **zero** calls to Diyanet.

`data/**` is excluded from the Vercel function bundle (it is ~1 GB), so in production the
handlers fetch city JSON over HTTP from `DATA_BASE_URL`. Only `generated/` is bundled.

```
data/{cc}/{city}.json   ->  DATA_BASE_URL  ->  api/prayer.js  ->  client
generated/prayer-catalog.json (bundled)  ->  api/cities.js, api/status.js
```

---

## Endpoints

Base URL: `https://namazv2.frmsh.al` (local: `http://localhost:3000` via `npm run dev`)

### `GET /api/cities`
Supported countries and cities.
- all: `/api/cities` (~64 KB gzipped)
- one country: `/api/cities?country=af` (**prefer this** — a few hundred bytes)

### `GET /api/prayer`
One day for one city. Required `country`, `city`; optional `date=YYYY-MM-DD`.

```http
GET /api/prayer?country=af&city=calalabad
GET /api/prayer?country=af&city=calalabad&date=2026-05-04
```

Returns `times`, plus `qiblaTime`, `moonPhaseUrl`, `hijriDate`, `astronomicalSunrise`,
`astronomicalSunset`, `timezoneOffset`, and `detail` — the full Diyanet row. `detail` is
**always** present; released app builds read the hijri date and moon phase from it.

Omitting `date` resolves "today" in the **city's** timezone (from the day's
DST-aware `greenwichMeanTimeZone`), not the server's UTC date.

### `GET /api/monthly`
A full month. Required `country`, `city`; optional `month=YYYY-MM`.

### `GET /api/status`
Catalog health **and data coverage**:

```json
{ "status": "ok",
  "coverage": { "years": [2026], "lastDate": "2026-12-31", "daysRemaining": 109 } }
```

`status` is `ok`, `expiring` (≤45 days left), `expired`, `degraded`, or `unknown`.
The Data Expiry Canary workflow polls this monthly.

### Errors
A date outside the shipped range returns **404 with a `coverage` range** — the API never
substitutes another year's times. Prayer times drift by minutes year over year and the
hijri date by ~11 days, so stale data must never be presented as current. All error
responses are sent `Cache-Control: no-store` so a transient failure is not cached by the CDN.

---

## The yearly refresh (the thing that must not be forgotten)

The data is a fixed snapshot ending **31 December**. After that every city 404s until
refreshed.

- **Yearly Prayer Times Refresh** — `1 December, 05:00 UTC`. Fetches the *next* year,
  rebuilds the catalog, then runs `verify.mjs --year <target>`, which **fails the job if
  any file is still on the old year**. Running on 1 January (the old schedule) meant the
  data had already expired before the job started.
- **Data Expiry Canary** — monthly. Alerts by email when fewer than 60 days of data
  remain, and its heartbeat commit keeps the repo active so GitHub never auto-disables
  the yearly schedule for inactivity.

Fetching is **year-aware**: a city is skipped only when its file is already on the target
year, so a run that fetched nothing can no longer report success, and an interrupted run
resumes where it stopped.

Run it by hand from *Actions → Yearly Prayer Times Refresh → Run workflow* (optionally
pick the year). A full run takes a few hours at the 1500 ms Diyanet delay.

---

## Local development

```bash
npm run dev            # vercel dev
npm test               # node --test test/*.test.js
npm run verify         # data integrity; add --year 2027 to assert freshness
npm run build:catalog  # regenerate generated/ after changing data/
```

`npm run verify -- --year 2027 --quiet` is the check that proves a refresh actually happened.

### Environment
Copy `.env.example` to `.env.local` (git-ignored — it holds Vercel's short-lived OIDC token).
`DATA_BASE_URL` is required on Vercel; locally the handlers fall back to reading `data/`.

---

## Layout

| Path | What |
|---|---|
| `api/` | Vercel serverless handlers — identical to the v1 repo |
| `lib/` | Shared helpers — identical to the v1 repo |
| `scripts/` | Yearly fetch, catalog build, integrity verify |
| `data/` | One JSON per city (not deployed; served via `DATA_BASE_URL`) |
| `generated/` | Bundled build output: catalog, normalizations, heartbeat |
