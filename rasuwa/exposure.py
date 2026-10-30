"""Analysis B: buildings, roads, bridges and hydropower inside the footprint."""
import glob
import json
import os
import urllib.parse
import urllib.request

import ee

from .common import AOI_BOX, EMSR, EMSR_PRODUCTS, FIG, LHENDE_BOX, OUT, SERIES, aoi, retry, to_utm
from .footprint import layers, load_footprint


OPEN_BUILDINGS = 'GOOGLE/Research/open-buildings/v3/polygons'  # mapped from pre-event imagery
MIN_BUILDING_CONFIDENCE = 0.75  # Google's precision-oriented cut-off
CEMS_GRADES = ['Destroyed', 'Damaged', 'Possibly damaged']
STRETCHES = [  # (name, southern latitude) going downstream; the Lhende Khola is LHENDE_BOX
    ('Rasuwagadhi to Syabrubesi', 28.16), ('Syabrubesi to Betrawati', 27.97), ('Betrawati to Bidur and below', -90)]


def class_at_utm(x, y, change, x0, y1, tol_m=0):
    """Footprint class (0 = outside) at UTM 45N points on the exported 20 m grid.
    With tol_m, the highest class within that distance (square window), for things at the river's edge."""
    import numpy as np

    x, y = np.atleast_1d(np.asarray(x, float)), np.atleast_1d(np.asarray(y, float))
    best = np.zeros(x.shape, np.uint8)
    offsets = np.arange(-tol_m, tol_m + 1, 20) if tol_m else [0]
    for dx in offsets:
        for dy in offsets:
            col = np.floor((x + dx - x0) / 20).astype(int)
            row = np.floor((y1 - y - dy) / 20).astype(int)
            ok = (row >= 0) & (row < change.shape[0]) & (col >= 0) & (col < change.shape[1])
            v = np.zeros(x.shape, np.uint8)
            v[ok] = change[row[ok], col[ok]]
            best = np.maximum(best, v)
    return best


def footprint_class_at(lon, lat, change, x0, y1, tol_m=0):
    """Footprint class (0 = outside) at lon/lat points."""
    return class_at_utm(*to_utm(lon, lat), change, x0, y1, tol_m)


def line_inside_m(lon, lat, change, x0, y1, step_m=5):
    """Length in metres of a lon/lat polyline lying inside the footprint, sampled every ~step_m."""
    import numpy as np

    x, y = map(np.asarray, to_utm(lon, lat))
    inside = 0.0
    for xa, ya, xb, yb in zip(x[:-1], y[:-1], x[1:], y[1:]):
        seg = float(np.hypot(xb - xa, yb - ya))
        n = max(1, int(np.ceil(seg / step_m)))
        t = (np.arange(n) + 0.5) / n
        inside += (class_at_utm(xa + t * (xb - xa), ya + t * (yb - ya), change, x0, y1) > 0).sum() * seg / n
    return inside


def line_length_m(lon, lat):
    import numpy as np
    x, y = map(np.asarray, to_utm(lon, lat))
    return float(np.hypot(np.diff(x), np.diff(y)).sum())


def stretch_of(lon, lat):
    """Which stretch of the flow path a point belongs to."""
    x0, y0, x1, y1 = LHENDE_BOX
    if x0 <= lon <= x1 and y0 <= lat <= y1:
        return 'Lhende Khola'
    return next(name for name, south in STRETCHES if lat >= south)


def corridor_buildings():
    """Open Buildings centroids in the event corridor (one download; the footprint test is local)."""
    zone = layers()['corridor'].selfMask().reproject(ee.Projection('EPSG:32645').atScale(90))
    polygons = zone.reduceToVectors(geometry=aoi(), scale=90, geometryType='polygon', maxPixels=1e9)
    buildings = (ee.FeatureCollection(OPEN_BUILDINGS).filterBounds(polygons)
                 .filter(ee.Filter.gte('confidence', MIN_BUILDING_CONFIDENCE))
                 .map(lambda f: ee.Feature(None, {
                     'lon': ee.Geometry(f.get('longitude_latitude')).coordinates().get(0),
                     'lat': ee.Geometry(f.get('longitude_latitude')).coordinates().get(1),
                     'area_m2': f.get('area_in_meters')})))
    return ee.data.computeFeatures({'expression': buildings, 'fileFormat': 'PANDAS_DATAFRAME'})


OSM_CACHE = 'data/osm/overpass.json'  # delete it to fetch OpenStreetMap again
MOTOR_ROADS = {'trunk': 'main', 'primary': 'main', 'secondary': 'main', 'tertiary': 'local',
               'unclassified': 'local', 'residential': 'local', 'service': 'local', 'track': 'track'}
FOOT_WAYS = ('path', 'footway', 'pedestrian', 'bridleway', 'steps')


