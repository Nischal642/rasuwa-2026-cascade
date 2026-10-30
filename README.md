# Rasuwa–Trishuli 2026 cascade: impact, exposure and warning lead time

Code and results for the paper *Downstream impacts and warning lead time of the 26 August 2026 Bhote Koshi–Trishuli cascade, Nepal, from open multi-sensor data* (in preparation).

## Run

```
uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/earthengine authenticate
.venv/bin/earthengine set_project <your Earth Engine Cloud project>
.venv/bin/python -m rasuwa --help   # one step per analysis
.venv/bin/python test_rasuwa.py      # offline checks, no Earth Engine needed
```

`validate`, `buildings` and `infrastructure` need the Copernicus EMS EMSR927 products unpacked into `data/emsr927/` ([download](https://rapidmapping.emergency.copernicus.eu/EMSR927)). `infrastructure` fetches OpenStreetMap into `data/osm/` on first run.

## Contents

- `rasuwa/` — the analysis package, one module per analysis; run any step with `python -m rasuwa <step>`
  - `footprint.py` — A: the impact footprint (`export`, `footprint`)
  - `validation.py` — A: agreement with Copernicus EMS EMSR927 and threshold tuning (`validate`, `tune`)
  - `exposure.py` — B: buildings, roads, bridges and hydropower inside the footprint (`buildings`, `infrastructure`)
  - `leadtime.py` — C: flood-front arrival and warning time (`leadtime`)
  - `imagery.py` — Vantor and Planet event imagery (`inventory`, `before-after`, `planet`)
  - `common.py` — shared settings and Earth Engine helpers; `__main__.py` — the command line
- `01_first_maps.ipynb` — interactive maps on top of the package
- `figures/` — draft figures
- `outputs/` — scores, counts and arrival times (JSON, CSV)
- `data/footprint/` — the impact footprint as GeoTIFF tiles (20 m, UTM 45N)

## Licences

Code: MIT (see `LICENSE`). The figures contain Vantor Open Data and Planet imagery licensed CC BY-NC 4.0 and are shared under CC BY-NC 4.0. OpenStreetMap data © OpenStreetMap contributors (ODbL). Copernicus EMS products © European Union.
