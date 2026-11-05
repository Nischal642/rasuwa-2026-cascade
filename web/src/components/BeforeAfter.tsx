"use client";
// Before and after at the same spot: drag (or use the arrow keys) to move the split.
import { useState } from "react";
import imagery from "@/data/imagery.json";
import { day as fmt } from "@/lib/format";

const VIEWS = [
  ...Object.entries(imagery).map(([name, s]) => ({
    key: s.slug, label: name, before: `/img/${s.slug}_before.webp`, after: `/img/${s.slug}_after.webp`,
    left: `Before · ${fmt(s.before)}`, right: `After · ${fmt(s.after)}`,
    note: `Vantor (Maxar) Open Data, 0.35 to 0.65 m, a 1.5 km box at ${name}. Dates are the main scene; gaps are filled from older (before) or later (after) scenes. CC BY-NC 4.0.`,
  })),
  {
    key: "planet", label: "Syabrubesi, that morning", before: "/img/planet_syabrubesi_2026-05-27.webp", after: "/img/planet_syabrubesi_2026-08-26.webp",
    left: "27 May 2026", right: "26 Aug 2026 · 2 to 3 h after",
    note: "PlanetScope at Syabrubesi, 6 km box, two to three hours after the collapse. The Bhote Koshi and the Trishuli below the confluence run brown and wide; the Langtang Khola does not. Planet Labs, CC BY-NC 4.0.",
  },
];

const WIDE = "(min-width: 1200px)";
const wide = (src: string) => src.replace(/\.webp$/, "_1600.webp");

export default function BeforeAfter() {
  const [view, setView] = useState(VIEWS[0]);
  const [split, setSplit] = useState(50);
  return (
    <figure className="figure">
      <div className="figure-head">
        <div className="switch" role="group" aria-label="Place">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" aria-pressed={v.key === view.key} onClick={() => setView(v)}>{v.label}</button>
          ))}
        </div>
      </div>
      <div className="ba" style={{ "--split": `${split}%` } as React.CSSProperties}>
        {/* 1,600 px only where the figure is that wide; a phone keeps the 1,024 px files whatever its pixel density */}
        <picture>
          <source media={WIDE} srcSet={wide(view.before)} />
          <img src={view.before} alt={`${view.label}, ${view.left}`} width={1024} height={909} loading="lazy" decoding="async" />
        </picture>
        <picture>
          <source media={WIDE} srcSet={wide(view.after)} />
          <img src={view.after} alt={`${view.label}, ${view.right}`} className="after" width={1024} height={909} loading="lazy" decoding="async" />
        </picture>
        <input type="range" min={0} max={100} step={0.5} value={split} onChange={(e) => setSplit(Number(e.target.value))}
          aria-label="Move the split between before and after" aria-valuetext={`${Math.round(split)} % before`} />
        <div className="divider">
          <div className="knob">
            <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true"><path d="M6 1L1 6l5 5M16 1l5 5-5 5" fill="none" stroke="var(--ink)" strokeWidth="1.8" /></svg>
          </div>
        </div>
        <span className="plate corner l">{view.left}</span>
        <span className="plate corner r">{view.right}</span>
      </div>
      <figcaption className="caption"><b>Figs. 1–2</b> {view.note}</figcaption>
    </figure>
  );
}
