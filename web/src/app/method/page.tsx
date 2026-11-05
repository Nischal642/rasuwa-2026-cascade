import type { Metadata } from "next";
import Link from "next/link";
import { F1Change, ValidationTable } from "@/components/Charts";
import Rail from "@/components/Rail";
import { AREA, pct } from "@/lib/format";
import { clock } from "@/lib/front";
import JsonLd from "@/components/JsonLd";
import { Byline, Cite, SeeAlso } from "@/components/Paper";
import { OG_IMAGE, PUBLISHED, SITE, SRC, UPDATED, buildings, f1ByArea, firstGuess, firstRule, footprint, heldOutF1, infrastructure, leadtime, tuning, validation, type Params } from "@/lib/results";

const f1Range = Object.values(f1ByArea(validation));
const title = "Mapping and timing the 2026 Rasuwa flood: method, step by step";
const description = `Step by step: how the 2026 Rasuwa flood was mapped from Sentinel-1/2, checked against Copernicus EMSR927 (F1 ${Math.min(...f1Range).toFixed(2)}–${Math.max(...f1Range).toFixed(2)}) and its front timed to each town.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/method/" },
  openGraph: { type: "article", siteName: "Rasuwa flood 2026", url: "/method/", title, description, images: [OG_IMAGE] },
};

// Points at the home page's graph (#website, #paper) by @id.
const LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage", "@id": `${SITE}/method/#webpage`, url: `${SITE}/method/`, name: title, description, inLanguage: "en",
      datePublished: PUBLISHED, dateModified: UPDATED,
      isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": `${SITE}/#paper` }, breadcrumb: { "@id": `${SITE}/method/#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList", "@id": `${SITE}/method/#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Rasuwa flood 2026", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Method", item: `${SITE}/method/` },
      ],
    },
  ],
};

const SECTIONS = [
  { id: "flow", key: "", name: "The whole chain" },
  { id: "grid", key: "1", name: "One grid" },
  { id: "measure", key: "2", name: "Measure" },
  { id: "first", key: "3", name: "First guess" },
  { id: "sweep", key: "4", name: "Try them all" },
  { id: "choose", key: "5", name: "Choose fairly" },
  { id: "final", key: "6", name: "Final map" },
  { id: "check", key: "7", name: "Check" },
  { id: "count", key: "8", name: "Count" },
  { id: "timing", key: "9", name: "Timing" },
  { id: "cite", key: "", name: "Citation" },
];

/** The five tuned settings, in the order of the sweep, with plain and technical names. */
const SETTINGS: { key: keyof Params; plain: string; tech: string; unit?: string; fmt: (v: number | null) => string }[] = [
  { key: "ndvi_drop", plain: "How much green must disappear", tech: "ΔNDVI below", fmt: (v) => (v as number).toFixed(2).replace("-", "−") },
  { key: "cva_min", plain: "How strongly the colour must change", tech: "change-vector magnitude d above", fmt: (v) => (v === null ? "not used" : (v as number).toFixed(2)) },
  { key: "ndvi_after_max", plain: "How bare the ground must look afterwards", tech: "NDVI after below", fmt: (v) => (v as number).toFixed(2) },
  { key: "vh_db", plain: "How much the radar echo must change", tech: "|ΔVH| above", unit: " dB", fmt: (v) => String(v) },
  { key: "hand_max_m", plain: "How high above the river a change may be", tech: "height above nearest drainage below", unit: " m", fmt: (v) => String(v) },
];

/** The three pieces of overlap, in km²: both maps, only ours, only Copernicus (both = precision × ours). */
function pieces(s: { precision: number; ours_km2: number; copernicus_km2: number }) {
  const both = s.precision * s.ours_km2;
  return { both, ours: s.ours_km2, them: s.copernicus_km2, onlyOurs: s.ours_km2 - both, onlyThem: s.copernicus_km2 - both, union: s.ours_km2 + s.copernicus_km2 - both };
}

/** Each area's overlap as one bar of everything either map marked: only ours, both, only Copernicus. */
function AgreementBars() {
  return (
    <div className="agree chart">
      <div className="chart-body">
        <ul className="legend">
          <li><svg width="22" height="14" aria-hidden="true"><rect width="22" height="14" fill="var(--pen)" /></svg>Only ours (false alarm)</li>
          <li><svg width="22" height="14" aria-hidden="true"><rect width="22" height="14" fill="var(--ink)" /></svg>Both</li>
          <li><svg width="22" height="14" aria-hidden="true"><rect width="22" height="14" fill="var(--pen-2)" /></svg>Only Copernicus (miss)</li>
        </ul>
        {Object.entries(validation).map(([a, v]) => {
          const p = pieces(v.any);
          const w = (x: number) => (x / p.union) * 100;
          return (
            <div key={a} className="agree-row">
              <div className="agree-name">{AREA(a)}</div>
              <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="agree-bar" role="img"
                aria-label={`${AREA(a)}: only ours ${p.onlyOurs.toFixed(2)} km², both ${p.both.toFixed(2)} km², only Copernicus ${p.onlyThem.toFixed(2)} km².`}>
                <rect x={0} width={w(p.onlyOurs)} height={20} fill="var(--pen)"><title>{`Only ours: ${p.onlyOurs.toFixed(2)} km²`}</title></rect>
                <rect x={w(p.onlyOurs)} width={w(p.both)} height={20} fill="var(--ink)"><title>{`Both: ${p.both.toFixed(2)} km²`}</title></rect>
                <rect x={w(p.onlyOurs + p.both)} width={w(p.onlyThem)} height={20} fill="var(--pen-2)"><title>{`Only Copernicus: ${p.onlyThem.toFixed(2)} km²`}</title></rect>
                {[w(p.onlyOurs), w(p.onlyOurs + p.both)].map((x) => <line key={x} x1={x} x2={x} y1={0} y2={20} stroke="var(--paper)" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
              </svg>
              <p className="agree-text num">
                Only ours <b>{p.onlyOurs.toFixed(2)}</b> · both <b>{p.both.toFixed(2)}</b> · only Copernicus <b>{p.onlyThem.toFixed(2)}</b> km².
                {" "}Both is <b>{pct(v.any.iou)}</b> of the bar (IoU {v.any.iou.toFixed(2)}).
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One stop on the route: data others collected join from the left, our results leave to the right. */
function Stop({ href, step, title, line, inputs = [], outputs = [] }: {
  href: string; step: string; title: string; line: string; inputs?: string[]; outputs?: string[];
}) {
  return (
    <li className="stop">
      <div className="stop-in">{inputs.map((i) => <span key={i} className="plate given">{i}</span>)}</div>
      <div className="stop-spine" aria-hidden="true" />
      <div className="stop-step">
        <a href={href}><span className="stop-n">{step} </span>{title}</a>
        <p>{line}</p>
      </div>
      <div className="stop-out">{outputs.map((o) => <span key={o} className="plate result">{o}</span>)}</div>
    </li>
  );
}

export default function MethodPage() {
  const grid = tuning.tune_grid;
  const combos = Object.values(grid).reduce((n, v) => n * v.length, 1);
  const chosen = tuning.final.params;
  const total = Object.values(footprint.areas_km2).reduce((a, b) => a + b, 0);
  const firstTotal = Object.values(firstGuess.areas_km2).reduce((a, b) => a + b, 0);
  const f1 = (s: typeof validation) => Object.values(s).map((v) => v.any.f1);
  const [f1First, f1Final] = [f1(firstRule), f1(validation)];
  const range = (v: number[]) => `${Math.min(...v).toFixed(2)}–${Math.max(...v).toFixed(2)}`;
  const precisions = Object.values(validation).map((v) => v.any.precision);
  const heldOut = Object.values(heldOutF1);
  const syab = leadtime.places["Syabrubesi"];
  const auto = ["Upper Trishuli 3A", "Betrawati"].map((k) => Math.round(leadtime.places[k].warning_with_auto_alert_min));
  const at = (n: string) => leadtime.places[n].arrival_npt;
  const ut3a = leadtime.places["Upper Trishuli 3A"];
  const ex1 = leadtime.worked_example.k1_seconds;
  const timeline: [string, string, string | null][] = [
    ["08:37", "The mountainside collapses", "its seismic signal"],
    [at("Rasuwagadhi"), "The front reaches the border", "video at Gyirong Port"],
    [at("Syabrubesi"), "Syabrubesi", "its gauge, silent by 08:50"],
    [at("Upper Trishuli 3A"), "Upper Trishuli 3A", null],
    ["09:15", "The SMS warning goes out", "Flood Forecasting Division"],
    [at("Upper Trishuli-3B Powerhouse"), "Upper Trishuli 3B", null],
    [at("Betrawati"), "Betrawati", "its gauge, silent around 09:20"],
  ];
  const maxControl = pct(tuning.max_control_flagged);
  const recalls = Object.values(validation).map((v) => v.any.recall);
  const radar = Object.values(validation).map((v) => v.radar.recall);
  const [exArea, exScore] = Object.entries(validation)[0];
  const ex = { area: AREA(exArea), s: exScore.any, ...pieces(exScore.any) };

  return (
    <main>
      <JsonLd data={LD} />
      <section className="method-head" aria-labelledby="title">
        <h1 id="title">How it was done, step by step</h1>
        <p className="standfirst">
          Every result on the study page comes out of one chain of steps. This page walks through it in order: what we started
          from, what we did to it, and how each setting was chosen and checked.
        </p>
        <Byline />
        <ul className="legend method-key">
          <li><span className="plate given">Blue</span>{" "}data other people collected</li>
          <li><span className="plate">Graphite</span>{" "}a step we carried out</li>
          <li><span className="plate result">Red</span>{" "}a result of this study</li>
        </ul>
      </section>

      <div className="body">
        <aside className="rail-col"><Rail sections={SECTIONS} /></aside>
        <div className="main-col">
          {/* ---------------- The route ---------------- */}
          <section id="flow" className="station" aria-labelledby="h-flow">
            <div className="station-head"><h2 id="h-flow">The whole chain at a glance</h2></div>
            <ol className="route">
              <Stop href="#grid" step="1" title="Put everything on one 20 m grid"
                line="Before and after pictures from the same season, radar and terrain, square by square."
                inputs={["Sentinel-2 pictures", "Sentinel-1 radar", "MERIT Hydro terrain"]} />
              <Stop href="#measure" step="2" title="Measure five things in every square"
                line="Lost green, colour change, bareness, radar change, height above the river." />
              <Stop href="#first" step="3" title="Make a first guess at the rule"
                line="Settings picked by hand, without the colour-change test."
                outputs={[`${firstTotal.toFixed(1)} km², F1 ${range(f1First)}`]} />
              <Stop href="#sweep" step="4" title={`Try all ${combos.toLocaleString("en")} combinations of settings`}
                line="Score each one against the experts' map, and count its false alarms in an untouched valley."
                inputs={["Copernicus damage outline", "Langtang valley (untouched)"]} />
              <Stop href="#choose" step="5" title="Choose the settings fairly"
                line={`Drop any that flag more than ${maxControl} of the untouched valley, test on areas held out, keep the best.`}
                outputs={["The chosen settings"]} />
              <Stop href="#final" step="6" title="Make the final map"
                line="Run the chosen rule along the whole corridor, tile by tile."
                outputs={[`Footprint ${total.toFixed(1)} km²`]} />
              <Stop href="#check" step="7" title="Check it against Copernicus"
                line="Lay the final map over the experts' map, square by square, and score the match."
                inputs={["Copernicus damage outline"]}
                outputs={[`F1 ${range(f1Final)}`, `right ${pct(Math.min(...precisions))}–${pct(Math.max(...precisions))} of the time`]} />
              <Stop href="#count" step="8" title="Count what lay inside"
                line="Lay buildings, roads, bridges and power plants over the footprint."
                inputs={["Copernicus graded assets", "Open Buildings", "OpenStreetMap"]}
                outputs={[`${pct(buildings.cems_pooled["Destroyed"].share)} of destroyed buildings`, `${infrastructure.cems_pooled.bridges_in_footprint} of ${infrastructure.cems_pooled.destroyed_bridges} bridges`]} />
              <Stop href="#timing" step="9" title="Time the flood front"
                line="Fit a simple flood-travel rule through the few real times, 10,000 times over."
                inputs={["Video, gauges, SMS time", "MERIT river profile"]}
                outputs={[`Syabrubesi ${syab.arrival_npt}`, `${auto[0]}–${auto[1]} min with an automatic alert`]} />
            </ol>
          </section>

          {/* ---------------- 1. Grid ---------------- */}
          <section id="grid" className="station" aria-labelledby="h-grid">
            <div className="station-head"><span className="plate solid">1</span><h2 id="h-grid">Put everything on one grid</h2></div>
            <div className="two-up">
              <div className="prose">
                <p className="lede">
                  The valley is cut into squares 20 m by 20 m, and every square gets a value from each source: the picture
                  before, the picture after, the radar before and after, and the terrain. From here on, every decision is made
                  square by square.
                </p>
                <p>
                  Before and after are taken from the <strong>same season a year apart</strong>, late August to late October,
                  so that the change of season itself does not look like damage. Many pictures from each season are combined
                  into one, so that clouds in one picture are filled from another.
                </p>
              </div>
              <aside className="note">
                <p><strong>Grid.</strong> 20 m squares on UTM zone 45N, covering 85.08–85.62° E and 27.82–28.40° N, exported in 16 tiles.</p>
                <p><strong>Pictures.</strong> Sentinel-2 surface reflectance, medians of 27 Aug to 28 Oct in 2025 and in 2026, cloudy pixels removed with Cloud Score+.</p>
                <p><strong>Radar.</strong> Sentinel-1 VH, medians of 1 Jul to 25 Aug and 26 Aug to 14 Sep 2026, all from relative orbit 85 so the viewing angle matches.</p>
                <p><strong>Terrain.</strong> MERIT Hydro on its 90 m grid: upstream area and height above the nearest river.</p>
              </aside>
            </div>
          </section>

          {/* ---------------- 2. Measure ---------------- */}
          <section id="measure" className="station" aria-labelledby="h-measure">
            <div className="station-head"><span className="plate solid">2</span><h2 id="h-measure">Measure five things in every square</h2></div>
            <div className="prose">
              <p className="lede">Nothing is decided yet. Each square just gets five numbers, and the rule in the next steps sets a limit on each.</p>
            </div>
            <div className="table-wrap" tabIndex={0}>
              <table>
                <thead><tr><th>Measurement</th><th>The question it answers</th><th>Exactly</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Loss of green</th><td>Did plants disappear?</td><td className="src">ΔNDVI: NDVI after minus NDVI before (bands B8 and B4)</td></tr>
                  <tr><th scope="row">Colour change</th><td>How far did the ground&rsquo;s colour move, even where it was bare already?</td><td className="src">Change-vector magnitude <i>d</i> over bands B2, B3, B4, B8, B11, B12 (equation 1)</td></tr>
                  <tr><th scope="row">Bareness after</th><td>Is the ground bare, mud or water now?</td><td className="src">NDVI of the 2026 picture</td></tr>
                  <tr><th scope="row">Radar change</th><td>Did the radar echo jump up or down?</td><td className="src">|ΔVH| in dB, after a 50 m median against speckle</td></tr>
                  <tr><th scope="row">Height above the river</th><td>Could the flood have reached this square?</td><td className="src">Height above nearest drainage (HAND), MERIT Hydro</td></tr>
                </tbody>
                <tfoot><tr><td colSpan={3}>Two filters are fixed and not tuned: snow, ice and cloud (NDSI above 0.4 or blue above 0.25 in either picture) are left out, and only the corridor along the main river and the Lhende Khola counts.</td></tr></tfoot>
              </table>
            </div>
          </section>

          {/* ---------------- 3. First guess ---------------- */}
          <section id="first" className="station" aria-labelledby="h-first">
            <div className="station-head"><span className="plate solid">3</span><h2 id="h-first">Make a first guess at the rule</h2></div>
            <div className="two-up">
              <div className="prose">
                <p className="lede">
                  The first rule used settings picked by hand: a lot of green had to disappear, there was no colour-change test,
                  and only ground up to {firstGuess.params.hand_max_m} m above the river counted.
                </p>
                <p>
                  It found {firstTotal.toFixed(1)} km² and scored F1 {f1First.map((v) => v.toFixed(2)).join(", ")} at
                  Syabrubesi, Timure and Bidur. Timure was worst: much of its debris had buried riverbed and roads that were
                  bare already, and a rule that only looks for lost green cannot see that. Guessing better by hand would only
                  be another guess, so the settings were tested instead.
                </p>
              </div>
              <aside className="note">
                <p>
                  <strong>First rule.</strong> ΔNDVI below {firstGuess.params.ndvi_drop.toFixed(2).replace("-", "−")}, no change-vector test,
                  NDVI after below {firstGuess.params.ndvi_after_max}, |ΔVH| above {firstGuess.params.vh_db} dB, HAND below{" "}
                  {firstGuess.params.hand_max_m} m. Scores from <code>outputs/validation_v1.json</code>.
                </p>
              </aside>
            </div>
          </section>

          {/* ---------------- 4. Sweep ---------------- */}
          <section id="sweep" className="station" aria-labelledby="h-sweep">
            <div className="station-head"><span className="plate solid">4</span><h2 id="h-sweep">Try every combination of settings</h2></div>
            <div className="prose">
              <p className="lede">
                Each of the five limits was given a few sensible values to try. Every combination of them was run: {" "}
                {Object.values(grid).map((v) => v.length).join(" × ")} = <strong>{combos.toLocaleString("en")} versions of the rule</strong>.
              </p>
            </div>
            <div className="table-wrap" tabIndex={0}>
              <table className="dials">
                <thead><tr><th>Setting</th><th>Values tried</th><th className="r">Chosen</th></tr></thead>
                <tbody>
                  {SETTINGS.map((s) => (
                    <tr key={s.key}>
                      <th scope="row">{s.plain}<span className="tech">{" "}{s.tech}{s.unit ? ` (${s.unit.trim()})` : ""}</span></th>
                      <td>
                        <span className="chips">
                          {grid[s.key].map((v) => (
                            <span key={String(v)} className={`chip num${v === chosen[s.key] ? " on" : ""}${v === firstGuess.params[s.key] ? " first" : ""}`}>
                              {s.fmt(v)}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="num r" style={{ whiteSpace: "nowrap" }}><strong>{s.fmt(chosen[s.key])}{chosen[s.key] === null ? "" : s.unit ?? ""}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="legend">
              <li><span className="chip on">&nbsp;&nbsp;</span>chosen in step 5</li>
              <li><span className="chip first">&nbsp;&nbsp;</span>the first guess of step 3</li>
            </ul>

            <h3 className="sub">How each version was scored</h3>
            <div className="two-up">
              <div className="prose">
                <p>
                  In the three areas Copernicus mapped, every square has two yes-or-no answers: ours and the experts&rsquo;. A
                  square both mark is an <strong>agreement</strong>; one only we mark is a <strong>false alarm</strong>; one only
                  they mark is a <strong>miss</strong>.
                </p>
                <ul className="findings">
                  <li><span className="k">P</span>{" "}<span><strong>Precision:</strong> of the squares we marked, the share they marked too. Agreements ÷ (agreements + false alarms).</span></li>
                  <li><span className="k">R</span>{" "}<span><strong>Recall:</strong> of the squares they marked, the share we found. Agreements ÷ (agreements + misses).</span></li>
                  <li><span className="k">F1</span>{" "}<span><strong>F1:</strong> both in one number, high only when both are high. 2 × P × R ÷ (P + R).</span></li>
                </ul>
                <p>
                  Each version was also run on the <strong>Langtang Khola valley</strong>, next door and untouched in 2026. Every
                  square it marks there is a false alarm, so the share it marks is a direct measure of how easily the rule
                  cries wolf.
                </p>
              </div>
              <figure className="figure" style={{ margin: 0 }}>
                <svg viewBox="0 0 320 250" className="score-fig" role="img" aria-label="Two overlapping areas: ours and Copernicus. The overlap is agreement, ours alone is false alarm, theirs alone is miss.">
                  <rect x="20" y="40" width="170" height="150" fill="url(#hatch-1)" stroke="var(--pen)" strokeWidth="1.5" />
                  <rect x="110" y="60" width="180" height="150" fill="var(--pen-2-wash)" fillOpacity="0.6" stroke="var(--pen-2)" strokeWidth="1.5" />
                  <text x="22" y="30" className="lbl">OUR FOOTPRINT</text>
                  <text x="290" y="232" textAnchor="end" className="lbl" fill="var(--pen-2)">COPERNICUS</text>
                  <text x="65" y="120" textAnchor="middle" className="val">false</text><text x="65" y="138" textAnchor="middle" className="val">alarm</text>
                  <text x="150" y="128" textAnchor="middle" className="lbl">AGREE</text>
                  <text x="240" y="128" textAnchor="middle" className="val">miss</text>
                </svg>
                <figcaption className="caption">
                  Scores were computed on the same 20 m grid, inside each area&rsquo;s analysed region, against the
                  <a href={SRC.emsr927}>Copernicus EMSR927</a> observed-event polygons. While sweeping, the speck filter was skipped to save time; the
                  final check in step 6 uses the exact map.
                </figcaption>
              </figure>
            </div>
          </section>

          {/* ---------------- 5. Choose ---------------- */}
          <section id="choose" className="station" aria-labelledby="h-choose">
            <div className="station-head"><span className="plate solid">5</span><h2 id="h-choose">Choose the settings fairly</h2></div>
            <div className="prose">
              <p className="lede">
                The settings were not picked by eye. Three fixed rules chose them, and the computer applied them to all{" "}
                {combos.toLocaleString("en")} versions.
              </p>
            </div>
            <ol className="findings two-by-two">
              <li><span className="k">a</span>{" "}<span><strong>No crying wolf.</strong> Any version that marked more than {maxControl} of the untouched Langtang valley floor was thrown out.
                <span className="tech">{" "}The best version without this rule (ΔNDVI below {tuning.unconstrained_best.params.ndvi_drop.toFixed(2).replace("-", "−")}, <i>d</i> above {tuning.unconstrained_best.params.cva_min}) scored well against Copernicus but marked {(tuning.unconstrained_best.control_flagged * 100).toFixed(1)}&nbsp;% of the untouched valley, so it was rejected.</span></span></li>
              <li><span className="k">b</span>{" "}<span><strong>Test on an area it never saw.</strong> Settings were chosen on two areas and scored on the third, three times over, so each area was once the unseen test.
                <span className="tech">{" "}Leave-one-area-out cross-validation. If the method only memorised the answers, the score on the unseen area would drop. It did not.</span></span></li>
              <li><span className="k">c</span>{" "}<span><strong>Keep the best of what is left.</strong> Among the survivors, the version with the highest average F1 over all three areas became the final rule.
                <span className="tech">{" "}Final: ΔNDVI below {chosen.ndvi_drop.toFixed(2).replace("-", "−")}, <i>d</i> above {chosen.cva_min}, NDVI after below {chosen.ndvi_after_max}, |ΔVH| above {chosen.vh_db} dB, HAND below {chosen.hand_max_m} m; it marks {(tuning.final.control_flagged * 100).toFixed(1)}&nbsp;% of the control valley.</span></span></li>
              <li><span className="k">d</span>{" "}<span><strong>Check that it holds.</strong> The three tests chose nearly the same settings, and the unseen-area scores ({heldOut.map((v) => v.toFixed(2)).join(", ")}) match the normal ones. The rule works on ground it was not tuned on.
                <span className="tech">{" "}Two of the three folds chose exactly the final settings; the Bidur fold differed only in ΔNDVI and NDVI after.</span></span></li>
            </ol>
            <div className="table-wrap" tabIndex={0}>
              <table>
                <caption>The three tests (leave one area out)</caption>
                <thead><tr><th>Area held out</th><th>Settings chosen on the other two</th><th className="r">F1 on the other two</th><th className="r">F1 on the unseen area</th><th className="r hide-sm">Control valley marked</th></tr></thead>
                <tbody>
                  {Object.entries(tuning.leave_one_area_out).map(([a, v]) => {
                    const same = SETTINGS.every((s) => v.params[s.key] === chosen[s.key]);
                    return (
                      <tr key={a}>
                        <th scope="row">{AREA(a)}</th>
                        <td className="src">{same ? "the final settings" : SETTINGS.filter((s) => v.params[s.key] !== chosen[s.key]).map((s) => `${s.tech} ${s.fmt(v.params[s.key])}${s.unit ?? ""}`).join("; ") + "; the rest as final"}</td>
                        <td className="num r">{v.train_f1.toFixed(2)}</td>
                        <td className="num r"><strong>{v.test_scores.f1.toFixed(2)}</strong></td>
                        <td className="num r hide-sm">{(v.control_flagged * 100).toFixed(1)}&nbsp;%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------- 6. Final map ---------------- */}
          <section id="final" className="station" aria-labelledby="h-final">
            <div className="station-head"><span className="plate solid">6</span><h2 id="h-final">Make the final map</h2></div>
            <div className="two-up">
              <div className="prose">
                <p className="lede">
                  The chosen rule was run along the whole corridor, tile by tile, and specks smaller than 0.8 ha were removed.
                  The result is the footprint: <strong>{total.toFixed(1)} km²</strong>.
                </p>
                <p>
                  The tuning in steps 4 and 5 used a quick version of the map. This is the exact one, and it is the map every
                  later step uses: it is checked against Copernicus in <a href="#check">step 7</a> and laid over buildings and
                  roads in <a href="#count">step 8</a>.
                </p>
              </div>
              <aside className="note">
                <p><strong>Export.</strong> <code>python -m rasuwa export</code> writes 16 GeoTIFF tiles of 20 m class values (0 none, 1 optical only, 2 radar only, 3 both).</p>
                <p><strong>Check.</strong> <code>python -m rasuwa validate</code> scores the exported map, with the speck filter, against the EMSR927 observed-event polygons.</p>
              </aside>
            </div>
            <SeeAlso href="/#footprint" label="Result A">where the ground changed, on the study page.</SeeAlso>
          </section>

          {/* ---------------- 7. Check ---------------- */}
          <section id="check" className="station" aria-labelledby="h-check">
            <div className="station-head"><span className="plate solid">7</span><h2 id="h-check">Check it against Copernicus</h2></div>
            <div className="prose">
              <p className="lede">
                In three areas, experts at the Copernicus Emergency Management Service drew the damage by hand from very sharp
                images. We laid our final map over theirs and compared the two, square by square. Their map is the answer key;
                ours is the exam.
              </p>
            </div>

            <h3 className="sub">Three pieces</h3>
            <div className="two-up">
              <div className="prose">
                <p>
                  Put the two maps on top of each other and the ground falls into three pieces: ground <strong>both</strong> maps
                  call damaged, ground <strong>only ours</strong> does (a false alarm), and ground <strong>only Copernicus</strong>{" "}
                  does (a miss). Every score below is just a different way of dividing these pieces.
                </p>
              </div>
              <aside className="note">
                <p>
                  <strong>Exactly.</strong> Copernicus EMSR927 observed-event polygons for Syabrubesi (AOI01), Timure (AOI02) and
                  Bidur (AOI03), painted onto the same 20 m grid and compared inside each area&rsquo;s analysed region, leaving
                  out the parts Copernicus marked as not analysed.
                </p>
              </aside>
            </div>
            <AgreementBars />

            <h3 className="sub">Four scores, one picture</h3>
            <ol className="findings two-by-two">
              <li><span className="k">P</span>{" "}<span><strong>Precision: right when we say damaged.</strong> Both ÷ ours. At {ex.area}: {ex.both.toFixed(2)} ÷ {ex.ours.toFixed(2)} = <strong>{ex.s.precision.toFixed(2)}</strong>.
                <span className="tech">{" "}Of the ground we marked, the share the experts marked too. Low precision would mean false alarms.</span></span></li>
              <li><span className="k">R</span>{" "}<span><strong>Recall: how much of their damage we found.</strong> Both ÷ Copernicus. At {ex.area}: {ex.both.toFixed(2)} ÷ {ex.them.toFixed(2)} = <strong>{ex.s.recall.toFixed(2)}</strong>.
                <span className="tech">{" "}Of the ground the experts marked, the share we found. Low recall means misses.</span></span></li>
              <li><span className="k">F1</span>{" "}<span><strong>F1: the overall match.</strong> Both ÷ the average size of the two maps. At {ex.area}: {ex.both.toFixed(2)} ÷ {((ex.ours + ex.them) / 2).toFixed(2)} = <strong>{ex.s.f1.toFixed(2)}</strong>.
                <span className="tech">{" "}2 × P × R ÷ (P + R). High only when precision and recall are both high, so marking the whole valley, which finds everything, would not fool it.</span></span></li>
              <li><span className="k">IoU</span>{" "}<span><strong>IoU: the strict overlap.</strong> Both ÷ everything either map marked. At {ex.area}: {ex.both.toFixed(2)} ÷ {ex.union.toFixed(2)} = <strong>{ex.s.iou.toFixed(2)}</strong>.
                <span className="tech">{" "}Intersection over union. Every false alarm and every miss counts against it in full, so it is always lower than F1 (IoU = F1 ÷ (2 − F1)).</span></span></li>
            </ol>
            <figure className="figure">
              <ValidationTable scores={validation} />
              <figcaption className="caption">
                <b>The results</b> All three areas, on all four scores. The buttons score parts of our map separately: switch to
                Radar and its precision stays near 0.99, but it finds only {pct(radar[0])} and {pct(radar[1])} of the damage in
                the Syabrubesi and Timure gorges, where steep walls block its sideways view, and {pct(radar[2])} at Bidur, where
                the valley opens. The pictures carry the map; radar adds a small, reliable extra.
              </figcaption>
            </figure>

            <h3 className="sub">Did it hold up on ground it had never seen?</h3>
            <div className="two-up">
              <figure className="figure" style={{ marginTop: 0 }}>
                <F1Change first={f1ByArea(firstRule)} final={f1ByArea(validation)} heldOut={heldOutF1} />
                <figcaption className="caption"><b>F1, by area</b> The axis starts at 0.5, so the gaps look larger than on a full scale.</figcaption>
              </figure>
              <ol className="findings">
                <li><span className="k"><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" /></svg></span><span><strong>White circle:</strong> the first guess of step 3. F1 {f1First.map((v) => v.toFixed(2)).join(", ")}.</span></li>
                <li><span className="k"><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="var(--pen)" /></svg></span><span><strong>Red dot:</strong> the final rule. Every area improved; Timure most, because its debris covered riverbed and roads that were bare already, which only the colour-change test can see.</span></li>
                <li><span className="k"><svg width="16" height="16" aria-hidden="true"><line x1="8" x2="8" y1="1" y2="15" stroke="var(--pen-2)" strokeWidth="3" /></svg></span><span><strong>Blue line:</strong> the score that area got when its answer key was hidden while the settings were chosen (step 5). It is the surprise-exam score.
                  <span className="tech">{" "}Held-out F1 {heldOut.map((v) => v.toFixed(2)).join(", ")}. Each sits on its red dot: the rule works on ground it was not tuned on, which is why it can be trusted along the rest of the 80 km corridor, where no answer key exists.</span></span></li>
              </ol>
            </div>

            <h3 className="sub">What the check says</h3>
            <ol className="findings two-by-two">
              <li><span className="k">1</span>{" "}<span><strong>Careful.</strong> When our map says damaged, the experts agree {pct(Math.min(...precisions))} to {pct(Math.max(...precisions))} of the time. False alarms are rare, and the untouched control valley stays {(tuning.final.control_flagged * 100).toFixed(1)}&nbsp;% marked.</span></li>
              <li><span className="k">2</span>{" "}<span><strong>A little small.</strong> It finds {pct(Math.min(...recalls))} to {pct(Math.max(...recalls))} of what the experts drew. The misses lie mostly at the edges, most likely strips thinner than our 20 m squares, ground that changed only faintly, and gorges radar cannot see into.</span></li>
              <li><span className="k">3</span>{" "}<span><strong>Not tuned to the answers.</strong> Areas hidden while choosing the settings score as well as the rest, so the result is not an artefact of fitting.</span></li>
              <li><span className="k">4</span>{" "}<span><strong>Checked only where Copernicus looked.</strong> Three areas and one control valley. Copernicus is a human drawing too, so a few &ldquo;misses&rdquo; or &ldquo;extras&rdquo; may be theirs rather than ours.</span></li>
            </ol>
            <div className="prose">
              <p className="lede" style={{ marginTop: "2rem" }}>
                In short: from free satellite data alone, within nine weeks of the event, we drew a map of the damage that is
                rarely wrong and finds roughly three-quarters to four-fifths of what experts traced by hand, along the whole
                corridor rather than three small areas.
              </p>
            </div>
            <SeeAlso href="/#validation" label="Result A">the scores against Copernicus, on the study page.</SeeAlso>
          </section>

          {/* ---------------- 7. Count ---------------- */}
          <section id="count" className="station" aria-labelledby="h-count">
            <div className="station-head"><span className="plate solid">8</span><h2 id="h-count">Count what lay inside</h2></div>
            <div className="prose">
              <p className="lede">With the footprint fixed, the lists of buildings, roads, bridges and power plants are laid over it and counted. Nothing is tuned here.</p>
            </div>
            <ol className="findings two-by-two">
              <li><span className="k">B</span>{" "}<span><strong>Buildings</strong> count as inside when the 20 m square under them is marked.
                <span className="tech">{" "}Copernicus graded building points (3,922) and Google Open Buildings centroids with confidence 0.75 or more.</span></span></li>
              <li><span className="k">R</span>{" "}<span><strong>Roads</strong> are measured by the length that runs through marked squares.
                <span className="tech">{" "}Each line is sampled every 5 m; Copernicus roads graded destroyed and OpenStreetMap roads by type.</span></span></li>
              <li><span className="k">Br</span>{" "}<span><strong>Bridges</strong> count when they are within 40 m of the footprint, since they cross the river at its edge.
                <span className="tech">{" "}Copernicus bridges graded destroyed; OpenStreetMap road and foot bridges.</span></span></li>
              <li><span className="k">H</span>{" "}<span><strong>Hydropower sites</strong> count when they are within 100 m of the footprint.
                <span className="tech">{" "}OpenStreetMap power plants, generators, dams and weirs.</span></span></li>
            </ol>
            <SeeAlso href="/#exposure" label="Result B">what lay in the flood&rsquo;s path, on the study page.</SeeAlso>
          </section>

          {/* ---------------- 8. Timing ---------------- */}
          <section id="timing" className="station" aria-labelledby="h-timing">
            <div className="station-head"><span className="plate solid">9</span><h2 id="h-timing">Time the flood front</h2></div>
            <div className="prose">
              <p className="lede">
                The flood hit a string of places along the river, but for most of them nobody recorded when it arrived. To say
                how much warning each place could have had, we need those times.
              </p>
            </div>

            <h3 className="sub">What we do know</h3>
            <div className="two-up">
              <div className="prose">
                <p>
                  The debris was filmed reaching the border 7 minutes after the collapse. Further down, two towns had river gauges
                  that kept sending readings until the flood knocked them out: Syabrubesi&rsquo;s went silent by 08:50 and
                  Betrawati&rsquo;s around 09:20. So the flood took about half an hour to get from one town to the other.
                </p>
              </div>
              <aside className="note">
                <p>
                  <strong>Exactly.</strong> The collapse is timed at 08:37 NPT by its seismic signal (<a href={SRC.usgs}>USGS
                  us7000tbwb</a>). The border time is from video at Gyirong Port (<a href={SRC.xinhua}>Xinhua</a>); the gauge times
                  are Flood Forecasting Division records as reported by <a href={SRC.kpTimeline}>The Kathmandu Post</a>. The front
                  reaches Syabrubesi 13 minutes after the collapse at the latest, and Betrawati is given a ±5 minute window, 38 to
                  48 minutes.
                </p>
              </aside>
            </div>

            <h3 className="sub">Filling in the places in between</h3>
            <div className="two-up">
              <div className="prose">
                <p>
                  Think of a bus seen leaving one stop at 08:49 and arriving at a later stop at 09:20: you can work out roughly
                  when it passed each stop in between. We do the same for the flood, with one twist: <strong>water runs faster
                  where the river is steeper.</strong> Elevation data tell us how steep every stretch is, so instead of spreading
                  the half hour evenly, the front goes faster on the steep parts and slower on the flat ones.
                </p>
                <p>That gives times for places no gauge recorded, such as the hydropower plants.</p>
              </div>
              <aside className="note">
                <p>
                  <strong>Exactly.</strong> The river is the MERIT Hydro main stem (upstream area above 2,500 km²), ordered
                  downstream, with bed slope <i>S</i> smoothed over ±500 m. Down to Syabrubesi the front is a debris flow at a
                  steady speed of at most 52 m/s; below it, a kinematic flood wave with speed <i>c</i> = <i>k</i>√<i>S</i>. The
                  one unknown, <i>k</i>, is fitted so the front passes Syabrubesi and Betrawati at the observed times.
                </p>
              </aside>
            </div>
            <div className="table-wrap" tabIndex={0}>
              <table>
                <caption>The morning of 26 August</caption>
                <thead><tr><th>NPT</th><th>What happened</th><th>How we know</th></tr></thead>
                <tbody>
                  {timeline.map(([t, what, how]) => (
                    <tr key={what}>
                      <td className="num">{t}</td>
                      <td>{what}</td>
                      <td>{how ? <><span className="plate given">known</span> {how}</> : <span className="plate result">worked out</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="sub">What &ldquo;10,000 times&rdquo; means</h3>
            <div className="two-up">
              <div className="prose">
                <p>
                  The gauge times are not exact. A gauge going silent at 09:20 does not prove the flood arrived at exactly 09:20;
                  it might have been 09:15 or 09:25. So instead of trusting one guess, the computer tries many:
                </p>
                <ol className="findings">
                  <li><span className="k">1</span>{" "}<span>Say Betrawati was hit at 09:22. Work out every other time.</span></li>
                  <li><span className="k">2</span>{" "}<span>Say it was 09:17. Work them all out again.</span></li>
                  <li><span className="k">3</span>{" "}<span>Say 09:24, and so on.</span></li>
                </ol>
                <p>
                  It does this 10,000 times, so each place ends up with 10,000 possible arrival times. We report the typical one,
                  the middle value, and the range most tries fall in. Upper Trishuli 3A, for example: most likely{" "}
                  {ut3a.arrival_npt}, and in nine tries out of ten between {clock(ut3a.arrival_5_95_min[0])} and{" "}
                  {clock(ut3a.arrival_5_95_min[1])}.
                </p>
              </div>
              <aside className="note">
                <p>
                  <strong>Exactly.</strong> A Monte Carlo of 10,000 draws, each taking the Syabrubesi and Betrawati times uniformly
                  from their windows. Arrivals are reported as the median and the 5–95 % range. The random seed is fixed, so every
                  run gives the same numbers; 10,000 is simply enough draws that the answers stop changing.
                </p>
              </aside>
            </div>

            <h3 className="sub">How <i>k</i> is found</h3>
            <div className="two-up">
              <div className="prose">
                <p>
                  Speed is <i>k</i> × √steepness, and <i>k</i> is the one number nobody measured. Run the river once with{" "}
                  <i>k</i> = 1 and the trip from Syabrubesi to Betrawati would take {ex1.betrawati.toLocaleString("en")} seconds,
                  about {Math.round(ex1.betrawati / 3600)} hours. Doubling <i>k</i> halves the time, so each try divides that by
                  the trip it picked. With <i>k</i> known, Upper Trishuli 3A comes {ex1.upper_trishuli_3a.toLocaleString("en")} ÷{" "}
                  <i>k</i> seconds after Syabrubesi.
                </p>
              </div>
              <aside className="note">
                <p>
                  <strong>Exactly.</strong> The <i>k</i> = 1 time adds up 20 m ÷ √<i>S</i> over every 20 m step between the two
                  towns. The tries below are the model&rsquo;s first five of 10,000; times are minutes after the collapse.
                </p>
              </aside>
            </div>
            <div className="table-wrap" tabIndex={0}>
              <table>
                <caption><i>k</i> = {ex1.betrawati.toLocaleString("en")} ÷ trip in seconds</caption>
                <thead><tr><th>Try</th><th className="r">Syabrubesi</th><th className="r">Betrawati</th><th className="r">Trip</th><th className="r"><i>k</i></th><th className="r">Upper Trishuli 3A</th></tr></thead>
                <tbody>
                  {leadtime.worked_example.draws.map((d, i) => {
                    const [a, b] = [d.syabrubesi_min.toFixed(1), d.betrawati_min.toFixed(1)];
                    return (
                      <tr key={i}>
                        <td className="num">{i + 1}</td>
                        <td className="num r">{a}</td>
                        <td className="num r">{b}</td>
                        <td className="num r" style={{ whiteSpace: "nowrap" }}>{(+b - +a).toFixed(1)} min</td>
                        <td className="num r"><strong>{Math.round(d.k)}</strong></td>
                        <td className="num r">{clock(d.upper_trishuli_3a_min)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="prose">
              <p>
                Five tries are not enough to pin it down. Over all 10,000, <i>k</i> is typically {Math.round(leadtime.flood_speed_k[1])}, and in
                nine tries out of ten between {Math.round(leadtime.flood_speed_k[0])} and {Math.round(leadtime.flood_speed_k[2])}.
              </p>
            </div>

            <h3 className="sub">Why it matters</h3>
            <div className="prose">
              <p className="lede">
                At the hydropower plants and Betrawati, the SMS went out almost exactly as the water arrived, so in practice there
                was no warning. Yet the collapse came at 08:37: an automatic alarm set off by it could have given those places{" "}
                {auto[0]} to {auto[1]} minutes to get out.
              </p>
              <p>
                Upstream it was already too late: the front passed Syabrubesi at {syab.arrival_npt},{" "}
                {Math.round(-syab.after_sms_min)} minutes before the SMS. Warning time is arrival minus the 09:15 SMS, or minus an
                automatic alert two minutes after the collapse. Every place is in the <Link href="/#leadtime">lead-time results</Link>.
              </p>
            </div>
            <pre tabIndex={0} role="region" aria-label="Commands that reproduce each step">{`python -m rasuwa export      # 1, 6  the footprint, tile by tile
python -m rasuwa tune        # 4, 5  the ${combos.toLocaleString("en")}-version sweep and the fair choice
python -m rasuwa validate    # 7     the check against Copernicus
python -m rasuwa buildings   # 8
python -m rasuwa infrastructure
python -m rasuwa leadtime    # 9`}</pre>
            <SeeAlso href="/#leadtime" label="Result C">how much warning there was, on the study page.</SeeAlso>
          </section>

          <section id="cite" className="station" aria-labelledby="h-cite">
            <div className="station-head"><h2 id="h-cite">Citation</h2></div>
            <Cite />
          </section>
        </div>
      </div>
    </main>
  );
}
