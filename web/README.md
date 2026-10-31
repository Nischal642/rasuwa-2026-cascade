# Website

The companion site to the paper: what happened on 26 August 2026, how the three analyses were done, what they found, with interactive charts and maps. Next.js, exported as static files.

## Where the numbers come from

Nothing on the page is typed in by hand. At build time the page reads `../outputs/*.json`, the same files the paper's tables come from. The map layers, the river model and the imagery are written by the analysis package:

```
.venv/bin/python -m rasuwa web     # from the repository root
```

It writes:

- `public/data/footprint.geojson`: the footprint, one simplified polygon per class
- `public/data/copernicus.geojson`: the EMSR927 areas and mapped extent
- `public/data/exposure.geojson`: Copernicus-graded buildings, roads and bridges, each marked inside or outside the footprint
- `src/data/river.json`: the main stem and the 5/50/95 % arrival band
- `src/data/imagery.json` and `public/img/*.webp`: the before/after imagery
- `src/data/method.json`: the threshold values the tuning sweep tried, for the Method page

These outputs are committed, because the step needs Earth Engine and the Copernicus products in `data/emsr927/`, which are not in the repository. Run it again whenever the analysis changes.

## Run

```
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # static site in out/
```

`out/` can go on any static host (Vercel, Netlify, GitHub Pages). If it is served from a sub-path such as `user.github.io/repo`, set `basePath` in `next.config.ts`.

Basemaps need no keys: relief from AWS Terrain Tiles, and Sentinel-2 cloudless 2024 by EOX (CC BY-NC-SA 4.0) for the satellite view.