def osm_features():
    """Roads, bridges (incl. suspension footbridges) and hydropower sites from OpenStreetMap, cached."""
    if not os.path.exists(OSM_CACHE):
        bbox = f'{AOI_BOX[1]},{AOI_BOX[0]},{AOI_BOX[3]},{AOI_BOX[2]}'  # south, west, north, east
        query = f"""[out:json][timeout:180];
(way["highway"~"^({'|'.join(MOTOR_ROADS)})$"]({bbox});
 way["bridge"]["highway"~"^({'|'.join(FOOT_WAYS)})$"]({bbox});
 nwr["power"~"^(plant|generator)$"]["plant:source"="hydro"]({bbox});
 nwr["generator:source"="hydro"]({bbox});
 nwr["waterway"~"^(dam|weir)$"]({bbox}););
out tags geom;"""
        req = urllib.request.Request('https://overpass-api.de/api/interpreter',
                                     data=urllib.parse.urlencode({'data': query}).encode(),
                                     headers={'User-Agent': 'rasuwa-research/0.1 (student research)'})
        data = retry(lambda: urllib.request.urlopen(req, timeout=240).read(), 'Overpass')
        os.makedirs(os.path.dirname(OSM_CACHE), exist_ok=True)
        with open(OSM_CACHE, 'wb') as f:
            f.write(data)
    with open(OSM_CACHE) as f:
        return json.load(f)['elements']


def osm_points(el):
    """All lon/lat points of an OSM element (node, way or relation)."""
    if el['type'] == 'node':
        return [el['lon']], [el['lat']]
    pts = el.get('geometry') or [p for m in el.get('members', []) for p in m.get('geometry', [])]
    if not pts and 'bounds' in el:
        b = el['bounds']
        pts = [{'lon': (b['minlon'] + b['maxlon']) / 2, 'lat': (b['minlat'] + b['maxlat']) / 2}]
    return [p['lon'] for p in pts], [p['lat'] for p in pts]


def cems_lines(product, kind):
    """(lon list, lat list, grade) for each line part of a Copernicus line layer."""
    files = glob.glob(f'{EMSR}/{product}/*_{kind}_v*.json')
    out = []
    for feat in (json.load(open(files[0]))['features'] if files else []):
        geom = feat['geometry']
        if not geom:  # a few Copernicus features carry no geometry
            continue
        parts = [geom['coordinates']] if geom['type'] == 'LineString' else geom['coordinates']
        out += [([c[0] for c in p], [c[1] for c in p], feat['properties']['damage_gra']) for p in parts]
    return out


def cems_buildings(product):
    """Copernicus graded building points: lon, lat and damage grade lists."""
    with open(glob.glob(f'{EMSR}/{product}/*_builtUpP_v*.json')[0]) as f:
        feats = json.load(f)['features']
    return ([g['geometry']['coordinates'][0] for g in feats], [g['geometry']['coordinates'][1] for g in feats],
            [g['properties']['damage_gra'] for g in feats])


