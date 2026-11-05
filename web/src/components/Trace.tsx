"use client";
// The stage record: flood-front distance down the river against minutes after the collapse (paper Fig. 7),
// with the pen as a time cursor shared by every view on the page.
import { useEffect, useRef, useState } from "react";
import { FIT_END_KM, KM_MAX, T_MAX, band, clock, kmAt, obs, places } from "@/lib/front";
import { SHORT } from "@/lib/format";
import { useWidth } from "@/lib/useWidth";
import { useTime } from "./Time";

/** The places the hero trace and the map on a phone have room for. */
export const HERO_STATIONS = ["Rasuwagadhi", "Syabrubesi", "Upper Trishuli 3A", "Betrawati", "Trishuli Bridge"];
const NARROW: Record<string, string> = {
  "Chilime Hydropower Powerhouse": "Chilime PH", "Upper Trishuli 3A": "U. Trishuli 3A", "Upper Trishuli-3B Powerhouse": "U. Trishuli 3B",
  "Trishuli Hydropower Station": "Trishuli PS", "Trishuli Bridge": "Bidur",
};

/** What the front is doing at minute t, in words and numbers. */
export function frontAt(t: number) {
  const km = kmAt(t, 2);
  const lo = kmAt(t, 3) ?? 0;
  const hi = kmAt(t, 1);
  const passed = Object.entries(places).filter(([, p]) => km !== null && p.km <= km).at(-1)?.[0];
  return { km, lo, hi, passed, extrapolated: km !== null && km > FIT_END_KM };
}

function describe(t: number) {
  const f = frontAt(t);
  if (f.km === null) return `${clock(t)} NPT, ${t} min after the collapse: debris flow in the Lhende Khola, not yet at Rasuwagadhi`;
  return `${clock(t)} NPT, ${t} min after the collapse: front at km ${f.km.toFixed(0)} below Rasuwagadhi (5–95 %: ${f.lo.toFixed(0)}–${(f.hi ?? f.km).toFixed(0)})${f.passed ? `, past ${SHORT[f.passed] ?? f.passed}` : ""}`;
}

