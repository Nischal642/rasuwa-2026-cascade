"""Analysis A, part 2: the footprint scored against Copernicus EMS EMSR927, and its thresholds tuned."""
import glob
import json

import ee

from .common import EMSR, EMSR_PRODUCTS, FIG, OUT, S2_VIS, grid_figure, grid_pixels, save_png, slug
from .footprint import PARAMS, footprint, layers


# Langtang Khola valley, east of the Bhote Koshi: untouched in 2026, so anything flagged there is a
# false alarm. Settings that flag more of its valley floor than this are rejected while tuning.
CONTROL_BOX = [85.40, 28.14, 85.56, 28.24]
MAX_CONTROL_FLAGGED = 0.02

# Values swept by `tune` for each footprint threshold (keys as in footprint.PARAMS; None switches CVA off):
# 4 x 7 x 3 x 4 x 3 = 1,008 settings
TUNE_GRID = {
    'ndvi_drop': (-0.05, -0.1, -0.15, -0.2),
    'cva_min': (None, 0.02, 0.03, 0.04, 0.06, 0.08, 0.10),
    'ndvi_after_max': (0.35, 0.45, 0.55),
    'vh_db': (3, 4, 5, 6),
    'hand_max_m': (60, 100, 150),
}

# Which footprint classes count as "flagged" for each method being scored
METHODS = {'any': {1, 2, 3}, 'optical': {1, 3}, 'radar': {2, 3}, 'both': {3}}
AGREE_COLORS = {'Both flag it': '#1baf7a', 'Only our footprint': '#eb6834', 'Only Copernicus': '#2a78d6'}


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
    grid_figure([sum(((f'{label}\nF1 {results[label]["any"]["f1"]:.2f}', f'{FIG}/validation_{slug(label.split()[0])}.png')
                      for label in EMSR_PRODUCTS), ())],
                f'{FIG}/validation_draft.png',
                'Footprint (any method) against the Copernicus EMS EMSR927 mapped area; white line = analysed area.',
                legend=AGREE_COLORS)


def run_tune():
    """Sweep thresholds; leave-one-area-out gives an honest score for the chosen settings."""
    import itertools
    import statistics

    data, control = tune_inputs()
    grid = [dict(zip(TUNE_GRID, v)) for v in itertools.product(*TUNE_GRID.values())]
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
