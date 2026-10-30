"""Event imagery: what the Vantor and Planet open-data collections hold, and before/after views."""
import csv
import datetime as dt

import ee

from .common import EVENT, FIG, OUT, PLACES, grid_figure, save_png, slug


BEFORE_AFTER_PLACES = ['Syabrubesi', 'Timure', 'Trishuli Bridge']  # Vantor post-event coverage
VANTOR = 'projects/sat-io/open-datasets/VANTOR-DISASTER-DATA/NEPAL_FLOOD_2026'
PLANET = 'projects/sat-io/open-datasets/PLANET-DISASTER-DATA/NEPAL_FLOOD_2026'
RGB = ['red', 'green', 'blue']  # band names in the Vantor and Planet visual products


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
    grid_figure([('Syabrubesi, 27 May 2026', may, 'Syabrubesi, 26 Aug 2026\nabout 2 h after the collapse', aug)],
                f'{FIG}/planet_draft.png', 'PlanetScope visual, 6 km box. Imagery: Planet Labs, CC BY-NC 4.0')
