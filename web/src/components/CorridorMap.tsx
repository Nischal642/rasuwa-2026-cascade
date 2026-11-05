"use client";
// The corridor on relief inked in the paper's greens, in three views: the front over time, the footprint against
// Copernicus EMSR927, and the graded buildings, roads and bridges it contains. Maps start when scrolled near.
import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { GeoJSONSource, LngLatBoundsLike, Map as MLMap, Marker, StyleSpecification } from "maplibre-gl";
import { AREA } from "@/lib/format";
import { INK, PAPER, PEN, PEN_2, clock, line, lineBetween, lineTo, places } from "@/lib/front";
import { SHORT } from "@/lib/format";
import { HERO_STATIONS, frontAt } from "./Trace";
import { useTime } from "./Time";

type View = "front" | "footprint" | "exposure";
type ML = typeof import("maplibre-gl");

const RELIEF_PAPER = "#eaf0e8";
const CORRIDOR: LngLatBoundsLike = [[85.075, 27.845], [85.54, 28.37]];
const AREAS: Record<string, LngLatBoundsLike> = {}; // filled from copernicus.geojson
const LEFT = ["Timure", "Chilime Hydropower Powerhouse", "Upper Trishuli 3A", "Trishuli Hydropower Station"];
const PLATE: Record<View, string> = { front: "Map · the front", footprint: "Map · footprint", exposure: "Map · graded assets" };
const HYDRO = ["Chilime Hydropower Powerhouse", "Upper Trishuli 3A", "Upper Trishuli-3B Powerhouse", "Trishuli Hydropower Station"];

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    dem: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 13,
      attribution: '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (Mapzen; SRTM and others)',
    },
    s2: {
      type: "raster",
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
      tileSize: 256,
      maxzoom: 15,
      attribution: '<a href="https://s2maps.eu">Sentinel-2 cloudless 2024</a> by EOX IT Services GmbH (modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0',
    },
  },
  layers: [
    { id: "paper", type: "background", paint: { "background-color": RELIEF_PAPER } },
    { id: "s2", type: "raster", source: "s2", layout: { visibility: "none" }, paint: { "raster-saturation": -0.15 } },
    {
      id: "relief",
      type: "hillshade",
      source: "dem",
      paint: {
        "hillshade-shadow-color": "#5f8069",
        "hillshade-highlight-color": "#fbfdf9",
        "hillshade-accent-color": "#3f5a48",
        "hillshade-exaggeration": 0.62,
      },
    },
  ],
};

const FOOTPRINT_WASH = `color-mix(in oklab, ${PEN} 22%, ${RELIEF_PAPER})`; // the faint footprint layer as it reads on the relief
const fc = (features: Feature[]): FeatureCollection => ({ type: "FeatureCollection", features });
const lineFeature = (coords: [number, number][]) => fc(coords.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] : []);

/** Exposure hatches, as on the darkroom record: optical is pen 1 at 45 degrees, radar pen 2 at -45 degrees,
 *  and a pixel both flagged carries both, crossed. */
function hatch(cls: 1 | 2 | 3) {
  const s = 12, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.fillStyle = ["", "rgb(196 43 58 / 0.2)", "rgb(35 87 168 / 0.2)", PAPER][cls];
  g.fillRect(0, 0, s, s);
  g.lineWidth = 2.6;
  const draw = (color: string, rising: boolean) => {
    g.strokeStyle = color;
    for (const o of [-s, 0, s]) { // neighbours too, so the hatch runs on across tiles
      g.beginPath();
      g.moveTo(o, rising ? s : 0);
      g.lineTo(o + s, rising ? 0 : s);
      g.stroke();
    }
  };
  if (cls !== 2) draw(PEN, true);
  if (cls !== 1) draw(PEN_2, false);
  return g.getImageData(0, 0, s, s);
}

