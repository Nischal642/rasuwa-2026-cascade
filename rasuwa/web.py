"""Layers for the companion website in web/: the footprint, Copernicus EMSR927, the flood-front model and imagery.

The site reads the numbers straight from outputs/; this step writes what it cannot read there: map layers as
GeoJSON in web/public/data/, the river and the arrival band in web/src/data/, and the imagery as WebP.
"""
import glob
import json
import os

from .common import EMSR, EMSR_PRODUCTS, FIG, slug
from .exposure import cems_buildings, cems_lines, footprint_class_at, line_inside_m, line_length_m
from .footprint import CLASSES, load_footprint
from .imagery import BEFORE_AFTER_PLACES, before_after
from .leadtime import AUTO_ALERT_MIN, BETRAWATI_WINDOW_MIN, DEBRIS_MAX_MS, PORT_MIN, SMS_MIN, SYABRUBESI_LATEST_MIN
from .leadtime import arrival_model
from .validation import CONTROL_BOX, MAX_CONTROL_FLAGGED, TUNE_GRID

WEB = 'web'
SIMPLIFY_M = 10  # footprint outline tolerance: half a 20 m pixel


def rounded(c, nd=5):
    """Coordinates to nd decimals (5: about 1 m)."""
    return round(c, nd) if isinstance(c, float) else [rounded(v, nd) for v in c]


def feature(geom, **props):
    from shapely.geometry import mapping
    g = mapping(geom) if not isinstance(geom, dict) else geom
    return {'type': 'Feature', 'properties': props, 'geometry': {'type': g['type'], 'coordinates': rounded(g['coordinates'])}}


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    print(f'saved {path} ({os.path.getsize(path) / 1e3:.0f} kB)')


def footprint_polygons(change, x0, y1):
    """One simplified lon/lat (multi)polygon per footprint class, from the 20 m grid: pixel runs per row, merged."""
    import numpy as np
    import shapely
    from pyproj import Transformer

    to_lonlat = Transformer.from_crs('EPSG:32645', 'EPSG:4326', always_xy=True)
    out = {}
    for c in CLASSES:
        rows, starts, ends = [], [], []
        for r in np.flatnonzero((change == c).any(axis=1)):
            d = np.diff(np.concatenate([[0], (change[r] == c).astype(np.int8), [0]]))
            s, e = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
            rows += [r] * len(s)
            starts += list(s)
            ends += list(e)
        rows, starts, ends = map(np.asarray, (rows, starts, ends))
        boxes = shapely.box(x0 + starts * 20, y1 - (rows + 1) * 20, x0 + ends * 20, y1 - rows * 20)
        geom = shapely.unary_union(boxes).simplify(SIMPLIFY_M)
        out[c] = shapely.transform(geom, lambda xy: np.column_stack(to_lonlat.transform(xy[:, 0], xy[:, 1])))
    return out


def copernicus_layer(product, kind):
    files = glob.glob(f'{EMSR}/{product}/*_{kind}_v*.json')
    return [f for f in (json.load(open(files[0]))['features'] if files else []) if f['geometry']]


def method_settings():
    """The threshold sweep as the method page shows it: values tried, the false-alarm limit and the control valley."""
    save(f'{WEB}/src/data/method.json', {'tune_grid': TUNE_GRID, 'max_control_flagged': MAX_CONTROL_FLAGGED,
                                          'control_box': CONTROL_BOX})


