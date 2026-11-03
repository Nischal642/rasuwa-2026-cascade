"""Settings and Earth Engine helpers shared by every analysis."""
import glob
import json
import os
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

# Event corridor: the footprint only counts change along the path the debris and flood took, so other
# rivers (Tadi), the 24-28 Sep rains elsewhere and snowfields are not counted as this event.
# MERIT upstream area: main stem 3,054 km² at Rasuwagadhi; Tibetan reach above the Lhende 2,141;
# Tadi 551; Langtang 519 (checked 2026-10-30).
MAIN_STEM_KM2 = 2500
LHENDE_BOX = [85.385, 28.27, 85.53, 28.36]  # the Lhende Khola valley the debris came down
SERIES = ['#2a78d6', '#eb6834', '#1baf7a']  # charts of other things: categorical slots 1-3, in order
S2_VIS = {'bands': ['B4', 'B3', 'B2'], 'min': 0, 'max': 0.3}
EMSR = 'data/emsr927'  # unpacked Copernicus EMS products
EMSR_PRODUCTS = {  # latest delivered map per area inside AOI_BOX (AOI05 Phosretar lies mostly downstream)
    'Syabrubesi (AOI01)': 'EMSR927_AOI01_GRA_PRODUCT_v1',
    'Timure (AOI02)': 'EMSR927_AOI02_GRA_PRODUCT_v2',
    'Bidur (AOI03)': 'EMSR927_AOI03_GRA_MONIT01_v1',
}
FIG, OUT = 'figures', 'outputs'


def init(project=None):
    ee.Initialize(project=project or os.environ.get('EE_PROJECT'))
    ee.data.setDeadline(300_000)  # 5 min: a stalled request fails and can be retried instead of hanging


def grid_pixels(img, x0, y1, w, h, scale=20, fmt='NUMPY_NDARRAY'):
    """An image on a UTM 45N grid whose top-left corner is (x0, y1)."""
    return ee.data.computePixels({
        'expression': img, 'fileFormat': fmt,
        'grid': {'dimensions': {'width': int(w), 'height': int(h)},
                 'affineTransform': {'scaleX': scale, 'shearX': 0, 'translateX': x0,
                                     'shearY': 0, 'scaleY': -scale, 'translateY': y1},
                 'crsCode': 'EPSG:32645'}})


def aoi():
    return ee.Geometry.Rectangle(AOI_BOX)


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


def emsr_features(product, kind):
    """GeoJSON features of one EMSR927 layer (observedEventA, builtUpP, ...); [] if the product has none.
    A few Copernicus features carry no geometry: they are left out."""
    files = glob.glob(f'{EMSR}/{product}/*_{kind}_v*.json')
    if not files:
        return []
    with open(files[0]) as f:
        return [g for g in json.load(f)['features'] if g['geometry']]


def save_png(img, vis, region, path, size=1024):
    url = img.getThumbURL({**vis, 'region': region, 'dimensions': size, 'format': 'png'})
    with open(path, 'wb') as f:
        f.write(retry(lambda: urllib.request.urlopen(url, timeout=300).read(), 'download'))
    print('saved', path, flush=True)


def to_utm(lon, lat):
    from pyproj import Transformer
    return Transformer.from_crs('EPSG:4326', 'EPSG:32645', always_xy=True).transform(lon, lat)


def grid_figure(rows, path, note, legend=None, width_in=3.5):
    """Figure one IEEE column wide, fonts at print size: each row is (title, png, title, png, ...);
    legend is {label: hex colour}."""
    import textwrap
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch

    ncols = max(len(r) // 2 for r in rows)
    panel_in = width_in / ncols
    images = [p for r in rows for p in r[1::2] if p and os.path.exists(p)]
    aspect = max(plt.imread(p).shape[0] / plt.imread(p).shape[1] for p in images)
    note = textwrap.fill(note, int(width_in * 72 / 3.3))  # 6 pt text is about 3.3 pt a character
    foot_in = (note.count('\n') + 1) * 0.11 + (0.22 if legend else 0.04)
    height_in = len(rows) * (panel_in * aspect + 0.3) + foot_in  # 0.3 in: a two-line 7 pt title per row
    fig, axes = plt.subplots(len(rows), ncols, figsize=(width_in, height_in), squeeze=False)
    for ax_row, row in zip(axes, rows):
        for ax, title, png in zip(ax_row, row[::2], row[1::2]):
            if png and os.path.exists(png):
                ax.imshow(plt.imread(png))
            ax.set_title('\n'.join(textwrap.fill(t, int(panel_in * 72 / 3.9)) for t in title.split('\n')), fontsize=7)
            ax.axis('off')
    note_h = (note.count('\n') + 1) * 0.11 / height_in
    if legend:
        fig.legend(handles=[Patch(color=c, label=k) for k, c in legend.items()], fontsize=7, handlelength=1,
                   columnspacing=1, loc='lower center', ncol=len(legend), frameon=False, bbox_to_anchor=(0.5, note_h))
    fig.text(0.5, 0.004, note, ha='center', va='bottom', fontsize=6)
    fig.tight_layout(rect=(0, foot_in / height_in, 1, 1), pad=0.2, h_pad=0.4, w_pad=0.4)  # legend and note below
    fig.savefig(path, dpi=300, bbox_inches='tight', pad_inches=0.02)  # two-line titles on aspect-locked panels can sit above the layout box
    plt.close(fig)
    print('saved', path)
