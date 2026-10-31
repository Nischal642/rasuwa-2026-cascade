"""Analysis C: flood-front arrival times and minutes of warning along the corridor."""
import json

import ee

from .common import FIG, MAIN_STEM_KM2, OUT, PLACES, SERIES, aoi, to_utm
from .exposure import osm_features, osm_points


# Flood-front timing on 26 Aug 2026, minutes after the 08:37 NPT collapse (USGS event us7000tbwb). Sources, as cited
# in the paper: Xinhua, 28 Aug 2026 (collapse to Gyirong Port); The Kathmandu Post, 27 Aug 2026, summarising the
# Flood Forecasting Division's technical report (gauges, SMS). Chainage 0 = Rasuwagadhi / Gyirong Port.
COLLAPSE_NPT_MIN = 8 * 60 + 37
PORT_MIN = 7                      # "about seven minutes" from the collapse to Gyirong Port, ~20 km below it
SYABRUBESI_LATEST_MIN = 13        # gauge read 1.62 m at 08:40 and stopped transmitting at 08:50
BETRAWATI_WINDOW_MIN = (38, 48)   # gauge stopped transmitting at 09:20 (last 3.55 m); our +-5 min band around it
DEBRIS_MAX_MS = 52                # collapse to Gyirong Port speed; the debris flow did not go faster
SMS_MIN = 38                      # SMS alerts went out 09:15-09:16 (more than 600,000 messages)
AUTO_ALERT_MIN = 2                # what-if: an automatic alert two minutes after the seismic signal
LEADTIME_PLACES = ['Rasuwagadhi', 'Timure', 'Syabrubesi', 'Betrawati', 'Trishuli Bridge']


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


def arrival_model(n_draws=10_000):
    """The flood-front model, as a dict: the main-stem profile (chain, x, y), the places on it ({name: (lon, lat)}
    and {name: (chainage m, m off the river)}), the Syabrubesi and Betrawati chainages, the speed factor k per
    Monte Carlo draw, and arrival(s): minutes after the collapse at chainage s, one value per draw."""
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

    return {'chain': chain, 'x': x, 'y': y, 'places': places, 'where': where, 's_syab': s_syab, 's_betr': s_betr,
            'k': k, 'arrival': arrival}


def run_leadtime(n_draws=10_000, manning_n=0.05):
    """Analysis C: flood-front arrival times and minutes of warning along the corridor."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np

    m = arrival_model(n_draws)
    chain, where, s_syab, s_betr, k, arrival = (m[n] for n in ('chain', 'where', 's_syab', 's_betr', 'k', 'arrival'))
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
    # The first five draws, for the worked example on the method page: k = (travel time at k = 1) / (observed trip)
    t_syab, t_betr, t_ut = (arrival(s) for s in (s_syab, s_betr, where['Upper Trishuli 3A'][0]))
    example = {'k1_seconds': {'betrawati': round(float(k[0] * (t_betr[0] - t_syab[0]) * 60)),
                              'upper_trishuli_3a': round(float(k[0] * (t_ut[0] - t_syab[0]) * 60))},
               'draws': [{'syabrubesi_min': round(float(a), 2), 'betrawati_min': round(float(b), 2), 'k': round(float(kk), 1),
                          'upper_trishuli_3a_min': round(float(u), 2)} for a, b, kk, u in zip(t_syab, t_betr, k, t_ut[:5])]}
    result = {'places': rows, 'flood_speed_k': [round(float(v), 1) for v in np.percentile(k, [5, 50, 95])],
              'worked_example': example,
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

    # Figure one IEEE column wide: distance down the river against minutes after the collapse (a Marey chart)
    grid = np.linspace(0, chain[-1], 200)
    band = np.array([np.percentile(arrival(s), [5, 50, 95]) for s in grid])
    km = grid / 1000
    fig, ax = plt.subplots(figsize=(3.5, 3.4))
    ax.fill_betweenx(km, band[:, 0], band[:, 2], color=SERIES[0], alpha=0.15, lw=0, label='model 5–95 %')
    fit = grid <= s_betr
    ax.plot(band[fit, 1], km[fit], color=SERIES[0], lw=1.2, label='model median')
    ax.plot(band[~fit, 1], km[~fit], color=SERIES[0], lw=1.2, ls=(0, (4, 2)), label='median, extrapolated')
    obs = [(0, PORT_MIN, PORT_MIN), (s_syab, PORT_MIN + s_syab / DEBRIS_MAX_MS / 60, SYABRUBESI_LATEST_MIN),
           (s_betr, *BETRAWATI_WINDOW_MIN)]
    for i, (s, a, b) in enumerate(obs):  # a single observed time is a dot, a window a bar
        ax.plot([a, b], [s / 1000] * 2, color=SERIES[1], lw=2.5, solid_capstyle='round', marker='o' if a == b else None,
                ms=4, label='observed time or window' if i == 0 else None)
    ax.axvline(SMS_MIN, color='#52514e', lw=0.8)
    ax.text(SMS_MIN + 1, 1, 'SMS alert 09:15', fontsize=6, color='#52514e', va='top')
    ax.invert_yaxis()
    ax.set_xlim(0, max(100, band[-1, 2] + 5))
    # right edge: the curve runs top-left to bottom-right, so it stays clear; names as in Table IV of the paper
    short = {'Chilime Hydropower Powerhouse': 'Chilime powerhouse', 'Upper Trishuli-3B Powerhouse': 'Upper Trishuli 3B',
             'Trishuli Hydropower Station': 'Trishuli power station', 'Trishuli Bridge': 'Trishuli Bridge, Bidur'}
    from matplotlib import patheffects
    halo = [patheffects.withStroke(linewidth=2, foreground='white')]
    last = -10.0
    for name, r in rows.items():  # sorted down the river
        if r['chainage_km'] - last < 1:  # same site mapped twice: label it once
            continue
        y = max(r['chainage_km'], last + 2.6)  # 2.6 km is one 6 pt line at this size: nudge close sites apart
        ax.text(ax.get_xlim()[1], y, f'{short.get(name, name)} ', fontsize=6, va='center', ha='right', path_effects=halo)
        last = y
    ax.set_xlabel('minutes after the collapse (08:37 NPT)', fontsize=7)
    ax.set_ylabel('km down the river from Rasuwagadhi', fontsize=7)
    ax.set_title('Flood-front arrival along the Bhote Koshi–Trishuli', fontsize=8)
    ax.legend(fontsize=6, loc='lower left', framealpha=1, edgecolor='none')  # below and left of the curve is empty
    ax.tick_params(labelsize=7)
    ax.spines[['top', 'right']].set_visible(False)
    ax.grid(color='#e1e0d9', lw=0.5)
    fig.tight_layout(pad=0.2)
    fig.savefig(f'{FIG}/leadtime_draft.png', dpi=300)
    print('saved', f'{FIG}/leadtime_draft.png')