def run_web():
    import numpy as np

    method_settings()
    from PIL import Image
    from shapely.geometry import shape

    # 1. Footprint polygons
    change, (x0, y1) = load_footprint()
    counts = np.bincount(change.ravel(), minlength=4)
    polys = footprint_polygons(change, x0, y1)
    save(f'{WEB}/public/data/footprint.geojson', {'type': 'FeatureCollection', 'features': [
        feature(polys[c], cls=c, name=CLASSES[c], km2=round(float(counts[c]) * 0.0004, 2)) for c in CLASSES]})

    # 2. Copernicus EMSR927: mapped areas and delineations, then the graded buildings, roads and bridges,
    # each marked with whether it lies inside our footprint (the same tests as `buildings` and `infrastructure`)
    areas, exposed = [], []
    for label, product in EMSR_PRODUCTS.items():
        for f in copernicus_layer(product, 'areaOfInterestA'):
            areas.append(feature(f['geometry'], kind='area', area=label))
        for f in copernicus_layer(product, 'observedEventA'):
            areas.append(feature(shape(f['geometry']).simplify(0.00005), kind='event', area=label))
        lon, lat, grade = cems_buildings(product)
        inside = footprint_class_at(lon, lat, change, x0, y1) > 0
        exposed += [feature({'type': 'Point', 'coordinates': [a, b]}, kind='building', grade=g, inside=bool(i), area=label)
                    for a, b, g, i in zip(lon, lat, grade, inside)]
        for lo, la, g in cems_lines(product, 'transportationL'):
            if g == 'Destroyed':
                share = line_inside_m(lo, la, change, x0, y1) / max(line_length_m(lo, la), 1)
                exposed.append(feature({'type': 'LineString', 'coordinates': list(zip(lo, la))}, kind='road',
                                       grade=g, inside=bool(share >= 0.5), area=label))
        for f in copernicus_layer(product, 'transportationP'):
            if f['properties']['damage_gra'] == 'Destroyed':
                a, b = f['geometry']['coordinates'][:2]
                inside = footprint_class_at([a], [b], change, x0, y1, tol_m=40)[0] > 0
                exposed.append(feature(f['geometry'], kind='bridge', grade='Destroyed', inside=bool(inside), area=label))
    save(f'{WEB}/public/data/copernicus.geojson', {'type': 'FeatureCollection', 'features': areas})
    save(f'{WEB}/public/data/exposure.geojson', {'type': 'FeatureCollection', 'features': exposed})

    # 3. The flood-front model: the main stem as a lon/lat line with chainage, and the 5/50/95 % arrival band
    from pyproj import Transformer
    m = arrival_model()
    chain, x, y = m['chain'], m['x'], m['y']
    lon, lat = Transformer.from_crs('EPSG:32645', 'EPSG:4326', always_xy=True).transform(x, y)
    keep = np.unique(np.r_[np.arange(0, len(chain), 2), len(chain) - 1])  # every other 90 m pixel
    grid = np.linspace(0, chain[-1], 241)
    band = np.array([np.percentile(m['arrival'](s), [5, 50, 95]) for s in grid])
    save(f'{WEB}/src/data/river.json', {
        'line': [[round(float(a), 5), round(float(b), 5), round(float(s) / 1000, 2)]
                 for a, b, s in zip(lon[keep], lat[keep], chain[keep])],
        'band': [[round(float(s) / 1000, 2), *(round(float(v), 2) for v in row)] for s, row in zip(grid, band)],
        'places': {n: {'lon': round(m['places'][n][0], 5), 'lat': round(m['places'][n][1], 5),
                       'km': round(s / 1000, 1)} for n, (s, _) in sorted(m['where'].items(), key=lambda kv: kv[1][0])},
        'fit_end_km': round(m['s_betr'] / 1000, 1),
        'observations': {'port_min': PORT_MIN, 'syabrubesi_window_min': [round(PORT_MIN + m['s_syab'] / DEBRIS_MAX_MS / 60, 1),
                                                                         SYABRUBESI_LATEST_MIN],
                         'syabrubesi_km': round(m['s_syab'] / 1000, 1), 'betrawati_window_min': BETRAWATI_WINDOW_MIN,
                         'betrawati_km': round(m['s_betr'] / 1000, 1), 'sms_min': SMS_MIN, 'auto_alert_min': AUTO_ALERT_MIN},
    })

    # 4. Imagery as WebP, with the scene dates the before/after figure prints
    os.makedirs(f'{WEB}/public/img', exist_ok=True)
    scenes = {}
    for name in BEFORE_AFTER_PLACES:
        d = before_after(name, save=False)
        scenes[name] = {'slug': slug(name), 'before': d['dates_before'][-1], 'after': d['dates_after'][0],
                        'lon': d['center'][1], 'lat': d['center'][0]}
    pngs = [f'{FIG}/{s["slug"]}_{t}.png' for s in scenes.values() for t in ('before', 'after')]
    pngs += [f'{FIG}/planet_syabrubesi_2026-05-27.png', f'{FIG}/planet_syabrubesi_2026-08-26.png']
    for png in pngs:
        Image.open(png).convert('RGB').save(f'{WEB}/public/img/{os.path.basename(png)[:-4]}.webp', quality=82)
    save(f'{WEB}/src/data/imagery.json', scenes)
