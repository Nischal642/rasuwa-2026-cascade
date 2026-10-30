"""Rasuwa-Trishuli cascade of 26 Aug 2026: first maps from open data in Google Earth Engine.

Command line (PNGs go to figures/, tables to outputs/):
    python rasuwa.py inventory     what is in the Vantor and Planet collections
    python rasuwa.py before-after   Vantor before/after at Syabrubesi, Timure and Bidur
    python rasuwa.py planet         PlanetScope on 27 May and on the morning of 26 Aug
    python rasuwa.py export         compute the footprint once into data/footprint/ (GeoTIFF tiles; slow)
    python rasuwa.py footprint      areas and map from the exported footprint (fast, local)
    python rasuwa.py validate       score the footprint against Copernicus EMS EMSR927 (data/emsr927/)
    python rasuwa.py buildings      buildings inside the footprint vs the Copernicus damage grades
    python rasuwa.py infrastructure roads, bridges and hydropower inside the footprint (OpenStreetMap)
    python rasuwa.py leadtime       flood-front arrival times and minutes of warning along the corridor
    python rasuwa.py all            all of the above
    python rasuwa.py tune           sweep footprint thresholds against EMSR927 (on demand)

Earth Engine project: --project ID, else EE_PROJECT, else the default set with
`earthengine set_project ID`. The notebook imports this module for interactive maps.
"""
import argparse
import csv
import datetime as dt
import glob
import io
import json
import os
import urllib.parse
import urllib.request

import ee

EVENT = '2026-08-26'  # collapse at 02:52 UTC (08:37 NPT)
AOI_BOX = [85.08, 27.82, 85.62, 28.40]  # source area on the Lhende Khola down to Bidur
PLACES = {  # lon, lat from OpenStreetMap
    'Rasuwagadhi': (85.3778, 28.2778),
    'Timure': (85.3667, 28.2528),
    'Syabrubesi': (85.3427, 28.1646),
    'Betrawati': (85.1860, 27.9731),
    'Trishuli Bridge': (85.1381, 27.9092),  # riverside at Bidur
    'Bidur': (85.1464, 27.8953),  # town centre, on a terrace above the river
}
BEFORE_AFTER_PLACES = ['Syabrubesi', 'Timure', 'Trishuli Bridge']  # Vantor post-event coverage
VANTOR = 'projects/sat-io/open-datasets/VANTOR-DISASTER-DATA/NEPAL_FLOOD_2026'
PLANET = 'projects/sat-io/open-datasets/PLANET-DISASTER-DATA/NEPAL_FLOOD_2026'

# Footprint thresholds, chosen by `python rasuwa.py tune` on 2026-10-30 (outputs/tuning.json):
# best mean F1 against EMSR927 with at most 2 % false alarms in the control valley.
# The hand-set first guess was ndvi_drop -0.2, no CVA, ndvi_after_max 0.35, vh_db 3, hand_max_m 60.
PARAMS = {
    'ndvi_drop': -0.1,       # NDVI after minus before: vegetation lost
    'cva_min': 0.08,         # spectral change magnitude (reflectance units); None switches the rule off
    'ndvi_after_max': 0.35,  # bare, sediment or water afterwards
    'vh_db': 4,              # |VH after - VH before| in dB
    'hand_max_m': 150,       # height above nearest drainage; the debris flow ran high near the source
}
CVA_BANDS = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12']
# Langtang Khola valley, east of the Bhote Koshi: untouched in 2026, so anything flagged there is a
# false alarm. Settings that flag more of its valley floor than this are rejected while tuning.
CONTROL_BOX = [85.40, 28.14, 85.56, 28.24]
MAX_CONTROL_FLAGGED = 0.02
# Event corridor: the footprint only counts change along the path the debris and flood took, so other
# rivers (Tadi), the 24-28 Sep rains elsewhere and snowfields are not counted as this event.
# MERIT upstream area: main stem 3,054 km² at Rasuwagadhi; Tibetan reach above the Lhende 2,141;
# Tadi 551; Langtang 519 (checked 2026-10-30).
MAIN_STEM_KM2 = 2500
LHENDE_BOX = [85.385, 28.27, 85.53, 28.36]  # the Lhende Khola valley the debris came down
CORRIDOR_HALF_WIDTH_M = 1000
SNOW_NDSI = 0.4        # snow, ice or bright cloud in either composite is not flood change
# Sentinel-2 windows: same season one year apart; the 2025 one comes after the July 2025 GLOF.
# Ending before the 24-28 Sep 2026 rains left too few cloud-free scenes (F1 fell to 0.1-0.3 when
# tested on 2026-10-30), so damage from those rains is kept out with the event corridor instead.
S2_BEFORE = ('2025-08-27', '2025-10-29')
S2_AFTER = ('2026-08-27', '2026-10-29')
MIN_PATCH_PX = 20      # 20 m pixels (0.8 ha); smaller isolated patches are dropped as specks

CLASSES = {1: 'Optical only', 2: 'Radar only', 3: 'Both (higher confidence)'}
COLORS = ['#eb6834', '#2a78d6', '#1baf7a']  # one per footprint class, used on every footprint map
SERIES = ['#2a78d6', '#eb6834', '#1baf7a']  # charts of other things: categorical slots 1-3, in order
S2_VIS = {'bands': ['B4', 'B3', 'B2'], 'min': 0, 'max': 0.3}

RGB = ['red', 'green', 'blue']  # band names in the Vantor and Planet visual products

EMSR = 'data/emsr927'  # unpacked Copernicus EMS products
EMSR_PRODUCTS = {  # latest delivered map per area inside AOI_BOX (AOI05 Phosretar lies mostly downstream)
    'Syabrubesi (AOI01)': 'EMSR927_AOI01_GRA_PRODUCT_v1',
    'Timure (AOI02)': 'EMSR927_AOI02_GRA_PRODUCT_v2',
    'Bidur (AOI03)': 'EMSR927_AOI03_GRA_MONIT01_v1',
}
# Which footprint classes count as "flagged" for each method being scored
METHODS = {'any': {1, 2, 3}, 'optical': {1, 3}, 'radar': {2, 3}, 'both': {3}}
AGREE_COLORS = {'Both flag it': '#1baf7a', 'Only our footprint': '#eb6834', 'Only Copernicus': '#2a78d6'}

FIG, OUT = 'figures', 'outputs'


