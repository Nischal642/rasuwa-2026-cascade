"""Rasuwa-Trishuli cascade of 26 Aug 2026: open-data analysis, one module per analysis.

Command line (PNGs go to figures/, tables to outputs/):
    python -m rasuwa inventory     what is in the Vantor and Planet collections
    python -m rasuwa before-after   Vantor before/after at Syabrubesi, Timure and Bidur
    python -m rasuwa planet         PlanetScope on 27 May and on the morning of 26 Aug
    python -m rasuwa export         compute the footprint once into data/footprint/ (GeoTIFF tiles; slow)
    python -m rasuwa footprint      areas and map from the exported footprint (fast, local)
    python -m rasuwa validate       score the footprint against Copernicus EMS EMSR927 (data/emsr927/)
    python -m rasuwa buildings      buildings inside the footprint vs the Copernicus damage grades
    python -m rasuwa infrastructure roads, bridges and hydropower inside the footprint (OpenStreetMap)
    python -m rasuwa leadtime       flood-front arrival times and minutes of warning along the corridor
    python -m rasuwa web            map layers, river model and imagery for the website in web/
    python -m rasuwa all            all of the above
    python -m rasuwa tune           sweep footprint thresholds against EMSR927 (on demand)

Earth Engine project: --project ID, else EE_PROJECT, else the default set with
`earthengine set_project ID`. The notebook imports the modules for interactive maps.
"""
import argparse
import os

from . import exposure, footprint, imagery, leadtime, validation, web
from .common import FIG, OUT, init

STEPS = {'inventory': imagery.run_inventory, 'before-after': imagery.run_before_after, 'planet': imagery.run_planet,
         'export': footprint.run_export, 'footprint': footprint.run_footprint, 'validate': validation.run_validate,
         'buildings': exposure.run_buildings, 'infrastructure': exposure.run_infrastructure,
         'leadtime': leadtime.run_leadtime, 'web': web.run_web}
EXTRA = {'tune': validation.run_tune}  # run on demand only, not part of `all`


def main():
    ap = argparse.ArgumentParser(prog='python -m rasuwa', description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('step', choices=[*STEPS, *EXTRA, 'all'])
    ap.add_argument('--project', help='Earth Engine Cloud project ID')
    args = ap.parse_args()
    try:
        init(args.project)
    except Exception as e:  # no login or no project yet
        raise SystemExit(f'Earth Engine is not ready: {e}\n'
                         'Run `earthengine authenticate`, then pass --project ID '
                         'or run `earthengine set_project ID`.')
    os.makedirs(FIG, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    for step in (STEPS if args.step == 'all' else [args.step]):
        print(f'== {step}', flush=True)
        {**STEPS, **EXTRA}[step]()


if __name__ == '__main__':
    main()