/** Bridges are diamonds, so they read apart from the round building marks by shape, not only by colour. */
function diamond() {
  const s = 28, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.moveTo(s / 2, 2);
  g.lineTo(s - 2, s / 2);
  g.lineTo(s / 2, s - 2);
  g.lineTo(2, s / 2);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = PAPER;
  g.stroke();
  return g.getImageData(0, 0, s, s);
}

async function addFootprint(map: MLMap, faint: boolean) {
  const data = await fetch("/data/footprint.geojson").then((r) => r.json());
  map.addSource("footprint", { type: "geojson", data, attribution: "Footprint: this study, from Sentinel-1 and -2" });
  if (faint) {
    map.addLayer({ id: "fp", type: "fill", source: "footprint", paint: { "fill-color": PEN, "fill-opacity": 0.22 } });
    return;
  }
  for (const cls of [1, 2, 3] as const) {
    map.addImage(`hatch-${cls}`, hatch(cls), { pixelRatio: 2 });
    map.addLayer({ id: `fp-${cls}`, type: "fill", source: "footprint", filter: ["==", ["get", "cls"], cls], paint: { "fill-pattern": `hatch-${cls}` } });
  }
  // a hairline in the same pen keeps the narrow ribbon legible at corridor scale
  map.addLayer({ id: "fp-edge", type: "line", source: "footprint", paint: { "line-color": ["match", ["get", "cls"], 2, PEN_2, PEN], "line-width": 1 } });
}

async function addCopernicus(map: MLMap) {
  const data: FeatureCollection = await fetch("/data/copernicus.geojson").then((r) => r.json());
  for (const f of data.features) {
    if (f.properties?.kind !== "area" || f.geometry.type !== "Polygon") continue;
    const xs = f.geometry.coordinates[0].map((c) => c[0]), ys = f.geometry.coordinates[0].map((c) => c[1]);
    AREAS[f.properties.area] = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  }
  map.addSource("cems", { type: "geojson", data, attribution: "Copernicus EMS EMSR927 © European Union" });
}

/** Place markers; on a narrow map every label sits east of its mark, so none runs off the western edge. */
function placeMarkers(ml: ML, map: MLMap, names: string[], withTime: Record<string, string> | null, narrow: boolean) {
  return names.map((n) => {
    const p = places[n as keyof typeof places];
    const left = !narrow && LEFT.includes(n);
    const el = document.createElement("div");
    el.className = `mk${left ? " left" : ""}`;
    const label = document.createElement("span");
    label.textContent = SHORT[n] ?? n;
    if (withTime) label.insertAdjacentHTML("beforeend", `<em>${withTime[n]}</em>`);
    el.append(label);
    const mk = new ml.Marker({ element: el, anchor: left ? "right" : "left", offset: [left ? 5 : -5, 0] })
      .setLngLat([p.lon, p.lat]).addTo(map);
    return { n, km: p.km, mk, el };
  });
}