def run_buildings():
    """Analysis B: buildings inside the footprint, checked against the Copernicus damage grades."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    from matplotlib.path import Path

    change, (x0, y1) = load_footprint()
    result = {'cems': {}, 'open_buildings': {}}

    # 1. Does the footprint contain the buildings Copernicus graded? (building-level recall by grade)
    pooled = {g: [0, 0] for g in CEMS_GRADES}
    aoi_paths = {}
    for label, product in EMSR_PRODUCTS.items():
        lon, lat, grade = cems_buildings(product)
        hit = footprint_class_at(lon, lat, change, x0, y1) > 0
        result['cems'][label] = {}
        for g in CEMS_GRADES:
            sel = np.array(grade) == g
            result['cems'][label][g] = {'graded': int(sel.sum()), 'in_footprint': int((hit & sel).sum())}
            pooled[g][0] += int(sel.sum())
            pooled[g][1] += int((hit & sel).sum())
        with open(glob.glob(f'{EMSR}/{product}/*_areaOfInterestA_v*.json')[0]) as f:
            geom = json.load(f)['features'][0]['geometry']
        aoi_paths[label] = Path((geom['coordinates'] if geom['type'] == 'Polygon' else geom['coordinates'][0])[0])
    result['cems_pooled'] = {g: {'graded': n, 'in_footprint': k, 'share': round(k / n, 3) if n else 0.0}
                             for g, (n, k) in pooled.items()}

    # 2. Exposure along the whole corridor from Open Buildings
    ob = corridor_buildings()
    print(f'{len(ob)} Open Buildings in the corridor', flush=True)
    cls = footprint_class_at(ob['lon'].to_numpy(), ob['lat'].to_numpy(), change, x0, y1)
    ob['hit'] = cls > 0
    ob['stretch'] = [stretch_of(a, b) for a, b in zip(ob['lon'], ob['lat'])]
    hit = ob[ob['hit']]
    order = ['Lhende Khola'] + [s for s, _ in STRETCHES]
    result['open_buildings'] = {
        'in_corridor': len(ob), 'in_footprint': int(ob['hit'].sum()),
        'by_stretch': {s: int((hit['stretch'] == s).sum()) for s in order},
        'in_footprint_by_cems_area': {label: int(path.contains_points(hit[['lon', 'lat']].to_numpy()).sum())
                                      for label, path in aoi_paths.items()},
        'min_confidence': MIN_BUILDING_CONFIDENCE,
    }

    print('Copernicus graded buildings inside our footprint:')
    for g, v in result['cems_pooled'].items():
        print(f'  {g:>17}: {v["in_footprint"]} of {v["graded"]} ({v["share"]:.0%})')
    print(f'Open Buildings inside the footprint: {result["open_buildings"]["in_footprint"]}')
    for s, n in result['open_buildings']['by_stretch'].items():
        print(f'  {s:>30}: {n}')
    with open(f'{OUT}/buildings.json', 'w') as f:
        json.dump(result, f, indent=2)
    print('saved', f'{OUT}/buildings.json')

    # Figure for one IEEE column (3.5 in, fonts at print size): two single-series bar charts, values at the bar tips
    blue = SERIES[0]
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(3.5, 4.6))
    names, counts = order[::-1], [result['open_buildings']['by_stretch'][s] for s in order[::-1]]
    a1.barh(names, counts, color=blue, height=0.5)
    for y, (s, n) in enumerate(zip(names, counts)):
        # Open Buildings does not cover China, so the Lhende Khola (Gyirong Port) has no data, not zero buildings
        a1.text(n, y, ' no building data (Tibet)' if s == 'Lhende Khola' else f' {n:,}', va='center', fontsize=7)
    # titles right-aligned: the panels are narrower than the titles, and the space above the stretch names is empty
    a1.set_title('Buildings inside the footprint (Open Buildings)', fontsize=8, loc='right')
    # horizontal like the top panel: the grade names get the wide left margin, the labels the room past the bars
    grades = CEMS_GRADES[::-1]
    pooled = [result['cems_pooled'][g] for g in grades]
    a2.barh(grades, [p['share'] * 100 for p in pooled], color=blue, height=0.5)
    for y, p in enumerate(pooled):
        a2.text(p['share'] * 100, y, f' {p["share"]:.0%}\n ({p["in_footprint"]} of {p["graded"]})', va='center', fontsize=7)
    a2.set_xlim(0, 140)
    a2.set_xticks([0, 50, 100])
    a2.set_xlabel('% inside our footprint', fontsize=7)
    a2.set_title('Copernicus-graded buildings our footprint contains', fontsize=8, loc='right')
    for ax in (a1, a2):
        ax.spines[['top', 'right']].set_visible(False)
        ax.tick_params(labelsize=7)
    fig.tight_layout()
    fig.savefig(f'{FIG}/buildings_draft.png', dpi=300)
    print('saved', f'{FIG}/buildings_draft.png')


def run_infrastructure():
    """Analysis B, part 2: roads, bridges and hydropower inside the footprint, checked against Copernicus."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    change, (x0, y1) = load_footprint()
    order = ['Lhende Khola'] + [s for s, _ in STRETCHES]
    result = {'cems': {}, 'osm': {}}

    # 1. Copernicus check: destroyed road length and destroyed bridges inside our footprint
    roads_total = roads_in = bridges_total = bridges_in = 0
    for label, product in EMSR_PRODUCTS.items():
        destroyed = [(lo, la) for lo, la, g in cems_lines(product, 'transportationL') if g == 'Destroyed']
        total = sum(line_length_m(lo, la) for lo, la in destroyed)
        inside = sum(line_inside_m(lo, la, change, x0, y1) for lo, la in destroyed)
        with open(glob.glob(f'{EMSR}/{product}/*_transportationP_v*.json')[0]) as f:
            pts = [ft['geometry']['coordinates'] for ft in json.load(f)['features']
                   if ft['properties']['damage_gra'] == 'Destroyed']
        hit = (footprint_class_at([p[0] for p in pts], [p[1] for p in pts], change, x0, y1, tol_m=40) > 0
               if pts else [])
        result['cems'][label] = {'destroyed_road_km': round(total / 1000, 2), 'in_footprint_km': round(inside / 1000, 2),
                                 'destroyed_bridges': len(pts), 'bridges_in_footprint': int(sum(hit))}
        roads_total, roads_in = roads_total + total, roads_in + inside
        bridges_total, bridges_in = bridges_total + len(pts), bridges_in + int(sum(hit))
    result['cems_pooled'] = {
        'destroyed_road_km': round(roads_total / 1000, 2), 'share_in_footprint': round(roads_in / roads_total, 3),
        'destroyed_bridges': bridges_total, 'bridges_in_footprint': bridges_in,
        'bridge_tolerance_m': 40}

    # 2. Exposure along the corridor from OpenStreetMap
    road_km = {s: {'main': 0.0, 'local': 0.0, 'track': 0.0} for s in order}
    bridges = {s: {'road': 0, 'foot': 0} for s in order}
    hydro = {}
    for el in osm_features():
        tags = el.get('tags', {})
        lon, lat = osm_points(el)
        if not lon:
            continue
        where = stretch_of(sum(lon) / len(lon), sum(lat) / len(lat))
        hw = tags.get('highway')
        is_bridge = tags.get('bridge', 'no') != 'no'
        if hw in MOTOR_ROADS and len(lon) > 1:
            inside = line_inside_m(lon, lat, change, x0, y1)
            road_km[where][MOTOR_ROADS[hw]] += inside / 1000
            if is_bridge and (inside > 0 or footprint_class_at(lon, lat, change, x0, y1, tol_m=40).any()):
                bridges[where]['road'] += 1
        elif hw in FOOT_WAYS and is_bridge:
            if footprint_class_at(lon, lat, change, x0, y1, tol_m=40).any():
                bridges[where]['foot'] += 1
        elif footprint_class_at(lon, lat, change, x0, y1, tol_m=100).any():  # hydropower sites
            name = tags.get('name') or tags.get('name:en') or f'unnamed {el["type"]} {el["id"]}'
            kind = tags.get('power') or tags.get('waterway') or 'hydro'
            hydro.setdefault(name, set()).add(kind)
    result['osm'] = {
        'road_km_in_footprint': {s: {k: round(v, 2) for k, v in d.items()} for s, d in road_km.items()},
        'bridges_in_footprint': bridges,
        'hydropower_sites_within_100m': {n: sorted(k) for n, k in sorted(hydro.items())},
    }

    p = result['cems_pooled']
    print(f'Copernicus destroyed roads inside our footprint: {p["share_in_footprint"]:.0%} of {p["destroyed_road_km"]} km')
    print(f'Copernicus destroyed bridges inside our footprint (40 m): {p["bridges_in_footprint"]} of {p["destroyed_bridges"]}')
    for s in order:
        km = sum(road_km[s].values())
        print(f'  {s:>30}: road {km:5.1f} km, bridges {bridges[s]["road"]} road + {bridges[s]["foot"]} foot')
    print(f'Hydropower sites within 100 m of the footprint: {len(hydro)}')
    for n, k in sorted(hydro.items()):
        print(f'    {n} ({", ".join(sorted(k))})')
    with open(f'{OUT}/infrastructure.json', 'w') as f:
        json.dump(result, f, indent=2)
    print('saved', f'{OUT}/infrastructure.json')

    # Figure for one IEEE column: road km and bridges per stretch (stacked by type, legend present)
    names = order[::-1]
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(3.5, 4.6))
    left = [0.0] * len(names)
    for kind, color in zip(('main', 'local', 'track'), SERIES):
        vals = [road_km[s][kind] for s in names]
        a1.barh(names, vals, left=left, color=color, height=0.5, label=f'{kind} road')
        left = [a + b for a, b in zip(left, vals)]
    for y, v in enumerate(left):
        a1.text(v, y, f' {v:.1f} km', va='center', fontsize=7)
    a1.set_title('Road inside the footprint (OpenStreetMap)', fontsize=8, loc='right')
    a1.legend(frameon=False, fontsize=6, loc='upper right')  # the top rows are short, so this corner is empty
    road_b, foot_b = [bridges[s]['road'] for s in names], [bridges[s]['foot'] for s in names]
    a2.barh(names, road_b, color=SERIES[0], height=0.5, label='road bridge')
    a2.barh(names, foot_b, left=road_b, color=SERIES[1], height=0.5, label='footbridge')
    for y, (a, b) in enumerate(zip(road_b, foot_b)):
        a2.text(a + b, y, f' {a + b}', va='center', fontsize=7)
    a2.set_title('Bridges at the footprint (OpenStreetMap)', fontsize=8, loc='right')
    a2.legend(frameon=False, fontsize=6, loc='upper right')
    for ax in (a1, a2):
        ax.spines[['top', 'right']].set_visible(False)
        ax.tick_params(labelsize=7)
    fig.text(0.5, 0.01, 'The Lhende Khola stretch lies mostly in Tibet, where OpenStreetMap is sparse.', ha='center', fontsize=6)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(f'{FIG}/infrastructure_draft.png', dpi=300)
    print('saved', f'{FIG}/infrastructure_draft.png')
