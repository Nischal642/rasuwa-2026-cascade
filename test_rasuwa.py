"""Checks the scoring and the numpy footprint rule: `python test_rasuwa.py` (no Earth Engine needed)."""
import numpy as np

from rasuwa.validation import classes, score

# Keys are 4*reference + footprint class: 0-3 outside the Copernicus area, 4-7 inside it.
km2 = {0: 100.0, 1: 1.0, 3: 1.0, 4: 2.0, 5: 3.0, 6: 1.0, 7: 4.0}

s = score(km2, {1, 2, 3})  # flagged = classes 1-3
# tp = 3+1+4 = 8, fp = 1+1 = 2, fn = 2 (reference, class 0)
assert (s['precision'], s['recall'], s['iou']) == (0.8, 0.8, 0.667), s
assert s['f1'] == 0.8 and s['ours_km2'] == 10 and s['copernicus_km2'] == 10, s

s = score(km2, {3})  # only "both": tp = 4, fp = 1, fn = 2+3+1 = 6
assert (s['precision'], s['recall']) == (0.8, 0.4), s

assert score({}, {3})['f1'] == 0.0  # no data does not divide by zero

# Footprint rule on four pixels: vegetation lost / debris on bare ground / radar only / too high above the river
px = np.array([(-0.5, 0.1, 0.02, 0.0, 10, 0), (0.0, 0.1, 0.20, 0.0, 10, 0),
               (0.0, 0.8, 0.00, 5.0, 10, 0), (-0.5, 0.1, 0.20, 5.0, 500, 0)],
              dtype=[(k, 'f4') for k in ('dndvi', 'ndvi_after', 'cva', 'dvh', 'hand', 'bright')])
p = {'ndvi_drop': -0.2, 'cva_min': None, 'ndvi_after_max': 0.35, 'vh_db': 3, 'hand_max_m': 60}
assert classes(px, p).tolist() == [1, 0, 2, 0]                     # without CVA, debris on bare ground is missed
assert classes(px, {**p, 'cva_min': 0.1}).tolist() == [1, 1, 2, 0]  # with CVA it is caught
# Reading the footprint at lon/lat points: build a 3 x 3 grid and probe two pixel centres and one point outside
from pyproj import Transformer

from rasuwa.exposure import footprint_class_at

grid = np.array([[0, 1, 0], [0, 0, 3], [2, 0, 0]], np.uint8)
x0, y1 = 340000.0, 3130000.0  # top-left corner in UTM 45N
to_lonlat = Transformer.from_crs('EPSG:32645', 'EPSG:4326', always_xy=True)
pts = [to_lonlat.transform(x0 + 30, y1 - 10),   # row 0, col 1 -> 1
       to_lonlat.transform(x0 + 50, y1 - 30),   # row 1, col 2 -> 3
       to_lonlat.transform(x0 - 100, y1 + 100)]  # off the grid -> 0
lon, lat = zip(*pts)
assert footprint_class_at(lon, lat, grid, x0, y1).tolist() == [1, 3, 0]
# with a 20 m tolerance, the off-diagonal empty pixel (row 0, col 0) sees its flagged neighbour
corner = to_lonlat.transform(x0 + 10, y1 - 10)
assert footprint_class_at([corner[0]], [corner[1]], grid, x0, y1, tol_m=20).tolist() == [1]

# Road length inside the footprint: a 60 m east-west line through row 1 crosses one flagged pixel (col 2)
from rasuwa.exposure import line_inside_m

(la, pa), (lb, pb) = to_lonlat.transform(x0, y1 - 30), to_lonlat.transform(x0 + 60, y1 - 30)
assert abs(line_inside_m([la, lb], [pa, pb], grid, x0, y1) - 20) <= 5  # sampled every ~5 m: within one step
assert abs(line_inside_m([la, lb], [pa, pb], grid, x0, y1, step_m=0.5) - 20) <= 0.5
# Flood travel time: constant slope 0.01 and k = 100 give 10 m/s, so 6 km takes 600 s
from rasuwa.leadtime import flood_seconds, smoothed_slope

chain = np.array([0.0, 3000.0, 6000.0])
assert abs(flood_seconds(chain, np.full(3, 0.01), 100, 0, 6000) - 600) < 1
# a steady 1 % bed: smoothed slope is 0.01 everywhere, including the ends
assert np.allclose(smoothed_slope(np.arange(0, 5001, 100.0), 1000 - 0.01 * np.arange(0, 5001, 100.0)), 0.01)
print('test_rasuwa: ok')