export default function Trace({ full = false }: { full?: boolean }) {
  const { t, setT } = useTime();
  const [playing, setPlaying] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const [box, W] = useWidth<HTMLDivElement>(full ? 1100 : 760);
  const narrow = W < 560;
  const H = Math.round(full ? Math.min(Math.max(W * 0.56, 470), 640) : Math.min(Math.max(W * 0.72, 420), 560));
  const m = { l: narrow ? 114 : full ? 168 : 150, r: narrow ? 16 : 18, t: 50, b: 58 };
  const name = (n: string) => (narrow ? NARROW[n] : SHORT[n]) ?? n;
  const tick = narrow ? 20 : 10;
  const x = (min: number) => m.l + (min / T_MAX) * (W - m.l - m.r);
  const y = (km: number) => m.t + (km / KM_MAX) * (H - m.t - m.b);

  // Play: the pen runs from the collapse to the end of the line at ten minutes a second
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), cur = t >= 90 ? 0 : t;
    const step = (now: number) => {
      cur = Math.min(96, cur + ((now - last) / 1000) * 10);
      last = now;
      setT(cur);
      if (cur < 96) raf = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts from the pen's position when play is pressed
  }, [playing, setT]);

  const fromPointer = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const min = (((e.clientX - r.left) / r.width) * W - m.l) / (W - m.l - m.r) * T_MAX;
    if (min >= 0 && min <= T_MAX) setT(min);
  };

  const fit = band.filter(([k]) => k <= FIT_END_KM + 0.3);
  const beyond = band.filter(([k]) => k >= FIT_END_KM - 0.3);
  const path = (rows: number[][]) => rows.map(([k, , p50], i) => `${i ? "L" : "M"}${x(p50).toFixed(1)},${y(k).toFixed(1)}`).join("");
  const area = band.map(([k, p5]) => `${x(p5).toFixed(1)},${y(k).toFixed(1)}`).concat(
    [...band].reverse().map(([k, , , p95]) => `${x(p95).toFixed(1)},${y(k).toFixed(1)}`)).join(" ");

  // Station labels down the left edge, nudged apart where places sit close together
  let lastY = -99;
  const stations = Object.entries(places)
    .filter(([n]) => full || HERO_STATIONS.includes(n))
    .map(([n, p]) => {
      const ly = Math.max(y(p.km), lastY + 17);
      lastY = ly;
      return { n, km: p.km, ly };
    });

  const f = frontAt(t);
  const tx = x(t);

  return (
    <div className="trace" ref={box}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Flood-front arrival down the river against minutes after the 08:37 collapse. The front reached Syabrubesi at 08:49 and Betrawati at 09:20; the SMS alert went out at 09:15. Cursor: ${describe(t)}.`}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons) fromPointer(e); }}
      >
        <defs>
          <clipPath id={`plot-${full}`}><rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} /></clipPath>
        </defs>

        {/* chart paper: minor every 2 min and 2 km, major every 10 */}
        <g clipPath={`url(#plot-${full})`}>
          {Array.from({ length: T_MAX / 2 + 1 }, (_, i) => i * 2).map((v) => (
            <line key={`x${v}`} x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke={v % 10 ? "var(--rule)" : "var(--rule-2)"} />
          ))}
          {Array.from({ length: KM_MAX / 2 + 1 }, (_, i) => i * 2).map((v) => (
            <line key={`y${v}`} y1={y(v)} y2={y(v)} x1={m.l} x2={W - m.r} stroke={v % 10 ? "var(--rule)" : "var(--rule-2)"} />
          ))}
        </g>
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="none" stroke="var(--ink)" />

        {/* station lines, as on a graphical timetable */}
        {stations.map((s) => (
          <g key={s.n}>
            <line x1={m.l} x2={W - m.r} y1={y(s.km)} y2={y(s.km)} stroke="var(--ink-3)" strokeDasharray="1 3" />
            <path d={`M${m.l - 6},${s.ly}L${m.l - 2},${s.ly}L${m.l},${y(s.km)}`} fill="none" stroke="var(--ink-3)" />
            <text x={m.l - 9} y={s.ly} dy="0.33em" textAnchor="end" className="stn">
              {name(s.n).toUpperCase()} <tspan className="stn-km">{s.km.toFixed(0)}</tspan>
            </text>
          </g>
        ))}

        {/* axes */}
        {Array.from({ length: T_MAX / tick + 1 }, (_, i) => i * tick).map((v) => (
          <g key={v}>
            <text x={x(v)} y={H - m.b + 18} textAnchor="middle" className="ax">+{v}</text>
            <text x={x(v)} y={H - m.b + 34} textAnchor="middle" className="ax" opacity={0.85}>{clock(v)}</text>
          </g>
        ))}
        <text x={W - m.r} y={H - 6} textAnchor="end" className="ax-title">{narrow ? "MIN AFTER COLLAPSE · NPT" : "MINUTES AFTER THE COLLAPSE · NPT"}</text>
        <text x={8} y={16} className="ax-title">KM BELOW RASUWAGADHI</text>

        {/* alerts */}
        {full && (
          <g>
            <line x1={x(obs.auto_alert_min)} x2={x(obs.auto_alert_min)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={x(obs.auto_alert_min) + 5} y={H - m.b - 8} className="ax-title halo">{narrow ? "AUTO ALERT · 08:39" : "AUTOMATIC ALERT, WHAT-IF · 08:39"}</text>
          </g>
        )}
        <line x1={x(obs.sms_min)} x2={x(obs.sms_min)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeWidth={2} />
        <text x={x(obs.sms_min) + 6} y={m.t + 16} className="ax-title halo">SMS ALERT · 09:15</text>

        {/* model: 5-95 % band, median (solid where fitted, dashed where extrapolated) */}
        <polygon points={area} fill="var(--pen)" opacity={0.13} />
        <path d={path(fit)} fill="none" stroke="var(--pen)" strokeWidth={2.5} strokeLinejoin="round" pathLength={1}
          className={`median${full ? "" : " draw"}`} style={{ "--len": 1 } as React.CSSProperties} />
        <path d={path(beyond)} fill="none" stroke="var(--pen)" strokeWidth={2.5} strokeDasharray="6 4" />

        {/* observations, pen 2 */}
        <g stroke="var(--pen-2)" strokeLinecap="round" strokeWidth={6}>
          <line x1={x(obs.syabrubesi_window_min[0])} x2={x(obs.syabrubesi_window_min[1])} y1={y(obs.syabrubesi_km)} y2={y(obs.syabrubesi_km)} />
          <line x1={x(obs.betrawati_window_min[0])} x2={x(obs.betrawati_window_min[1])} y1={y(obs.betrawati_km)} y2={y(obs.betrawati_km)} />
        </g>
        <circle cx={x(obs.port_min)} cy={y(0)} r={5} fill="var(--pen-2)" stroke="var(--paper)" strokeWidth={2} />

        {/* the pen */}
        <g pointerEvents="none">
          <line x1={tx} x2={tx} y1={m.t} y2={H - m.b} stroke="var(--pen)" strokeWidth={1.5} />
          {f.km !== null && (
            <>
              <line x1={tx} x2={tx} y1={y(f.lo)} y2={y(f.hi ?? f.km)} stroke="var(--pen)" strokeWidth={9} strokeLinecap="round" opacity={0.28} />
              <line x1={m.l} x2={tx} y1={y(f.km)} y2={y(f.km)} stroke="var(--pen)" strokeDasharray="2 3" />
              <circle cx={tx} cy={y(f.km)} r={6} fill="var(--pen)" stroke="var(--paper)" strokeWidth={2.5} />
              <text x={tx + 10} y={y(f.km)} dy="0.33em" className="stn halo" fill="var(--pen)">km {f.km.toFixed(0)}</text>
            </>
          )}
          <rect x={tx - 26} y={m.t - 24} width={52} height={20} fill="var(--pen)" />
          <text x={tx} y={m.t - 9} textAnchor="middle" className="stn" fill="var(--paper)">{clock(t)}</text>
        </g>
      </svg>

      <div className="readout" aria-hidden="true">
        <span className="clock num">{clock(t)}</span>
        <span className="num"><b>+{t} min</b> after the collapse</span>
        {f.km === null ? (
          <span>Debris flow in the Lhende Khola, not yet at Rasuwagadhi</span>
        ) : (
          <span className="num">
            Front at <b>km {f.km.toFixed(0)}</b> (5–95 %: {f.lo.toFixed(0)}–{(f.hi ?? f.km).toFixed(0)})
            {f.passed && <> · past <b>{SHORT[f.passed] ?? f.passed}</b></>}
            {f.extrapolated && <> · extrapolated</>}
          </span>
        )}
      </div>
      <div className="pen-range">
        <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? "Pause" : "Play"}</button>
        <input
          type="range" min={0} max={T_MAX} step={1} value={t}
          onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
          aria-label="Minutes after the collapse"
          aria-valuetext={describe(t)}
        />
        <span className="num">{clock(T_MAX)}</span>
      </div>
    </div>
  );
}

export function TraceLegend({ full = false }: { full?: boolean }) {
  return (
    <ul className="legend">
      <li><svg width="26" height="12" aria-hidden="true"><rect y="1" width="26" height="10" fill="var(--pen)" opacity="0.15" /><line y1="6" y2="6" x2="26" stroke="var(--pen)" strokeWidth="2.5" /></svg>Model median, 5–95 %</li>
      <li><svg width="26" height="12" aria-hidden="true"><line y1="6" y2="6" x2="26" stroke="var(--pen)" strokeWidth="2.5" strokeDasharray="6 4" /></svg>Extrapolated below Betrawati</li>
      <li><svg width="26" height="12" aria-hidden="true"><line x1="4" x2="22" y1="6" y2="6" stroke="var(--pen-2)" strokeWidth="6" strokeLinecap="round" /></svg>Observed time or window</li>
      <li><svg width="14" height="14" aria-hidden="true"><line x1="7" x2="7" y2="14" stroke="var(--ink)" strokeWidth="2" /></svg>SMS alert</li>
      {full && <li><svg width="14" height="14" aria-hidden="true"><line x1="7" x2="7" y2="14" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>Automatic alert (what-if)</li>}
    </ul>
  );
}
