// The flood-front model as exported by `python -m rasuwa web`: shared by the trace chart and the maps.
import river from "@/data/river.json";

export const PEN = "#c42b3a";
export const PEN_2 = "#2357a8";
export const INK = "#17211c";
export const PAPER = "#f2f5f0";

export const COLLAPSE_MIN = 8 * 60 + 37; // 08:37 NPT
export const T_MAX = 100; // minutes shown on the trace
export const KM_MAX = 70;
export const { band, line, places, observations: obs, fit_end_km: FIT_END_KM } = river;

/** Clock time (NPT) t minutes after the collapse. */
export function clock(t: number) {
  const m = Math.round(COLLAPSE_MIN + t);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Kilometre the front had reached at t, for one column of the band (1: 5 %, 2: median, 3: 95 % arrival).
 *  null before it reached Rasuwagadhi; the last kilometre once it is past the end of the line. */
export function kmAt(t: number, col: 1 | 2 | 3): number | null {
  if (t < band[0][col]) return null;
  for (let i = 1; i < band.length; i++) {
    const [k0, k1, a, b] = [band[i - 1][0], band[i][0], band[i - 1][col], band[i][col]];
    if (t <= b) return b === a ? k1 : k0 + ((t - a) / (b - a)) * (k1 - k0);
  }
  return band[band.length - 1][0];
}

/** The river line from its start to kilometre km, cut at the exact point. */
export function lineTo(km: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < line.length; i++) {
    const [lon, lat, k] = line[i];
    if (k <= km) { out.push([lon, lat]); continue; }
    const [plon, plat, pk] = line[i - 1] ?? line[i];
    const f = k === pk ? 0 : (km - pk) / (k - pk);
    out.push([plon + f * (lon - plon), plat + f * (lat - plat)]);
    break;
  }
  return out;
}

/** The river line between two kilometres. */
export function lineBetween(a: number, b: number): [number, number][] {
  const start = lineTo(a).at(-1);
  const rest = line.filter(([, , k]) => k > a && k < b).map(([lon, lat]) => [lon, lat] as [number, number]);
  const end = lineTo(b).at(-1);
  return [start, ...rest, end].filter(Boolean) as [number, number][];
}
