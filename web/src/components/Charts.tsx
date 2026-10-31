"use client";
// The paper's tables and bar figures, drawn from outputs/: every value is labelled or in a table, the hover
// readout only repeats it closer to the pointer.
import { useState } from "react";
import type { Method, Place, Score } from "@/lib/results";
import { pct } from "@/lib/format";
import { useWidth } from "@/lib/useWidth";
import { SHORT } from "./Trace";

const AREA = (a: string) => a.split(" ")[0];

type Tip = { x: number; y: number; value: string; label: string } | null;

/** One hover readout per chart: value first, label after. */
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const on = (value: string, label: string) => ({
    onPointerMove: (e: React.PointerEvent) => {
      const r = (e.currentTarget as Element).closest(".chart")!.getBoundingClientRect();
      setTip({ x: e.clientX - r.left, y: e.clientY - r.top, value, label });
    },
    onPointerLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent) => {
      const r = (e.currentTarget as Element).closest(".chart")!.getBoundingClientRect();
      const b = (e.currentTarget as Element).getBoundingClientRect();
      setTip({ x: b.left - r.left + b.width / 2, y: b.top - r.top, value, label });
    },
    onBlur: () => setTip(null),
    tabIndex: 0,
  });
  const el = tip && <div className="tip" style={{ left: tip.x, top: tip.y }}><b>{tip.value}</b> {tip.label}</div>;
  return { on, el };
}

/* ---------------- Exposure hatches, shared by the bar and the map legends ---------------- */

/** Optical: pen 1 at 45 degrees; radar: pen 2 at -45 degrees; both flagged: the two crossed. Rendered once per page. */
export function HatchDefs() {
  const rise = <path d="M-2,2L2,-2M0,8L8,0M6,10L10,6" stroke="var(--pen)" strokeWidth="1.5" />;
  const fall = <path d="M-2,6L2,10M0,0L8,8M6,-2L10,2" stroke="var(--pen-2)" strokeWidth="1.5" />;
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <pattern id="hatch-1" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="var(--pen-wash)" />{rise}</pattern>
        <pattern id="hatch-2" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="var(--pen-2-wash)" />{fall}</pattern>
        <pattern id="hatch-3" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="var(--paper)" />{fall}{rise}</pattern>
      </defs>
    </svg>
  );
}

/* ---------------- Footprint: one bar, three classes ---------------- */

export function FootprintStack({ areas }: { areas: Record<string, number> }) {
  const parts = [
    { name: "Optical only", v: areas["Optical only"], hatch: 1, pen: "var(--pen)" },
    { name: "Both", v: areas["Both (higher confidence)"], hatch: 3, pen: "var(--pen)" },
    { name: "Radar only", v: areas["Radar only"], hatch: 2, pen: "var(--pen-2)" },
  ];
  const total = parts.reduce((s, p) => s + p.v, 0);
  const { on, el } = useTip();
  const [box, cw] = useWidth<HTMLDivElement>(760);
  const W = Math.max(cw, 280);
  let x = 0;
  return (
    <div className="chart" style={{ position: "relative" }}>
      <div className="chart-body" ref={box}>
        <svg viewBox={`0 0 ${W} 134`} role="img" aria-label={`Footprint ${total.toFixed(1)} km²: ${parts.map((p) => `${p.name.toLowerCase()} ${p.v} km²`).join(", ")}.`}>
          {parts.map((p, i) => {
            const w = Math.max((p.v / total) * W - 2, 2), x0 = x;
            x += (p.v / total) * W;
            const label = i < 2
              ? <g key="l"><text x={x0} y={104} className="lbl">{p.name.toUpperCase()}</text><text x={x0} y={122} className="val">{p.v} km²</text></g>
              : <g key="l"><line x1={x0 + w / 2} x2={x0 + w / 2} y1={8} y2={30} stroke="var(--ink-3)" /><text x={x0 - 6} y={14} textAnchor="end" className="lbl">{p.name.toUpperCase()} <tspan className="val">{p.v} km²</tspan></text></g>;
            return (
              <g key={p.name} {...on(`${p.v} km²`, p.name.toLowerCase())} style={{ outline: "none" }}>
                <rect x={x0} y={30} width={w} height={50} fill={`url(#hatch-${p.hatch})`} stroke={p.pen} strokeWidth={1.25} />
                {label}
              </g>
            );
          })}
        </svg>
      </div>
      {el}
    </div>
  );
}

/* ---------------- Validation: Table III with inline meters ---------------- */

const METHODS: { key: Method; label: string }[] = [
  { key: "any", label: "Footprint" }, { key: "optical", label: "Optical" }, { key: "radar", label: "Radar" }, { key: "both", label: "Both" },
];