FOOTPRINT_DIR = 'data/footprint'  # exported footprint: GeoTIFF tiles, 20 m, UTM 45N (opens in QGIS)

OPEN_BUILDINGS = 'GOOGLE/Research/open-buildings/v3/polygons'  # mapped from pre-event imagery
MIN_BUILDING_CONFIDENCE = 0.75  # Google's precision-oriented cut-off
CEMS_GRADES = ['Destroyed', 'Damaged', 'Possibly damaged']
STRETCHES = [  # (name, southern latitude) going downstream; the Lhende Khola is LHENDE_BOX
    ('Rasuwagadhi to Syabrubesi', 28.16), ('Syabrubesi to Betrawati', 27.97), ('Betrawati to Bidur and below', -90)]


def init(project=None):
    ee.Initialize(project=project or os.environ.get('EE_PROJECT'))
    ee.data.setDeadline(300_000)  # 5 min: a stalled request fails and can be retried instead of hanging


def utm_tiles(n=4):
    """AOI_BOX on the 20 m UTM 45N grid, split into n x n edge-to-edge tiles: (x0, y1, width, height, name)."""
    xs, ys = zip(*aoi().bounds(ee.ErrorMargin(1), 'EPSG:32645').coordinates().getInfo()[0])
    x0, y1 = 20 * (min(xs) // 20), 20 * -(-max(ys) // 20)
    w, h = int(-(-(max(xs) - x0) // 20)), int(-(-(y1 - min(ys)) // 20))
    tw, th = -(-w // n), -(-h // n)
    return [(x0 + i * tw * 20, y1 - j * th * 20, min(tw, w - i * tw), min(th, h - j * th), f'{j}{i}')
            for j in range(n) for i in range(n)]


def grid_pixels(img, x0, y1, w, h, scale=20, fmt='NUMPY_NDARRAY'):
    """An image on a UTM 45N grid whose top-left corner is (x0, y1)."""
    return ee.data.computePixels({
        'expression': img, 'fileFormat': fmt,
        'grid': {'dimensions': {'width': int(w), 'height': int(h)},
                 'affineTransform': {'scaleX': scale, 'shearX': 0, 'translateX': x0,
                                     'shearY': 0, 'scaleY': -scale, 'translateY': y1},
                 'crsCode': 'EPSG:32645'}})


def load_footprint():
    """The exported footprint as one array (class 0-3 per 20 m pixel) and its top-left corner."""
    import numpy as np
    from PIL import Image

    with open(f'{FOOTPRINT_DIR}/export.json') as f:
        meta = json.load(f)
    if meta['params'] != PARAMS:
        raise SystemExit(f'The exported footprint was made with {meta["params"]}, but PARAMS is now {PARAMS}. '
                         'Run `python rasuwa.py export` first.')
    rows = {}
    for x0, y1, w, h, name in meta['tiles']:
        rows.setdefault(name[0], []).append(np.array(Image.open(f'{FOOTPRINT_DIR}/tile_{name}.tif')))
    return np.vstack([np.hstack(rows[j]) for j in sorted(rows)]), meta['tiles'][0][:2]


def aoi():
    return ee.Geometry.Rectangle(AOI_BOX)


# --- helpers -------------------------------------------------------------

def inventory(collection_id):
    """Date, id and band names of every image in a collection."""
    col = ee.ImageCollection(collection_id)
    rows = ee.FeatureCollection(col.map(lambda im: ee.Feature(None, {
        'id': im.get('system:index'),
        'date': im.date().format('YYYY-MM-dd HH:mm'),
        'bands': im.bandNames().join(' '),
    }))).getInfo()['features']
    return sorted((r['properties'] for r in rows), key=lambda r: r['date'])


def stretch(img, region, scale):
    """2-98 % stretch, so the display works whatever the data range."""
    bands = img.bandNames().getInfo()
    p = img.reduceRegion(ee.Reducer.percentile([2, 98]), region, scale, maxPixels=1e9, bestEffort=True).getInfo()
    lo, hi = [p.get(f'{b}_p2') for b in bands], [p.get(f'{b}_p98') for b in bands]
    if None in lo + hi:
        return {'bands': bands}
    return {'bands': bands, 'min': lo, 'max': hi}


def dates(col):
    ms = col.aggregate_array('system:time_start').getInfo()
    return sorted(dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc).strftime('%Y-%m-%d') for t in ms)


def slug(name):
    return name.lower().replace(' ', '_')


def retry(fn, what, tries=3):
    """Call fn, retrying: the network here drops, and Earth Engine sometimes answers 503 or hits the deadline."""
    for attempt in range(tries):
        try:
            return fn()
        except Exception as e:
            print(f'{what} failed ({str(e)[:80]}), retry {attempt + 1}/{tries}', flush=True)
    raise RuntimeError(f'{what} failed {tries} times')


def fetch(url):
    def get():
        with urllib.request.urlopen(url, timeout=300) as r:
            return r.read()
    return retry(get, 'download')


def save_png(img, vis, region, path, size=1024):
    with open(path, 'wb') as f:
        f.write(fetch(img.getThumbURL({**vis, 'region': region, 'dimensions': size, 'format': 'png'})))
    print('saved', path, flush=True)






# --- analyses ------------------------------------------------------------

def vantor_rgb(im, max_cloud=20):
    """RGB with no-data (0) and cloudy pixels masked."""
    rgb = im.select(RGB)
    rgb = rgb.updateMask(rgb.reduce(ee.Reducer.max()).gt(0))
    rgb = rgb.updateMask(im.select('cloud_probability').lte(max_cloud))
    return ee.Image(rgb.copyProperties(im, ['system:time_start']))


def before_after(name, half_width_m=750, save=True):
    """Vantor before/after for one place: images, display settings and scene dates.

    Before: the newest clear pre-event view, gaps filled from older scenes.
    After: the earliest clear post-event view (up to 30 Sep), gaps filled from later scenes.
    """
    vantor = ee.ImageCollection(VANTOR)
    lon, lat = PLACES[name]
    pt = ee.Geometry.Point([lon, lat])
    pre = vantor.filterDate('2021-01-01', EVENT).filterBounds(pt).map(vantor_rgb)
    post = vantor.filterDate(EVENT, '2026-10-01').filterBounds(pt).map(vantor_rgb)
    d = {'name': name, 'center': (lat, lon), 'dates_before': dates(pre), 'dates_after': dates(post)}
    if not d['dates_before'] or not d['dates_after']:
        return d
    box = pt.buffer(half_width_m).bounds()
    d['before'] = pre.sort('system:time_start').mosaic()  # mosaic puts the last image on top
    d['after'] = post.sort('system:time_start', False).mosaic()
    d['vis_before'] = stretch(d['before'], box, 2)
    d['vis_after'] = stretch(d['after'], box, 2)
    if save:
        for tag in ('before', 'after'):
            save_png(d[tag], d[f'vis_{tag}'], box, f'{FIG}/{slug(name)}_{tag}.png')
    return d


PLANET_VIS = {'bands': RGB, 'min': 0, 'max': 255}  # the visual product is already display-ready


def planet_view(start, end):
    """Mosaic of the Planet visual (8-bit RGB) scenes acquired between two dates."""
    col = (ee.ImageCollection(PLANET).filterDate(start, end)
           .filter(ee.Filter.stringContains('system:index', '_visual')))
    return col.select(RGB).mosaic()


def layers():
    """Per-pixel inputs to the footprint rule, before any threshold is applied."""
    region = aoi()

    def s2_median(start, end):
        cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED')
        return (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                .filterBounds(region).filterDate(start, end)
                .linkCollection(cs, ['cs_cdf'])
                .map(lambda im: im.updateMask(im.select('cs_cdf').gte(0.6)))
                .select(CVA_BANDS)
                .median().divide(10000).clip(region))

    def bright(img):  # snow, ice or leftover cloud
        return img.normalizedDifference(['B3', 'B11']).gt(SNOW_NDSI).Or(img.select('B2').gt(0.25)).unmask(0)

    s2_before = s2_median(*S2_BEFORE)
    s2_after = s2_median(*S2_AFTER)
    ndvi_after = s2_after.normalizedDifference(['B8', 'B4'])
    # Change vector analysis: catches debris on ground that was already bare (riverbed, roofs, roads).
    cva = s2_after.subtract(s2_before).pow(2).reduce(ee.Reducer.sum()).sqrt()

    s1 = (ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(region)
          .filter(ee.Filter.eq('instrumentMode', 'IW'))
          .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
          .select('VH'))
    s1_after = s1.filterDate(EVENT, '2026-09-15')
    orbits = s1_after.aggregate_histogram('relativeOrbitNumber_start').getInfo()
    orbit = int(float(max(orbits, key=orbits.get)))  # same viewing geometry before and after

    def s1_median(col):
        return (col.filter(ee.Filter.eq('relativeOrbitNumber_start', orbit))
                .map(lambda im: im.focalMedian(50, 'circle', 'meters'))  # reduce speckle
                .median())

    vh_change = s1_median(s1_after).subtract(s1_median(s1.filterDate('2026-07-01', EVENT))).clip(region)

    upa = ee.Image('MERIT/Hydro/v1_0_1').select('upa')
    main_stem = upa.gt(MAIN_STEM_KM2).selfMask().reproject(upa.projection())  # widen on the 90 m grid: cheap
    # paint(), not clip(): unmask() keeps a clipped image's footprint, which would blank the rest
    corridor = (main_stem.focalMax(CORRIDOR_HALF_WIDTH_M, 'circle', 'meters').unmask(0)
                .Or(ee.Image(0).paint(ee.Geometry.Rectangle(LHENDE_BOX), 1)).rename('corridor'))
    return {'corridor': corridor,'s2_before': s2_before, 's2_after': s2_after, 'ndvi_after': ndvi_after,
            'dndvi': ndvi_after.subtract(s2_before.normalizedDifference(['B8', 'B4'])), 'cva': cva,
            'vh_change': vh_change, 'hand': ee.Image('MERIT/Hydro/v1_0_1').select('hnd'),
            'bright': bright(s2_before).Or(bright(s2_after)),
            'orbits': orbits, 'orbit': orbit}


def footprint(params=None):
    """Candidate change on the valley floor: 1 optical only, 2 radar only, 3 both."""
    p = {**PARAMS, **(params or {})}
    L = layers()
    spectral = L['dndvi'].lt(p['ndvi_drop'])
    if p['cva_min'] is not None:
        spectral = spectral.Or(L['cva'].gt(p['cva_min']))
    optical = spectral.And(L['ndvi_after'].lt(p['ndvi_after_max']))
    radar = L['vh_change'].abs().gt(p['vh_db'])
    usable = L['hand'].lt(p['hand_max_m']).And(L['bright'].Not()).And(L['corridor'])

    change = optical.unmask(0).And(usable).add(radar.unmask(0).And(usable).multiply(2))
    # Fixed 20 m UTM grid so the patch filter gives the same answer at every map zoom.
    # Count only up to MIN_PATCH_PX: same answer, far less memory than a larger cap.
    patches = (change.gt(0).reproject(ee.Projection('EPSG:32645').atScale(20))
               .connectedPixelCount(MIN_PATCH_PX, True))
    change = change.updateMask(patches.gte(MIN_PATCH_PX)).selfMask().clip(aoi()).rename('change')
    return {**L, 'change': change, 'params': p}


def to_utm(lon, lat):
    from pyproj import Transformer
    return Transformer.from_crs('EPSG:4326', 'EPSG:32645', always_xy=True).transform(lon, lat)


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


# Flood-front timing on 26 Aug 2026, minutes after the 08:37 NPT collapse (Wikipedia timeline sources:
# CCTV, ReliefWeb, Onlinekhabar; Rapid Situation Analysis report). Chainage 0 = Rasuwagadhi / Gyirong Port.
COLLAPSE_NPT_MIN = 8 * 60 + 37
PORT_MIN = 7                      # CCTV: Gyirong Port destroyed from 08:44, ~20 km below the collapse
SYABRUBESI_LATEST_MIN = 13        # gauge normal at 08:40, silent from 08:50
BETRAWATI_WINDOW_MIN = (38, 48)   # gauge 3.55 m until 09:20; situation report: arrival 09:15-09:25
DEBRIS_MAX_MS = 52                # collapse to Gyirong Port speed; the debris flow did not go faster
SMS_MIN = 38                      # SMS alert to 679,295 people at 09:15
AUTO_ALERT_MIN = 2                # what-if: an automatic alert two minutes after the seismic signal
LEADTIME_PLACES = ['Rasuwagadhi', 'Timure', 'Syabrubesi', 'Betrawati', 'Trishuli Bridge']
OSM_CACHE = 'data/osm/overpass.json'  # delete it to fetch OpenStreetMap again
MOTOR_ROADS = {'trunk': 'main', 'primary': 'main', 'secondary': 'main', 'tertiary': 'local',
               'unclassified': 'local', 'residential': 'local', 'service': 'local', 'track': 'track'}
FOOT_WAYS = ('path', 'footway', 'pedestrian', 'bridleway', 'steps')


def river_profile():
    """Main-stem pixels of MERIT Hydro, ordered downstream: chainage (m from the first pixel), x, y, elevation."""
    import numpy as np

    merit = ee.Image('MERIT/Hydro/v1_0_1')
    img = merit.select(['upa', 'elv']).addBands(ee.Image.pixelLonLat()).updateMask(merit.select('upa').gt(MAIN_STEM_KM2))
    df = ee.data.computeFeatures({'expression': img.sample(region=aoi(), projection=merit.select('upa').projection()),
                                  'fileFormat': 'PANDAS_DATAFRAME'})
    df = df.sort_values('upa', ignore_index=True)  # upstream area only grows going downstream
    x, y = map(np.asarray, to_utm(df['longitude'].to_numpy(), df['latitude'].to_numpy()))
    chain = np.concatenate([[0], np.cumsum(np.hypot(np.diff(x), np.diff(y)))])
    return chain, x, y, df['elv'].to_numpy()


def smoothed_slope(chain, elev, half_window_m=500, floor=0.001):
    """Bed slope over +-half_window_m along the river, never below floor (MERIT has flat steps)."""
    import numpy as np
    up = np.interp(chain - half_window_m, chain, elev)
    down = np.interp(chain + half_window_m, chain, elev)
    span = np.minimum(chain + half_window_m, chain[-1]) - np.maximum(chain - half_window_m, 0)
    return np.maximum((up - down) / np.maximum(span, 1), floor)


def flood_seconds(chain, slope, k, s_from, s_to):
    """Travel time (s) of a kinematic flood wave with speed k*sqrt(slope) between two chainages."""
    import numpy as np
    s = np.linspace(s_from, s_to, max(2, int(abs(s_to - s_from) // 20) + 1))
    pace = 1 / (k * np.sqrt(np.interp(s, chain, slope)))  # s per metre
    return float(np.sum((pace[1:] + pace[:-1]) / 2 * np.diff(s)))


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


def emsr_layer(product, kind):
    """One EMSR927 layer (observedEventA, notAnalysedA, ...) as a FeatureCollection; empty if absent."""
    files = glob.glob(f'{EMSR}/{product}/*_{kind}_v*.json')
    if not files:
        return ee.FeatureCollection([])
    with open(files[0]) as f:
        return ee.FeatureCollection(json.load(f))


def analysed_region(product):
    """The EMSR927 area minus the parts Copernicus marked as not analysed."""
    return emsr_layer(product, 'areaOfInterestA').geometry().difference(
        emsr_layer(product, 'notAnalysedA').geometry(), ee.ErrorMargin(1))


def pixels(img, region):
    """Download an image over a region's bounds on a 20 m UTM grid as a numpy structured array."""
    xs, ys = zip(*region.bounds(ee.ErrorMargin(1), 'EPSG:32645').coordinates().getInfo()[0])
    return grid_pixels(img.toFloat(), min(xs), max(ys),
                       (max(xs) - min(xs)) // 20 + 1, (max(ys) - min(ys)) // 20 + 1)


def tune_inputs():
    """Footprint inputs plus the Copernicus label for each EMSR927 area, and the control valley."""
    L = layers()
    stack = ee.Image.cat(  # masked inputs get values that never pass a threshold
        L['dndvi'].unmask(0).rename('dndvi'), L['ndvi_after'].unmask(1).rename('ndvi_after'),
        L['cva'].unmask(0).rename('cva'), L['vh_change'].abs().unmask(0).rename('dvh'),
        L['hand'].unmask(9999).rename('hand'), L['bright'].rename('bright'))
    data = {}
    for label, product in EMSR_PRODUCTS.items():
        region = analysed_region(product)
        data[label] = pixels(stack.addBands(ee.Image.cat(
            ee.Image(0).paint(emsr_layer(product, 'observedEventA'), 1).rename('ref'),
            ee.Image(0).paint(ee.FeatureCollection([ee.Feature(region)]), 1).rename('inside'))), region)
        print(f'{label}: {data[label].shape[1]} x {data[label].shape[0]} pixels', flush=True)
    control = pixels(stack, ee.Geometry.Rectangle(CONTROL_BOX))
    print(f'control valley: {control.shape[1]} x {control.shape[0]} pixels', flush=True)
    return data, control


def control_flagged(d, p):
    """Share of the control valley floor the footprint flags (all of it is false alarm)."""
    valley = d['hand'] < p['hand_max_m']
    return round(float((classes(d, p)[valley] > 0).mean()), 4) if valley.any() else 0.0


def classes(d, p):
    """Footprint class per pixel (0 none, 1 optical, 2 radar, 3 both), same rule as footprint()."""
    spectral = d['dndvi'] < p['ndvi_drop']
    if p['cva_min'] is not None:
        spectral = spectral | (d['cva'] > p['cva_min'])
    optical = spectral & (d['ndvi_after'] < p['ndvi_after_max'])
    usable = (d['hand'] < p['hand_max_m']) & (d['bright'] < 0.5)
    return (optical & usable) + 2 * ((d['dvh'] > p['vh_db']) & usable)


def scores_np(d, p, method='any'):
    """score() on a downloaded area, without the patch filter (good enough to rank settings)."""
    import numpy as np
    inside = d['inside'] > 0.5
    code = 4 * (d['ref'][inside] > 0.5) + classes(d, p)[inside]
    counts = np.bincount(code.astype(int), minlength=8)
    return score({c: n * 0.0004 for c, n in enumerate(counts)}, METHODS[method])  # 20 m pixel = 0.0004 km²


def score(km2, flagged):
    """Agreement scores from areas keyed by 4*reference + footprint class (0-3)."""
    tp = sum(km2.get(4 + c, 0) for c in flagged)
    fp = sum(km2.get(c, 0) for c in flagged)
    fn = sum(km2.get(4 + c, 0) for c in range(4) if c not in flagged)
    ratio = lambda a, b: round(a / b, 3) if b else 0.0
    p, r = ratio(tp, tp + fp), ratio(tp, tp + fn)
    return {'precision': p, 'recall': r, 'f1': ratio(2 * p * r, p + r), 'iou': ratio(tp, tp + fp + fn),
            'ours_km2': round(tp + fp, 3), 'copernicus_km2': round(tp + fn, 3)}


def validate(fp, save=True):
    """Score the footprint against the Copernicus EMS mapped area in each EMSR927 area."""
    results, maps = {}, []
    ours = fp['change'].unmask(0)
    for label, product in EMSR_PRODUCTS.items():
        region = analysed_region(product)
        ref = ee.Image(0).paint(emsr_layer(product, 'observedEventA'), 1)
        res = ee.Image.pixelArea().divide(1e6).addBands(ref.multiply(4).add(ours)).reduceRegion(
            ee.Reducer.sum().group(groupField=1, groupName='code'), region, 20,
            maxPixels=1e10, tileScale=4).getInfo()
        km2 = {int(g['code']): g['sum'] for g in res['groups']}
        results[label] = {m: score(km2, flagged) for m, flagged in METHODS.items()}
        maps.append((label, region, ref))
    if not save:
        return results
    # Maps come after all scores, and a slow map is reported rather than losing the numbers.
    palette = [c.lstrip('#') for c in AGREE_COLORS.values()]
    hit = ours.gt(0)
    for label, region, ref in maps:
        agree = (ee.Image(0).where(hit.And(ref), 1).where(hit.And(ref.Not()), 2)
                 .where(hit.Not().And(ref), 3).selfMask())
        frame = (fp['s2_after'].visualize(**S2_VIS)
                 .blend(agree.clip(region).visualize(min=1, max=3, palette=palette))
                 .blend(ee.Image().paint(region, 1, 2).visualize(palette=['ffffff']))  # area outline
                 .reproject(ee.Projection('EPSG:32645').atScale(20)))  # analysis grid; finer runs out of memory
        try:
            save_png(frame, {}, region.bounds(), f'{FIG}/validation_{slug(label.split()[0])}.png')
        except RuntimeError as e:
            print(f'{label}: map not saved ({e})', flush=True)
    return results




# --- interactive maps (notebook) ----------------------------------------

def _split(left, right, center, zoom, labels):
    import geemap
    m = geemap.Map(center=center, zoom=zoom)
    m.split_map(left_layer=geemap.ee_tile_layer(*left), right_layer=geemap.ee_tile_layer(*right),
                left_label=labels[0], right_label=labels[1])
    return m


def before_after_map(name):
    d = before_after(name, save=False)
    if 'before' not in d:
        print(f'{name}: no Vantor coverage (before {d["dates_before"]}, after {d["dates_after"]})')
        return None
    return _split((d['before'], d['vis_before'], 'Before'), (d['after'], d['vis_after'], 'After'),
                  d['center'], 16, (f'Before ({d["dates_before"][-1]})', f'After ({d["dates_after"][0]})'))


def planet_map():
    may = planet_view('2026-05-27', '2026-05-28')
    aug = planet_view('2026-08-26', '2026-08-27')
    lon, lat = PLACES['Syabrubesi']
    return _split((may, PLANET_VIS, 'PlanetScope 27 May'), (aug, PLANET_VIS, 'PlanetScope 26 Aug'),
                  (lat, lon), 14, ('27 May 2026', '26 Aug 2026, about 2 h after'))


def footprint_map(fp):
    import geemap
    from ipyleaflet import Marker
    # Zoom 12 or closer: zoomed-out tiles of the 20 m patch grid exceed Earth Engine's memory limit.
    m = geemap.Map(center=(28.10, 85.28), zoom=12)
    m.add_layer(fp['s2_before'], S2_VIS, 'Sentinel-2, Aug-Oct 2025', shown=False)
    m.add_layer(fp['s2_after'], S2_VIS, 'Sentinel-2, Aug-Oct 2026')
    m.add_layer(fp['corridor'].selfMask(), {'palette': ['ffffff']}, 'Event corridor', shown=False, opacity=0.3)
    m.add_layer(fp['vh_change'], {'min': -6, 'max': 6, 'palette': ['2a78d6', 'f0efec', 'e34948']},
                'Sentinel-1 VH change (dB)', shown=False)
    m.add_layer(fp['change'], {'min': 1, 'max': 3, 'palette': [c.lstrip('#') for c in COLORS]}, 'Candidate change')
    m.add_legend(title='Candidate change', legend_dict=dict(zip(CLASSES.values(), COLORS)))
    for name, (lon, lat) in PLACES.items():
        m.add(Marker(location=(lat, lon), title=name, draggable=False))
    return m


# --- command line --------------------------------------------------------

def run_inventory():
    for label, cid in (('vantor', VANTOR), ('planet', PLANET)):
        rows = inventory(cid)
        path = f'{OUT}/inventory_{label}.csv'
        with open(path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['date', 'id', 'bands'])
            w.writeheader()
            w.writerows(rows)
        print(f'{label}: {len(rows)} images -> {path}')
        for r in rows:
            print(f'  {r["date"]}  {r["id"]}  [{r["bands"]}]')


def grid_figure(rows, path, note, legend=None):
    """Draft figure: each row is (title, png, title, png, ...); legend is {label: hex colour}."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch

    ncols = max(len(r) // 2 for r in rows)
    fig, axes = plt.subplots(len(rows), ncols, figsize=(5 * ncols, 5 * len(rows)), squeeze=False)
    for ax_row, row in zip(axes, rows):
        for ax, title, png in zip(ax_row, row[::2], row[1::2]):
            if png and os.path.exists(png):
                ax.imshow(plt.imread(png))
            ax.set_title(title)
            ax.axis('off')
    if legend:
        fig.legend(handles=[Patch(color=c, label=k) for k, c in legend.items()],
                   loc='lower center', ncol=len(legend), frameon=False, bbox_to_anchor=(0.5, 0.02))
    fig.text(0.5, 0.005, note, ha='center', fontsize=8)
    fig.tight_layout(rect=(0, 0.08 if legend else 0.02, 1, 1))  # keep the legend and note off the panels
    fig.savefig(path, dpi=150)
    plt.close(fig)
    print('saved', path)


def run_before_after():
    rows = []
    for d in (before_after(n) for n in BEFORE_AFTER_PLACES):
        print(f'{d["name"]}: before {d["dates_before"]}, after {d["dates_after"]}')
        ok, s = 'before' in d, slug(d['name'])
        # the newest scene is on top before the event, the earliest after it
        rows.append((f'{d["name"]}, before ({d["dates_before"][-1] if ok else "no coverage"})',
                     ok and f'{FIG}/{s}_before.png',
                     f'{d["name"]}, after ({d["dates_after"][0] if ok else "no coverage"})',
                     ok and f'{FIG}/{s}_after.png'))
    grid_figure(rows, f'{FIG}/before_after_draft.png',
                'Dates are the main scene; gaps are filled from older (before) or later (after) scenes. '
                'Imagery: Vantor Open Data, CC BY-NC 4.0')


def run_planet():
    # On 26 Aug the corridor is mostly under cloud; the clear gap is the Syabrubesi confluence.
    lon, lat = PLACES['Syabrubesi']
    box = ee.Geometry.Point([lon, lat]).buffer(3000).bounds()
    may, aug = f'{FIG}/planet_syabrubesi_2026-05-27.png', f'{FIG}/planet_syabrubesi_2026-08-26.png'
    save_png(planet_view('2026-05-27', '2026-05-28'), PLANET_VIS, box, may)
    save_png(planet_view('2026-08-26', '2026-08-27'), PLANET_VIS, box, aug)
    grid_figure([('Syabrubesi, 27 May 2026', may, 'Syabrubesi, 26 Aug 2026, about 2 h after the collapse', aug)],
                f'{FIG}/planet_draft.png', 'PlanetScope visual, 6 km box. Imagery: Planet Labs, CC BY-NC 4.0')


def run_export():
    """Compute the footprint once, tile by tile, into data/footprint/ as GeoTIFFs (slow: ~2 min a tile)."""
    fp = footprint()
    img = fp['change'].unmask(0).toByte()
    os.makedirs(FOOTPRINT_DIR, exist_ok=True)
    meta = f'{FOOTPRINT_DIR}/export.json'
    if os.path.exists(meta):
        os.remove(meta)  # written last, so a half-finished export is never taken for a whole one
    tiles = utm_tiles()
    for k, (x0, y1, w, h, name) in enumerate(tiles, 1):
        tif = retry(lambda: grid_pixels(img, x0, y1, w, h, fmt='GEO_TIFF'), f'tile {name}')
        with open(f'{FOOTPRINT_DIR}/tile_{name}.tif', 'wb') as f:
            f.write(tif)
        print(f'  tile {k}/{len(tiles)} saved', flush=True)
    with open(meta, 'w') as f:
        json.dump({'params': PARAMS, 'sentinel1_orbit': fp['orbit'], 'crs': 'EPSG:32645', 'scale_m': 20,
                   'tiles': tiles}, f, indent=2)
    print('saved', FOOTPRINT_DIR)


def run_footprint():
    """Areas and draft map from the exported footprint: local, so it takes seconds."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np

    change, (x0, y1) = load_footprint()
    counts = np.bincount(change.ravel(), minlength=4)
    with open(f'{FOOTPRINT_DIR}/export.json') as f:
        orbit = json.load(f)['sentinel1_orbit']
    result = {
        'areas_km2': {CLASSES[c]: round(float(counts[c]) * 0.0004, 2) for c in (1, 2, 3)},  # 20 m pixel
        'sentinel1_orbit': orbit,
        'thresholds': {**PARAMS, 'snow_ndsi': SNOW_NDSI, 'min_patch_px': MIN_PATCH_PX},
    }
    for k, v in result['areas_km2'].items():
        print(f'  {k:>26}: {v} km²')
    with open(f'{OUT}/footprint_areas.json', 'w') as f:
        json.dump(result, f, indent=2)
    print('saved', f'{OUT}/footprint_areas.json')

    # Sentinel-2 background on the same UTM grid at 60 m; each pixel shows the strongest class beneath it
    h, w = change.shape
    H, W = -(-h // 3), -(-w // 3)
    bg = grid_pixels(layers()['s2_after'].visualize(**S2_VIS), x0, y1, W, H, scale=60)
    rgb = np.dstack([bg['vis-red'], bg['vis-green'], bg['vis-blue']]).astype(float) / 255
    padded = np.zeros((H * 3, W * 3), change.dtype)
    padded[:h, :w] = change
    block = padded.reshape(H, 3, W, 3).max(axis=(1, 3))
    for c, color in zip((1, 2, 3), COLORS):
        rgb[block == c] = matplotlib.colors.to_rgb(color)
    plt.imsave(f'{FIG}/footprint_draft.png', rgb)
    print('saved', f'{FIG}/footprint_draft.png')


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

    # Draft figure: two single-series bar charts, values at the bar tips
    blue = SERIES[0]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 4))
    names, counts = order[::-1], [result['open_buildings']['by_stretch'][s] for s in order[::-1]]
    a1.barh(names, counts, color=blue, height=0.5)
    for y, (s, n) in enumerate(zip(names, counts)):
        # Open Buildings does not cover China, so the Lhende Khola (Gyirong Port) has no data, not zero buildings
        a1.text(n, y, ' no building data (Tibet)' if s == 'Lhende Khola' else f' {n:,}', va='center', fontsize=9)
    a1.set_title('Buildings inside the footprint, by stretch (Open Buildings)', fontsize=10)
    shares = [result['cems_pooled'][g]['share'] * 100 for g in CEMS_GRADES]
    a2.bar(CEMS_GRADES, shares, color=blue, width=0.5)
    for x, (g, s) in enumerate(zip(CEMS_GRADES, shares)):
        a2.text(x, s, f'{s:.0f}%\n({result["cems_pooled"][g]["in_footprint"]} of {result["cems_pooled"][g]["graded"]})',
                ha='center', va='bottom', fontsize=9)
    a2.set_ylim(0, 115)
    a2.set_ylabel('% inside our footprint')
    a2.set_title('Copernicus-graded buildings our footprint contains', fontsize=10)
    for ax in (a1, a2):
        ax.spines[['top', 'right']].set_visible(False)
    fig.tight_layout()
    fig.savefig(f'{FIG}/buildings_draft.png', dpi=150)
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

    # Draft figure: road km and bridges per stretch (stacked by type, legend present)
    names = order[::-1]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 4))
    left = [0.0] * len(names)
    for kind, color in zip(('main', 'local', 'track'), SERIES):
        vals = [road_km[s][kind] for s in names]
        a1.barh(names, vals, left=left, color=color, height=0.5, label=f'{kind} road')
        left = [a + b for a, b in zip(left, vals)]
    for y, v in enumerate(left):
        a1.text(v, y, f' {v:.1f} km', va='center', fontsize=9)
    a1.set_title('Road inside the footprint (OpenStreetMap)', fontsize=10)
    a1.legend(frameon=False, fontsize=8, loc='upper right')  # the top rows are short, so this corner is empty
    road_b, foot_b = [bridges[s]['road'] for s in names], [bridges[s]['foot'] for s in names]
    a2.barh(names, road_b, color=SERIES[0], height=0.5, label='road bridge')
    a2.barh(names, foot_b, left=road_b, color=SERIES[1], height=0.5, label='footbridge')
    for y, (a, b) in enumerate(zip(road_b, foot_b)):
        a2.text(a + b, y, f' {a + b}', va='center', fontsize=9)
    a2.set_title('Bridges at the footprint (OpenStreetMap)', fontsize=10)
    a2.legend(frameon=False, fontsize=8, loc='upper right')
    for ax in (a1, a2):
        ax.spines[['top', 'right']].set_visible(False)
    fig.text(0.5, 0.01, 'The Lhende Khola stretch lies mostly in Tibet, where OpenStreetMap is sparse.', ha='center', fontsize=8)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(f'{FIG}/infrastructure_draft.png', dpi=150)
    print('saved', f'{FIG}/infrastructure_draft.png')


def run_leadtime(n_draws=10_000, manning_n=0.05):
    """Analysis C: flood-front arrival times and minutes of warning along the corridor."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np

    chain, x, y, elev = river_profile()
    slope = smoothed_slope(chain, elev)

    # Settlements, plus hydropower plants on the main stem (from the cached OpenStreetMap download)
    places = {n: PLACES[n] for n in LEADTIME_PLACES}
    for el in osm_features():
        tags = el.get('tags', {})
        if tags.get('name') and (tags.get('power') == 'plant' or tags.get('generator:source') == 'hydro'):
            lon, lat = osm_points(el)
            places.setdefault(tags['name'], (sum(lon) / len(lon), sum(lat) / len(lat)))
    where = {}
    for name, (lon, lat) in places.items():
        px, py = to_utm(lon, lat)
        d = np.hypot(x - px, y - py)
        if d.min() < 1000:  # on the main stem, not a tributary
            where[name] = (float(chain[d.argmin()]), float(d.min()))
    s_syab, s_betr = where['Syabrubesi'][0], where['Betrawati'][0]

    # Monte Carlo over the observation windows
    rng = np.random.default_rng(0)
    t_syab = rng.uniform(PORT_MIN + s_syab / DEBRIS_MAX_MS / 60, SYABRUBESI_LATEST_MIN, n_draws)
    t_betr = rng.uniform(*BETRAWATI_WINDOW_MIN, n_draws)
    k = flood_seconds(chain, slope, 1.0, s_syab, s_betr) / ((t_betr - t_syab) * 60)

    def arrival(s):  # minutes after the collapse, one value per draw
        if s <= s_syab:  # debris-flow stretch: steady speed from Rasuwagadhi to Syabrubesi
            return PORT_MIN + (t_syab - PORT_MIN) * s / s_syab
        return t_syab + flood_seconds(chain, slope, 1.0, s_syab, s) / k / 60

    clock = lambda m: f'{round(COLLAPSE_NPT_MIN + m) // 60:02d}:{round(COLLAPSE_NPT_MIN + m) % 60:02d}'  # nearest minute
    rows = {}
    for name, (s, off) in sorted(where.items(), key=lambda kv: kv[1][0]):
        t = arrival(s)
        med, lo, hi = (float(v) for v in np.percentile(t, [50, 5, 95]))
        rows[name] = {'chainage_km': round(s / 1000, 1), 'off_river_m': round(off),
                      'arrival_min': round(med, 1), 'arrival_5_95_min': [round(lo, 1), round(hi, 1)],
                      'arrival_npt': clock(med), 'after_sms_min': round(med - SMS_MIN, 1),
                      'warning_with_auto_alert_min': round(med - AUTO_ALERT_MIN, 1),
                      'extrapolated': s > s_betr}
    depth = (0.6 * k * manning_n) ** 1.5  # Manning: c = 5/3 * h^(2/3) * S^(1/2) / n  =>  h from k
    result = {'places': rows, 'flood_speed_k': [round(float(v), 1) for v in np.percentile(k, [5, 50, 95])],
              'implied_flood_depth_m': {'manning_n': manning_n,
                                        '5_50_95': [round(float(v), 1) for v in np.percentile(depth, [5, 50, 95])]},
              'observations': {'gyirong_port_min': PORT_MIN, 'syabrubesi_latest_min': SYABRUBESI_LATEST_MIN,
                               'betrawati_window_min': BETRAWATI_WINDOW_MIN, 'sms_min': SMS_MIN}}

    print(f'{"place":>32} {"km":>5} {"arrival":>16} {"NPT":>6} {"vs SMS":>7} {"auto alert":>10}')
    for name, r in rows.items():
        lo, hi = r['arrival_5_95_min']
        mark = '*' if r['extrapolated'] else ' '
        print(f'{name:>32} {r["chainage_km"]:>5} {r["arrival_min"]:>6} ({lo:>4}-{hi:>4}) {r["arrival_npt"]:>6} '
              f'{r["after_sms_min"]:>+7} {r["warning_with_auto_alert_min"]:>9}{mark}')
    print('* below Betrawati: extrapolated beyond the last observation')
    print('implied flood depth (m, Manning n 0.05), 5/50/95 %:', result['implied_flood_depth_m']['5_50_95'])
    with open(f'{OUT}/leadtime.json', 'w') as f:
        json.dump(result, f, indent=2)
    print('saved', f'{OUT}/leadtime.json')

    # Draft figure: distance down the river against minutes after the collapse (a Marey chart)
    grid = np.linspace(0, chain[-1], 200)
    band = np.array([np.percentile(arrival(s), [5, 50, 95]) for s in grid])
    km = grid / 1000
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.fill_betweenx(km, band[:, 0], band[:, 2], color=SERIES[0], alpha=0.15, lw=0, label='model, 5-95 %')
    fit = grid <= s_betr
    ax.plot(band[fit, 1], km[fit], color=SERIES[0], lw=2, label='model median')
    ax.plot(band[~fit, 1], km[~fit], color=SERIES[0], lw=2, ls=(0, (4, 3)), label='median, beyond the last observation')
    obs = [(0, PORT_MIN, PORT_MIN), (s_syab, PORT_MIN + s_syab / DEBRIS_MAX_MS / 60, SYABRUBESI_LATEST_MIN),
           (s_betr, *BETRAWATI_WINDOW_MIN)]
    for i, (s, a, b) in enumerate(obs):  # a single observed time is a dot, a window a bar
        ax.plot([a, b], [s / 1000] * 2, color=SERIES[1], lw=4, solid_capstyle='round', marker='o' if a == b else None,
                ms=7, label='observed time or window' if i == 0 else None)
    ax.axvline(SMS_MIN, color='#52514e', lw=1)
    ax.text(SMS_MIN + 1, 1, 'SMS alert 09:15', fontsize=9, color='#52514e')
    ax.invert_yaxis()
    ax.set_xlim(0, max(90, band[-1, 2] + 5))
    labelled = []
    for name, r in rows.items():  # right edge: the curve runs top-left to bottom-right, so it stays clear
        if all(abs(r['chainage_km'] - k) >= 1 for k in labelled):  # same site mapped twice: label it once
            ax.text(ax.get_xlim()[1], r['chainage_km'], f'{name} ', fontsize=8, va='center', ha='right')
            labelled.append(r['chainage_km'])
    ax.set_xlabel('minutes after the collapse (08:37 NPT)')
    ax.set_ylabel('km down the river from Rasuwagadhi')
    ax.set_title('Flood-front arrival along the Bhote Koshi–Trishuli', fontsize=11)
    ax.legend(frameon=False, fontsize=8, loc='lower left')  # below and left of the curve is empty
    ax.spines[['top', 'right']].set_visible(False)
    ax.grid(color='#e1e0d9', lw=0.6)
    fig.tight_layout()
    fig.savefig(f'{FIG}/leadtime_draft.png', dpi=150)
    print('saved', f'{FIG}/leadtime_draft.png')


def run_validate():
    results = validate(footprint())
    print(f'{"area":>20} {"method":>8} {"precision":>9} {"recall":>6} {"F1":>5} {"IoU":>5} {"ours km²":>9} {"CEMS km²":>9}')
    for label, by_method in results.items():
        for m, s in by_method.items():
            print(f'{label:>20} {m:>8} {s["precision"]:>9} {s["recall"]:>6} {s["f1"]:>5} {s["iou"]:>5} '
                  f'{s["ours_km2"]:>9} {s["copernicus_km2"]:>9}')
    with open(f'{OUT}/validation.json', 'w') as f:
        json.dump(results, f, indent=2)
    print('saved', f'{OUT}/validation.json')
    grid_figure([sum(((f'{label}: F1 {results[label]["any"]["f1"]}', f'{FIG}/validation_{slug(label.split()[0])}.png')
                      for label in EMSR_PRODUCTS), ())],
                f'{FIG}/validation_draft.png',
                'Footprint (any method) against the Copernicus EMS EMSR927 mapped area; white line = analysed area.',
                legend=AGREE_COLORS)


def run_tune():
    """Sweep thresholds; leave-one-area-out gives an honest score for the chosen settings."""
    import itertools
    import statistics

    data, control = tune_inputs()
    keys = list(PARAMS)
    grid = [dict(zip(keys, v)) for v in itertools.product(
        (-0.05, -0.1, -0.15, -0.2),                   # ndvi_drop
        (None, 0.02, 0.03, 0.04, 0.06, 0.08, 0.10),   # cva_min
        (0.35, 0.45, 0.55),                           # ndvi_after_max
        (3, 4, 5, 6),                                 # vh_db
        (60, 100, 150))]                              # hand_max_m
    f1 = [{a: float(scores_np(d, p)['f1']) for a, d in data.items()} for p in grid]
    false_alarm = [control_flagged(control, p) for p in grid]
    ok = [i for i in range(len(grid)) if false_alarm[i] <= MAX_CONTROL_FLAGGED]
    mean = lambda i, areas: statistics.mean(f1[i][a] for a in areas)
    areas_ = list(data)
    print(f'{len(ok)} of {len(grid)} settings keep control false alarms <= {MAX_CONTROL_FLAGGED:.0%}')

    held_out = {}
    for test in areas_:
        train = [a for a in areas_ if a != test]
        best = max(ok, key=lambda i: mean(i, train))
        held_out[test] = {'params': grid[best], 'train_f1': round(mean(best, train), 3),
                          'control_flagged': false_alarm[best], 'test_scores': scores_np(data[test], grid[best])}
    final = max(ok, key=lambda i: mean(i, areas_))
    result = {
        'baseline': {'params': PARAMS, 'control_flagged': control_flagged(control, PARAMS),
                     'scores': {a: scores_np(d, PARAMS) for a, d in data.items()}},
        'leave_one_area_out': held_out,
        'final': {'params': grid[final], 'control_flagged': false_alarm[final],
                  'scores': {a: scores_np(d, grid[final]) for a, d in data.items()}},
        'unconstrained_best': {'params': grid[max(range(len(grid)), key=lambda i: mean(i, areas_))],
                               'control_flagged': false_alarm[max(range(len(grid)), key=lambda i: mean(i, areas_))]},
        'note': 'Scores here skip the 20 px patch filter; `validate` gives the exact numbers.',
    }
    print('baseline F1:', {a: float(s['f1']) for a, s in result['baseline']['scores'].items()},
          'control flagged:', result['baseline']['control_flagged'])
    for test, r in held_out.items():
        print(f'held out {test}: F1 {r["test_scores"]["f1"]} (trained on the others: {r["train_f1"]}, '
              f'control {r["control_flagged"]}) with {r["params"]}')
    print('final settings:', grid[final], 'control flagged:', false_alarm[final])
    print('final F1:', {a: float(s['f1']) for a, s in result['final']['scores'].items()})
    print('best without the control limit:', result['unconstrained_best'])
    with open(f'{OUT}/tuning.json', 'w') as f:
        json.dump(result, f, indent=2)
    print('saved', f'{OUT}/tuning.json')


STEPS = {'inventory': run_inventory, 'before-after': run_before_after, 'planet': run_planet,
         'export': run_export, 'footprint': run_footprint, 'validate': run_validate, 'buildings': run_buildings,
         'infrastructure': run_infrastructure, 'leadtime': run_leadtime}
EXTRA = {'tune': run_tune}  # run on demand only, not part of `all`


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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