export default function CorridorMap({ view, arrivals }: { view: View; arrivals?: Record<string, string> }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<{ n: string; km: number; mk: Marker; el: HTMLElement }[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [cems, setCems] = useState(true);
  const [grade, setGrade] = useState("Destroyed");
  const { t } = useTime();

  useEffect(() => {
    const el = box.current!;
    let m: MLMap | undefined, dead = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      try {
        const ml = await import("maplibre-gl");
        if (dead) return;
        ml.setWorkerUrl("/maplibre-gl-worker.mjs");
        m = new ml.Map({
          container: el, style: STYLE, bounds: CORRIDOR, fitBoundsOptions: { padding: 24 },
          cooperativeGestures: true, attributionControl: { compact: true }, minZoom: 8, maxZoom: 16,
        });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
        m.on("error", (ev) => console.warn("[map]", ev.error?.message));
        m.on("load", async () => {
          const mm = m!;
          const narrow = el.clientWidth < 600;
          await addFootprint(mm, view !== "footprint");
          if (view === "front") {
            mm.addSource("river", { type: "geojson", data: lineFeature(line.map(([a, b]) => [a, b])) });
            mm.addSource("unc", { type: "geojson", data: lineFeature([]) });
            mm.addSource("front", { type: "geojson", data: lineFeature([]) });
            mm.addLayer({ id: "river", type: "line", source: "river", paint: { "line-color": INK, "line-width": 1.5, "line-opacity": 0.7 } });
            mm.addLayer({ id: "unc", type: "line", source: "unc", layout: { "line-cap": "round" }, paint: { "line-color": PEN, "line-width": 14, "line-opacity": 0.28 } });
            mm.addLayer({ id: "front", type: "line", source: "front", layout: { "line-cap": "round" }, paint: { "line-color": PEN, "line-width": 4.5 } });
            markers.current = placeMarkers(ml, mm, Object.keys(places).filter((n) => !narrow || HERO_STATIONS.includes(n)), arrivals ?? null, narrow);
          } else {
            await addCopernicus(mm);
            if (view === "footprint") mm.addLayer({ id: "cems-event", type: "line", source: "cems", filter: ["==", ["get", "kind"], "event"], paint: { "line-color": INK, "line-width": 1.6 } });
            mm.addLayer({ id: "cems-area", type: "line", source: "cems", filter: ["==", ["get", "kind"], "area"], paint: { "line-color": INK, "line-width": 1.2, "line-dasharray": [4, 3] } });
            if (view === "exposure") {
              const exposed = await fetch("/data/exposure.geojson").then((r) => r.json());
              mm.addSource("exposed", { type: "geojson", data: exposed, attribution: "Copernicus EMS EMSR927 © European Union" });
              const r = ["interpolate", ["linear"], ["zoom"], 10, 2.2, 14, 4.5, 16, 7] as const;
              mm.addLayer({ id: "road-in", type: "line", source: "exposed", filter: ["all", ["==", ["get", "kind"], "road"], ["get", "inside"]], paint: { "line-color": PEN_2, "line-width": 3 } });
              mm.addLayer({ id: "road-out", type: "line", source: "exposed", filter: ["all", ["==", ["get", "kind"], "road"], ["!", ["get", "inside"]]], paint: { "line-color": PEN_2, "line-width": 2.5, "line-dasharray": [2, 1.5] } });
              mm.addLayer({ id: "bld-in", type: "circle", source: "exposed", filter: ["all", ["==", ["get", "kind"], "building"], ["get", "inside"]], paint: { "circle-radius": r as never, "circle-color": PEN_2, "circle-stroke-color": PAPER, "circle-stroke-width": 0.8 } });
              mm.addLayer({ id: "bld-out", type: "circle", source: "exposed", filter: ["all", ["==", ["get", "kind"], "building"], ["!", ["get", "inside"]]], paint: { "circle-radius": r as never, "circle-color": PAPER, "circle-stroke-color": PEN_2, "circle-stroke-width": 1.6 } });
              mm.addImage("bridge-mark", diamond(), { pixelRatio: 2 });
              mm.addLayer({ id: "bridge", type: "symbol", source: "exposed", filter: ["==", ["get", "kind"], "bridge"], layout: { "icon-image": "bridge-mark", "icon-allow-overlap": true, "icon-ignore-placement": true } });
              markers.current = placeMarkers(ml, mm, narrow ? [] : HYDRO, null, narrow);
              const tip = new ml.Popup({ closeButton: false, closeOnClick: false, className: "tip-pop", offset: 10 });
              const marks = ["bld-in", "bld-out", "bridge", "road-in", "road-out"];
              const show = (p: Record<string, unknown>, at: [number, number] | { lng: number; lat: number }) => {
                const what = p.kind === "building" ? `Building, graded ${String(p.grade).toLowerCase()}` : p.kind === "road" ? "Road, graded destroyed" : "Bridge, graded destroyed";
                tip.setLngLat(at).setHTML(`<b>${what}</b><br>${p.inside ? "inside" : "outside"} our footprint · ${String(p.area)}`).addTo(mm);
              };
              for (const id of marks) {
                mm.on("mouseenter", id, (ev) => show(ev.features?.[0]?.properties ?? {}, ev.lngLat));
                mm.on("mouseleave", id, () => tip.remove());
              }
              mm.on("click", (ev) => { // touch has no hover: a tap shows the nearest mark, a tap elsewhere clears it
                const f = mm.queryRenderedFeatures([[ev.point.x - 8, ev.point.y - 8], [ev.point.x + 8, ev.point.y + 8]], { layers: marks })[0];
                if (f) show(f.properties, ev.lngLat); else tip.remove();
              });
            }
          }
          if (!dead) { map.current = mm; setReady(true); }
        });
      } catch (err) {
        console.warn("[map]", err);
        setFailed(true);
      }
    }, { rootMargin: "500px" });
    io.observe(el);
    return () => { dead = true; io.disconnect(); m?.remove(); map.current = null; };
  }, [view, arrivals]);

  // Front view: the line the front has run, its 5-95 % reach, and the places it has passed
  useEffect(() => {
    const mm = map.current;
    if (!ready || !mm || view !== "front") return;
    const f = frontAt(t);
    (mm.getSource("front") as GeoJSONSource).setData(lineFeature(f.km === null ? [] : lineTo(f.km)));
    (mm.getSource("unc") as GeoJSONSource).setData(lineFeature(f.km === null ? [] : lineBetween(f.lo, f.hi ?? f.km)));
    for (const k of markers.current) k.el.classList.toggle("hit", f.km !== null && f.km >= k.km);
  }, [t, ready, view]);

  useEffect(() => {
    const mm = map.current;
    if (!ready || !mm) return;
    mm.setLayoutProperty("s2", "visibility", satellite ? "visible" : "none");
    mm.setLayoutProperty("relief", "visibility", satellite ? "none" : "visible");
  }, [satellite, ready]);

  useEffect(() => {
    const mm = map.current;
    if (!ready || !mm || view !== "footprint") return;
    for (const id of ["cems-event", "cems-area"]) mm.setLayoutProperty(id, "visibility", cems ? "visible" : "none");
  }, [cems, ready, view]);

  useEffect(() => {
    const mm = map.current;
    if (!ready || !mm || view !== "exposure") return;
    const g = grade === "All" ? true : ["==", ["get", "grade"], grade];
    mm.setFilter("bld-in", ["all", ["==", ["get", "kind"], "building"], ["get", "inside"], g] as never);
    mm.setFilter("bld-out", ["all", ["==", ["get", "kind"], "building"], ["!", ["get", "inside"]], g] as never);
  }, [grade, ready, view]);

  const go = (b: LngLatBoundsLike) => map.current?.fitBounds(b, { padding: 30, duration: 1400 });

  return (
    <div className="map-plate">
      <div className="figure-head">
        <div className="controls">
          <span className="plate solid">{PLATE[view]}</span>
          {view !== "front" && (
            <div className="switch" role="group" aria-label="Zoom to">
              <button type="button" onClick={() => go(CORRIDOR)} disabled={!ready}>Corridor</button>
              {["Syabrubesi (AOI01)", "Timure (AOI02)", "Bidur (AOI03)"].map((a) => (
                <button key={a} type="button" onClick={() => AREAS[a] && go(AREAS[a])} disabled={!ready}>{AREA(a)}</button>
              ))}
            </div>
          )}
          {view === "exposure" && (
            <div className="switch" role="group" aria-label="Copernicus damage grade">
              {["Destroyed", "Damaged", "Possibly damaged", "All"].map((g) => (
                <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}>{g}</button>
              ))}
            </div>
          )}
        </div>
        <div className="controls">
          {view === "footprint" && (
            <div className="switch" role="group" aria-label="Copernicus overlay">
              <button type="button" aria-pressed={cems} onClick={() => setCems((v) => !v)}>Show Copernicus extent</button>
            </div>
          )}
          <div className="switch" role="group" aria-label="Base map">
            <button type="button" aria-pressed={!satellite} onClick={() => setSatellite(false)}>Relief</button>
            <button type="button" aria-pressed={satellite} onClick={() => setSatellite(true)}>Satellite 2024</button>
          </div>
        </div>
      </div>
      <div className="map" ref={box}>
        {!ready && <div className="map-empty">{failed ? "The map could not load (WebGL unavailable)" : "Loading map"}</div>}
      </div>
      <MapLegend view={view} t={t} />
    </div>
  );
}

