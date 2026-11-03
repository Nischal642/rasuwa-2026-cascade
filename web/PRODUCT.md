# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router), fully static export (`output: 'export'`), English only. Lives in `web/` of the paper's repository, next to the Python analysis package `rasuwa/` that produces every number it shows.

## Users

- Researchers and reviewers in hazards and remote sensing, reading the site next to the paper: they want the method, the metrics, the uncertainty and the caveats, and to check the numbers.
- The general public and press: they want to understand what happened on the morning of 26 August 2026, where, and why the warning question matters, without the jargon.

## Product Purpose

The companion site to the paper *Downstream impacts and warning lead time of the 26 August 2026 Bhote Koshi–Trishuli cascade, Nepal, from open multi-sensor data* (N. Acharya and S. Pathak, in preparation). It explains what the paper asks, how it was done, what it found and how each finding was reached, with interactive charts and maps of the real outputs. Success: a reader leaves knowing the three findings (where the ground changed, what was exposed, how much warning there was or could have been) and trusting how they were derived.

## Positioning

The whole reconstruction uses open data only (Sentinel-2, Sentinel-1, MERIT Hydro, Open Buildings, OpenStreetMap, Vantor and Planet open disaster imagery), scored against Copernicus EMS EMSR927. The lead-time analysis puts the flood front's arrival at each place against the 09:15 SMS alert: the front reached Syabrubesi 26 minutes before the alert.

## Operating Context

Read on laptops and phones, often from a link in the paper, a social post or a news story. Reviewers will cross-check figures and tables against the paper (Figs. 1–7, Tables III–IV).

## Capabilities and Constraints

- All figures come from `outputs/*.json` and exported layers made by `python -m rasuwa`; the site never invents or rounds differently from the paper.
- Static hosting only: no server, no API keys. Map data ship as files; basemap tiles must come from free, keyless, attributable sources.
- Imagery licences: Vantor and Planet imagery CC BY-NC 4.0 (non-commercial, attributed); Copernicus EMS © European Union; OpenStreetMap © contributors (ODbL).
- Undecided: the paper's final venue, DOI and PDF link (in preparation).

## Evidence on Hand

- `outputs/`: footprint areas, validation scores, tuning, buildings, infrastructure, lead time (JSON).
- `data/footprint/`: the 20 m footprint raster (classes: optical only, radar only, both).
- `data/emsr927/` (local only): Copernicus EMSR927 delineations and graded buildings, roads, bridges.
- `figures/`: Vantor before/after at Syabrubesi, Timure, Trishuli Bridge; Planet on the morning of the flood.
- The paper draft (Google Doc "Rasuwa-Trishuli 2026 cascade - IEEE paper draft") holds the event narrative, Table I reported losses with sources, methods, discussion and references. Losses appear only as the paper reports them, with their sources; no quotes or testimonials exist, so none are invented.

## Product Principles

- Every number traceable to an output file and a figure or table in the paper.
- Show uncertainty as part of the result (5–95 % bands, held-out scores), never hide it.
- Story first for the public, method one step away for the reviewer.
- Respect the event: people lost homes and livelihoods; no spectacle.

## Accessibility & Inclusion

WCAG 2.2 AA. Charts and maps carry text equivalents (tables or summaries); motion respects `prefers-reduced-motion`.
