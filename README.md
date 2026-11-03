# Rasuwa–Trishuli 2026 cascade: impact, exposure and warning lead time

On 26 August 2026 a rock-ice avalanche on the Langtang Lirung massif became a debris flow and flood that ran down the Lhende Khola, Bhote Koshi and Trishuli rivers on the Nepal–Tibet border. This repository reconstructs the event from open data only, in three analyses:

- **A. Impact footprint:** where the event changed the ground along the 80 km corridor, scored against Copernicus EMS rapid mapping.
- **B. Exposure:** which buildings, roads, bridges and hydropower sites lay inside the footprint, and how complete the open datasets are.
- **C. Warning lead time:** when the flood front reached each place, and how much warning was or could have been given.

Code and results for the paper *Downstream impacts and warning lead time of the 26 August 2026 Bhote Koshi–Trishuli cascade, Nepal, from open multi-sensor data* (N. Acharya and S. Pathak, in preparation).

## Key results

| | |
|---|---|
| Footprint | 22.0 km²: 18.8 optical only, 2.9 optical and radar, 0.2 radar only |
| Agreement with Copernicus EMS EMSR927 | F1 0.89 Syabrubesi, 0.84 Timure, 0.83 Bidur (precision 0.93–0.98); held out in leave-one-area-out tuning: 0.90, 0.84, 0.84 |
| Buildings | 92% of the buildings Copernicus graded destroyed lie inside (2,936 of 3,174); 2,519 Open Buildings footprints inside |
| Roads and bridges | 87% of the 56.8 km of destroyed road inside; all 30 destroyed bridges within 40 m |
| Lead time | Front at Syabrubesi at 08:49 NPT, 26 min before the 09:15 SMS alert; an automatic alert at the collapse would have given 34–41 min at Upper Trishuli 3A and 3B and Betrawati |

## Website

`web/` holds the companion site: the event, the method and the results, with the flood front animated along the river and the footprint, the Copernicus comparison and the exposed assets on interactive maps. It reads its numbers from `outputs/` when it is built. `cd web && pnpm install && pnpm dev` runs it; [web/README.md](web/README.md) has the details.

## Layout

- `rasuwa/` — the analysis package, one module per analysis
  - `footprint.py` — A: the impact footprint (`export`, `footprint`)
  - `validation.py` — A: agreement with Copernicus EMS EMSR927 and threshold tuning (`validate`, `tune`)
  - `exposure.py` — B: buildings, roads, bridges and hydropower inside the footprint (`buildings`, `infrastructure`)
  - `leadtime.py` — C: flood-front arrival and warning time (`leadtime`)
  - `imagery.py` — Vantor and Planet event imagery (`inventory`, `before-after`, `planet`)
  - `common.py` — shared settings and Earth Engine helpers; `__main__.py` — the command line
  - `web.py` — map layers, river model and imagery for the website (`web`)
- `web/` — the companion website (Next.js, static export); see [web/README.md](web/README.md)
- `test_rasuwa.py` — offline checks of the scoring, the footprint rule, the point and line tests and the flood routing
- `01_first_maps.ipynb` — interactive maps on top of the package
- `figures/` — figures, drawn one IEEE column wide (3.5 in, 300 dpi)
- `outputs/` — scores, counts and arrival times (JSON, CSV); files ending `_v1` hold the first, hand-set rule, which the website's Method page compares against
- `data/footprint/` — the impact footprint as GeoTIFF tiles (20 m, UTM 45N; opens in QGIS)

## Run

Set up once:

```
uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/earthengine authenticate
.venv/bin/earthengine set_project <your Earth Engine Cloud project>
.venv/bin/python test_rasuwa.py      # offline checks, no Earth Engine needed
```

`validate`, `buildings` and `infrastructure` need the Copernicus EMS EMSR927 products unpacked into `data/emsr927/` ([download](https://rapidmapping.emergency.copernicus.eu/EMSR927)). Everything else comes through Earth Engine, and `infrastructure` fetches OpenStreetMap into `data/osm/` on its first run.

Then run the steps in order (`python -m rasuwa --help` lists them):

```
.venv/bin/python -m rasuwa export          # footprint into data/footprint/, tile by tile (slow: about 2 min a tile)
.venv/bin/python -m rasuwa footprint       # areas and map, from the exported tiles
.venv/bin/python -m rasuwa validate        # scores against EMSR927
.venv/bin/python -m rasuwa buildings
.venv/bin/python -m rasuwa infrastructure
.venv/bin/python -m rasuwa leadtime
.venv/bin/python -m rasuwa web               # layers and imagery for the website in web/
.venv/bin/python -m rasuwa all             # every step above, plus inventory, before-after and planet
.venv/bin/python -m rasuwa tune            # threshold sweep, on demand only
```

Pass `--project ID` to use a different Earth Engine project for one run.

## Outputs and the paper

| Step | Writes | In the paper |
|---|---|---|
| `before-after` | `figures/before_after_draft.png` | Fig. 1 |
| `planet` | `figures/planet_draft.png` | Fig. 2 |
| `footprint` | `outputs/footprint_areas.json`, `figures/footprint_draft.png` | Fig. 3 |
| `validate` | `outputs/validation.json`, `figures/validation_draft.png` | Table III, Fig. 4 |
| `buildings` | `outputs/buildings.json`, `figures/buildings_draft.png` | Fig. 5 |
| `infrastructure` | `outputs/infrastructure.json`, `figures/infrastructure_draft.png` | Fig. 6 |
| `leadtime` | `outputs/leadtime.json`, `figures/leadtime_draft.png` | Fig. 7, Table IV |
| `tune` | `outputs/tuning.json` | Section IV-B |
| `inventory` | `outputs/inventory_vantor.csv`, `outputs/inventory_planet.csv` | — |
| `web` | `web/public/data/*.geojson`, `web/src/data/*.json`, `web/public/img/*.webp` | the website |

## Data

All inputs are open: Sentinel-2 surface reflectance with Cloud Score+, Sentinel-1 GRD, MERIT Hydro, Vantor Open Data and Planet disaster imagery (through the Awesome GEE Community Catalog), Google Open Buildings v3, OpenStreetMap, and Copernicus EMS EMSR927. Event timing comes from published reports cited in the paper and in `rasuwa/leadtime.py`.

## Licences

Code: MIT (see `LICENSE`). The figures contain Vantor Open Data and Planet imagery licensed CC BY-NC 4.0 and are shared under CC BY-NC 4.0. OpenStreetMap data © OpenStreetMap contributors (ODbL). Copernicus EMS products © European Union.
