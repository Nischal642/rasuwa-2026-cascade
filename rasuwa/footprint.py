"""Analysis A, part 1: the impact footprint from Sentinel-2 and Sentinel-1 change in the event corridor."""
import json
import os

import ee

from .common import EVENT, FIG, LHENDE_BOX, MAIN_STEM_KM2, OUT, PLACES, S2_VIS, aoi, grid_pixels, retry, to_utm


# Footprint thresholds, chosen by `python -m rasuwa tune` on 2026-10-30 (outputs/tuning.json):
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
FOOTPRINT_DIR = 'data/footprint'  # exported footprint: GeoTIFF tiles, 20 m, UTM 45N (opens in QGIS)


def utm_tiles(n=4):
    """AOI_BOX on the 20 m UTM 45N grid, split into n x n edge-to-edge tiles: (x0, y1, width, height, name)."""
    xs, ys = zip(*aoi().bounds(ee.ErrorMargin(1), 'EPSG:32645').coordinates().getInfo()[0])
    x0, y1 = 20 * (min(xs) // 20), 20 * -(-max(ys) // 20)
    w, h = int(-(-(max(xs) - x0) // 20)), int(-(-(y1 - min(ys)) // 20))
    tw, th = -(-w // n), -(-h // n)
    return [(x0 + i * tw * 20, y1 - j * th * 20, min(tw, w - i * tw), min(th, h - j * th), f'{j}{i}')
            for j in range(n) for i in range(n)]


def load_footprint():
    """The exported footprint as one array (class 0-3 per 20 m pixel) and its top-left corner."""
    import numpy as np
    from PIL import Image

    with open(f'{FOOTPRINT_DIR}/export.json') as f:
        meta = json.load(f)
    if meta['params'] != PARAMS:
        raise SystemExit(f'The exported footprint was made with {meta["params"]}, but PARAMS is now {PARAMS}. '
                         'Run `python -m rasuwa export` first.')
    rows = {}
    for x0, y1, w, h, name in meta['tiles']:
        rows.setdefault(name[0], []).append(np.array(Image.open(f'{FOOTPRINT_DIR}/tile_{name}.tif')))
    return np.vstack([np.hstack(rows[j]) for j in sorted(rows)]), meta['tiles'][0][:2]


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
            'orbit': orbit}


def footprint():
    """Candidate change on the valley floor: 1 optical only, 2 radar only, 3 both."""
    p = PARAMS
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
    return {**L, 'change': change}


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
    rgb[(rgb == 0).all(axis=2)] = 1  # grid edges with no Sentinel-2 data: white, not black
    for c, color in zip((1, 2, 3), COLORS):
        rgb[block == c] = matplotlib.colors.to_rgb(color)

    # Map one IEEE column wide: places, scale bar, north arrow and legend at print size
    from matplotlib import patheffects
    from matplotlib.patches import Patch
    fig, ax = plt.subplots(figsize=(3.5, 3.5 * H / W))
    ax.imshow(rgb)
    ax.axis('off')
    halo = [patheffects.withStroke(linewidth=1.5, foreground='white')]
    for name in ('Rasuwagadhi', 'Syabrubesi', 'Betrawati', 'Bidur'):
        px, py = to_utm(*PLACES[name])
        col, row = (px - x0) / 60, (y1 - py) / 60  # 60 m background pixels
        ax.plot(col, row, 'o', ms=2.5, color='black', path_effects=halo)
        ax.text(col + 10, row, name, fontsize=7, va='center', path_effects=halo)
    km10 = 10_000 / 60
    ax.plot([25, 25 + km10], [60, 60], color='black', lw=2, solid_capstyle='butt', path_effects=halo)
    ax.text(25 + km10 / 2, 50, '10 km', fontsize=7, ha='center', va='bottom', path_effects=halo)
    ax.annotate('N', xy=(25 + km10 + 40, 30), xytext=(25 + km10 + 40, 75), fontsize=7, ha='center', va='top',
                arrowprops={'arrowstyle': '-|>', 'color': 'black'}, path_effects=halo)  # UTM grid north
    ax.legend(handles=[Patch(color=c, label=CLASSES[k]) for k, c in zip((1, 2, 3), COLORS)], fontsize=7,
              loc='lower right', handlelength=1, framealpha=0.9)
    fig.tight_layout(pad=0.1)
    fig.savefig(f'{FIG}/footprint_draft.png', dpi=300)
    print('saved', f'{FIG}/footprint_draft.png')