function Swatch({ fill, hatch, ring, dash }: { fill?: string; hatch?: 1 | 2 | 3; ring?: boolean; dash?: boolean }) {
  if (ring) return <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill={fill ?? PAPER} stroke={fill ? PAPER : PEN_2} strokeWidth={fill ? 0.8 : 1.6} /></svg>; // filled = inside, hollow ring = outside, as drawn on the map
  if (dash !== undefined) return <svg width="26" height="12" aria-hidden="true"><line y1="6" y2="6" x2="26" stroke={fill} strokeWidth="2.5" strokeDasharray={dash ? "4 3" : undefined} /></svg>;
  return (
    <svg width="22" height="14" aria-hidden="true">
      <rect width="22" height="14" fill={hatch ? `url(#hatch-${hatch})` : fill} stroke={hatch === 2 ? PEN_2 : hatch ? PEN : INK} strokeWidth="1" />
    </svg>
  );
}

function MapLegend({ view, t }: { view: View; t: number }) {
  if (view === "front") {
    return (
      <div className="map-foot">
        <ul className="legend">
          <li><Swatch dash={false} fill={PEN} />Front at {clock(t)} (median)</li>
          <li><svg width="26" height="14" aria-hidden="true"><line x1="5" x2="21" y1="7" y2="7" stroke={PEN} strokeOpacity="0.3" strokeWidth="12" strokeLinecap="round" /></svg>5–95 % reach</li>
          <li><Swatch fill={FOOTPRINT_WASH} />Our footprint (this study)</li>
          <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill={PEN} /></svg>Place reached, with modelled arrival</li>
        </ul>
        <span className="src">River: MERIT Hydro main stem. Drag the pen on the trace above, or press Play.</span>
      </div>
    );
  }
  if (view === "footprint") {
    return (
      <div className="map-foot">
        <ul className="legend">
          <li><Swatch hatch={1} />Our footprint: optical only</li>
          <li><Swatch hatch={2} />radar only</li>
          <li><Swatch hatch={3} />both (higher confidence)</li>
          <li><Swatch dash={false} fill={INK} />Copernicus experts&rsquo; damage outline</li>
          <li><Swatch dash fill={INK} />Edge of the area Copernicus mapped</li>
        </ul>
      </div>
    );
  }
  return (
    <div className="map-foot">
      <ul className="legend">
        <li><Swatch fill={FOOTPRINT_WASH} />Our footprint (this study)</li>
        <li><Swatch ring fill={PEN_2} />Building Copernicus graded, inside our footprint</li>
        <li><Swatch ring />outside it</li>
        <li><Swatch dash={false} fill={PEN_2} />Road Copernicus graded destroyed, mostly inside</li>
        <li><Swatch dash fill={PEN_2} />mostly outside</li>
        <li><svg width="14" height="14" aria-hidden="true"><path d="M7 1L13 7L7 13L1 7Z" fill={INK} stroke={PAPER} strokeWidth="1.2" /></svg>Bridge Copernicus graded destroyed</li>
        <li><svg width="26" height="12" aria-hidden="true"><line y1="6" y2="6" x2="26" stroke={INK} strokeWidth="1.2" strokeDasharray="4 3" /></svg>Edge of the area Copernicus mapped</li>
      </ul>
    </div>
  );
}