export function ValidationTable({ scores }: { scores: Record<string, Record<Method, Score>> }) {
  const [method, setMethod] = useState<Method>("any");
  const cols: (keyof Score)[] = ["precision", "recall", "f1", "iou"];
  return (
    <div>
      <div className="figure-head">
        <div className="switch" role="group" aria-label="Which pixels count as flagged">
          {METHODS.map((m) => <button key={m.key} type="button" aria-pressed={method === m.key} onClick={() => setMethod(m.key)}>{m.label}</button>)}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <caption>Agreement with Copernicus EMS EMSR927 · {METHODS.find((m) => m.key === method)!.label === "Footprint" ? "whole footprint" : `${method} pixels only`}</caption>
          <thead>
            <tr><th>Area</th><th>Precision</th><th>Recall</th><th>F1</th><th>IoU</th><th className="r hide-sm">Ours, km²</th><th className="r hide-sm">Copernicus, km²</th></tr>
          </thead>
          <tbody>
            {Object.entries(scores).map(([area, s]) => (
              <tr key={area}>
                <th scope="row">{area}</th>
                {cols.map((c) => (
                  <td key={c} className="num">
                    {s[method][c].toFixed(2)}
                    <svg width="100%" height="6" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", maxWidth: 90, marginTop: 3 }}>
                      <rect width="100" height="6" fill="var(--paper-2)" />
                      <rect width={s[method][c] * 100} height="6" fill={c === "f1" ? "var(--pen)" : "var(--ink)"} />
                    </svg>
                  </td>
                ))}
                <td className="num r hide-sm">{s[method].ours_km2.toFixed(2)}</td>
                <td className="num r hide-sm">{s[method].copernicus_km2.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Validation: F1 from the first rule to the tuned one, and held out ---------------- */

export function F1Change({ first, final, heldOut }: { first: Record<string, number>; final: Record<string, number>; heldOut: Record<string, number> }) {
  const { on, el } = useTip();
  const areas = Object.keys(final);
  const [box, cw] = useWidth<HTMLDivElement>(520);
  const W = Math.max(cw, 280), H = 60 + areas.length * 62, l = W < 420 ? 92 : 120, r = 24;
  const x = (v: number) => l + ((v - 0.5) / 0.5) * (W - l - r);
  return (
    <div className="chart flat" style={{ position: "relative" }}>
      <div className="chart-body" ref={box}>
        <ul className="legend" style={{ marginBottom: "0.5rem" }}>
          <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8" /></svg>First rule, no change vector</li>
          <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="var(--pen)" /></svg>Chosen rule</li>
          <li><svg width="14" height="14" aria-hidden="true"><line x1="7" x2="7" y1="1" y2="13" stroke="var(--pen-2)" strokeWidth="3" /></svg>Held out (leave one area out)</li>
        </ul>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`F1 by area. ${areas.map((a) => `${AREA(a)}: first rule ${first[a].toFixed(2)}, chosen ${final[a].toFixed(2)}, held out ${heldOut[a].toFixed(2)}`).join("; ")}.`}>
          {Array.from({ length: 26 }, (_, i) => 0.5 + i * 0.02).map((v, i) => (
            <line key={v} x1={x(v)} x2={x(v)} y1={14} y2={H - 26} stroke={i === 0 ? "var(--ink)" : i % 5 ? "var(--rule)" : "var(--rule-2)"} />
          ))}
          {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((v) => (
            <text key={v} x={x(v)} y={H - 8} textAnchor="middle" className="mut">{v.toFixed(1)}</text>
          ))}
          {areas.map((a, i) => {
            const y = 40 + i * 62;
            return (
              <g key={a} {...on(`F1 ${first[a].toFixed(2)} → ${final[a].toFixed(2)}`, `${AREA(a)}, held out ${heldOut[a].toFixed(2)}`)} style={{ outline: "none" }}>
                <rect x={0} y={y - 28} width={W} height={56} className="hit" />
                <text x={0} y={y} dy="0.33em" className="lbl">{AREA(a).toUpperCase()}</text>
                <line x1={x(first[a])} x2={x(final[a])} y1={y} y2={y} stroke="var(--ink)" strokeWidth={2} />
                <circle cx={x(first[a])} cy={y} r={6} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2} />
                <line x1={x(heldOut[a])} x2={x(heldOut[a])} y1={y - 13} y2={y + 13} stroke="var(--pen-2)" strokeWidth={3} />
                <circle cx={x(final[a])} cy={y} r={7} fill="var(--pen)" stroke="var(--paper)" strokeWidth={2} />
                <text x={x(first[a])} y={y - 14} textAnchor="middle" className="mut">{first[a].toFixed(2)}</text>
                <text x={x(final[a])} y={y + 26} textAnchor="middle" className="val" fontWeight={600}>{final[a].toFixed(2)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {el}
    </div>
  );
}

/* ---------------- Buildings: share of Copernicus-graded buildings inside, by grade ---------------- */

type Counts = Record<string, { graded: number; in_footprint: number }>;

export function BuildingsChart({ pooled, byArea }: { pooled: Counts; byArea: Record<string, Counts> }) {
  const [area, setArea] = useState("All");
  const { on, el } = useTip();
  const data = area === "All" ? pooled : byArea[area];
  const grades = ["Destroyed", "Damaged", "Possibly damaged"];
  const max = Math.max(...grades.map((g) => data[g].graded));
  const [box, cw] = useWidth<HTMLDivElement>(640);
  const W = Math.max(cw, 280), l = W < 480 ? 112 : 150, r = W < 480 ? 92 : 150, rowH = 58;
  return (
    <div>
      <div className="figure-head">
        <div className="switch" role="group" aria-label="Copernicus area">
          {["All", ...Object.keys(byArea)].map((a) => <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)}>{a === "All" ? "All three areas" : AREA(a)}</button>)}
        </div>
      </div>
      <div className="chart" style={{ position: "relative" }}>
        <div className="chart-body" ref={box}>
          <ul className="legend" style={{ marginBottom: "0.5rem" }}>
            <li><svg width="22" height="14" aria-hidden="true"><rect x="1" y="1" width="20" height="12" fill="var(--paper)" stroke="var(--pen-2)" strokeWidth="1.5" /></svg>Graded by Copernicus</li>
            <li><svg width="22" height="14" aria-hidden="true"><rect width="22" height="14" fill="var(--pen)" /></svg>Inside our footprint</li>
          </ul>
          <svg viewBox={`0 0 ${W} ${grades.length * rowH + 8}`} role="img"
            aria-label={grades.map((g) => `${g}: ${data[g].in_footprint} of ${data[g].graded} inside`).join("; ")}>
            {grades.map((g, i) => {
              const y = 8 + i * rowH, w = (data[g].graded / max) * (W - l - r), wi = (data[g].in_footprint / max) * (W - l - r);
              const share = data[g].graded ? data[g].in_footprint / data[g].graded : 0;
              return (
                <g key={g} {...on(`${pct(share)}`, `${data[g].in_footprint.toLocaleString("en")} of ${data[g].graded.toLocaleString("en")} ${g.toLowerCase()} inside`)} style={{ outline: "none" }}>
                  <rect x={0} y={y - 4} width={W} height={rowH - 6} className="hit" />
                  <text x={l - 12} y={y + 18} textAnchor="end" className="lbl">{(W < 480 && g === "Possibly damaged" ? "Possibly" : g).toUpperCase()}</text>
                  <rect x={l} y={y} width={Math.max(w, 1)} height={34} fill="var(--paper)" stroke="var(--pen-2)" strokeWidth={1.5} />
                  <rect x={l} y={y} width={wi} height={34} fill="var(--pen)" />
                  <text x={l + Math.max(w, wi) + 10} y={y + 15} className="val" fontWeight={600}>{pct(share)}</text>
                  <text x={l + Math.max(w, wi) + 10} y={y + 31} className="mut">{data[g].in_footprint.toLocaleString("en")} of {data[g].graded.toLocaleString("en")}</text>
                </g>
              );
            })}
          </svg>
        </div>
        {el}
      </div>
    </div>
  );
}

/* ---------------- Open data undercount: Open Buildings against Copernicus, inside the footprint ---------------- */

export function UndercountChart({ cems, open }: { cems: Record<string, number>; open: Record<string, number> }) {
  const { on, el } = useTip();
  const areas = Object.keys(cems);
  const max = Math.max(...areas.map((a) => cems[a]));
  const [box, cw] = useWidth<HTMLDivElement>(520);
  const W = Math.max(cw, 280), l = 96, r = 56, rowH = 66;
  return (
    <div className="chart" style={{ position: "relative" }}>
      <div className="chart-body" ref={box}>
        <ul className="legend" style={{ marginBottom: "0.5rem" }}>
          <li><svg width="22" height="14" aria-hidden="true"><rect width="22" height="14" fill="var(--pen-2)" /></svg>Copernicus, graded destroyed</li>
          <li><svg width="22" height="14" aria-hidden="true"><rect width="22" height="14" fill="var(--ink)" /></svg>Open Buildings footprints</li>
        </ul>
        <svg viewBox={`0 0 ${W} ${areas.length * rowH}`} role="img"
          aria-label={`Buildings inside our footprint: ${areas.map((a) => `${AREA(a)} Copernicus ${cems[a]}, Open Buildings ${open[a]}`).join("; ")}.`}>
          {areas.map((a, i) => {
            const y = 6 + i * rowH, s = (v: number) => (v / max) * (W - l - r);
            return (
              <g key={a} {...on(`${open[a].toLocaleString("en")} against ${cems[a].toLocaleString("en")}`, `${AREA(a)}: Open Buildings against Copernicus`)} style={{ outline: "none" }}>
                <rect x={0} y={y - 4} width={W} height={rowH - 4} className="hit" />
                <text x={l - 12} y={y + 22} textAnchor="end" className="lbl">{AREA(a).toUpperCase()}</text>
                <rect x={l} y={y} width={s(cems[a])} height={22} fill="var(--pen-2)" />
                <rect x={l} y={y + 24} width={s(open[a])} height={22} fill="var(--ink)" />
                <text x={l + s(cems[a]) + 8} y={y + 16} className="val num">{cems[a].toLocaleString("en")}</text>
                <text x={l + s(open[a]) + 8} y={y + 40} className="val num">{open[a].toLocaleString("en")}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {el}
    </div>
  );
}

/* ---------------- Lead time: Table IV with diverging warning bars ---------------- */

export function WarningTable({ places }: { places: Record<string, Place> }) {
  const [alert, setAlert] = useState<"sms" | "auto">("sms");
  const rows = Object.entries(places).filter(([n]) => n !== "Upper Trishuli 3A Powerhouse");
  const lo = -35, hi = 60, toX = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div>
      <div className="figure-head">
        <div className="switch" role="group" aria-label="Which alert">
          <button type="button" aria-pressed={alert === "sms"} onClick={() => setAlert("sms")}>SMS alert, 09:15</button>
          <button type="button" aria-pressed={alert === "auto"} onClick={() => setAlert("auto")}>Automatic alert, 08:39</button>
        </div>
        <ul className="legend">
          <li><svg width="22" height="14" aria-hidden="true"><rect width="22" height="14" fill="var(--pen)" /></svg>Flood arrived first</li>
          <li><svg width="22" height="14" aria-hidden="true"><rect width="22" height="14" fill="var(--ink)" /></svg>Minutes of warning</li>
        </ul>
      </div>
      <div className="table-wrap">
        <table>
          <caption>Flood-front arrival and warning time (Table IV)</caption>
          <thead>
            <tr>
              <th>Place</th><th className="r hide-sm">km</th><th className="r">Arrival, NPT</th><th className="r hide-sm">5–95 %</th>
              <th style={{ width: "38%" }}>{alert === "sms" ? "Warning from the SMS alert, min" : "Warning from an automatic alert, min"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([n, p]) => {
              const v = alert === "sms" ? p.after_sms_min : p.warning_with_auto_alert_min;
              const a = Math.min(toX(0), toX(v)), w = Math.abs(toX(v) - toX(0));
              return (
                <tr key={n}>
                  <th scope="row">{SHORT[n] ?? n}{p.extrapolated && <sup>*</sup>}</th>
                  <td className="num r hide-sm">{p.chainage_km.toFixed(0)}</td>
                  <td className="num r">{p.arrival_npt}</td>
                  <td className="num r hide-sm">{[...new Set(p.arrival_5_95_min.map((v) => v.toFixed(0)))].join("–")} min</td>
                  <td>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 3.5rem", alignItems: "center", gap: "0.5rem" }}>
                      <svg width="100%" height="18" viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">
                        {Array.from({ length: (hi - lo) / 5 + 1 }, (_, i) => lo + i * 5).map((m) => (
                          <line key={m} x1={toX(m)} x2={toX(m)} y1={0} y2={18} stroke={m % 10 ? "var(--rule)" : "var(--rule-2)"} vectorEffect="non-scaling-stroke" />
                        ))}
                        <rect x={a} y={3} width={Math.max(w, 0.4)} height={12} fill={v < 0 ? "var(--pen)" : "var(--ink)"} />
                        <line x1={toX(0)} x2={toX(0)} y1={0} y2={18} stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                      </svg>
                      <span className="num" style={{ textAlign: "right", fontWeight: 600, color: v < 0 ? "var(--pen)" : "var(--ink)" }}>{v > 0 ? "+" : v < 0 ? "−" : ""}{Math.abs(Math.round(v))}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={5}>* Extrapolated below Betrawati, past the last observation. Negative: the front passed before the alert went out. Arrival is the model median; 5–95 % in minutes after the collapse.</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
