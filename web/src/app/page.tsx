import Link from "next/link";
import BeforeAfter from "@/components/BeforeAfter";
import { BuildingsChart, F1Change, FootprintStack, UndercountChart, ValidationTable, WarningTable } from "@/components/Charts";
import CorridorMap from "@/components/CorridorMap";
import Rail from "@/components/Rail";

const SECTIONS = [
  { id: "event", key: "", name: "The event" },
  { id: "method", key: "", name: "Data and method" },
  { id: "footprint", key: "A", name: "Footprint" },
  { id: "validation", key: "A", name: "Validation" },
  { id: "exposure", key: "B", name: "Exposure" },
  { id: "leadtime", key: "C", name: "Lead time" },
  { id: "meaning", key: "", name: "What it means" },
  { id: "code", key: "", name: "Code and citation" },
];
import Trace, { TraceLegend } from "@/components/Trace";
import { pct } from "@/lib/format";
import { REPO, buildings, firstRule, footprint, infrastructure, leadtime, tuning, validation } from "@/lib/results";

const n = (v: number) => v.toLocaleString("en");

export default function Page() {
  const areas = footprint.areas_km2;
  const total = Object.values(areas).reduce((a, b) => a + b, 0);
  const lt = leadtime.places;
  const syab = lt["Syabrubesi"];
  const destroyed = buildings.cems_pooled["Destroyed"];
  const roads = infrastructure.cems_pooled;
  const ob = buildings.open_buildings;
  const depth = leadtime.implied_flood_depth_m["5_50_95"];
  const f1 = (s: typeof validation) => Object.fromEntries(Object.entries(s).map(([a, v]) => [a, v.any.f1]));
  const heldOut = Object.fromEntries(Object.entries(tuning.leave_one_area_out).map(([a, v]) => [a, v.test_scores.f1]));
  const f1s = Object.values(f1(validation));
  const precisions = Object.values(validation).map((v) => v.any.precision);
  const recalls = Object.values(validation).map((v) => v.any.recall);
  const radarRecall = Object.fromEntries(Object.entries(validation).map(([a, v]) => [a.split(" ")[0], v.radar.recall]));
  const osmRoadKm = Object.values(infrastructure.osm.road_km_in_footprint).reduce((s, r) => s + r.main + r.local + r.track, 0);
  const osmBridges = Object.values(infrastructure.osm.bridges_in_footprint).reduce((s, b) => ({ road: s.road + b.road, foot: s.foot + b.foot }), { road: 0, foot: 0 });
  const arrivals = Object.fromEntries(Object.entries(lt).map(([k, v]) => [k, v.arrival_npt]));
  const smsLead = Math.round(-syab.after_sms_min);
  const cemsDestroyedIn = Object.fromEntries(Object.entries(buildings.cems).map(([a, v]) => [a, v["Destroyed"].in_footprint]));
  const autoMid = ["Upper Trishuli 3A", "Upper Trishuli-3B Powerhouse", "Betrawati"].map((k) => Math.round(lt[k].warning_with_auto_alert_min));

  return (
    <>

      <section className="hero" aria-labelledby="title">
        <div className="hero-head">
          <h1 id="title">The flood outran the warning.</h1>
          <p className="standfirst">
            On 26 August 2026 a rock-ice avalanche on the Langtang Lirung massif became a debris flow and flood that ran
            some 80 km down the Lhende Khola, Bhote Koshi and Trishuli rivers. From open satellite data only, this study maps
            where it changed the ground, what lay in its path, and when its front reached each place.
          </p>
        </div>
        <figure className="trace-plate hero-trace" style={{ margin: 0 }}>
          <div className="trace-head">
            <span className="plate solid">Trace · flood front</span>
            <p>km below Rasuwagadhi against minutes after the 08:37 collapse</p>
          </div>
          <Trace />
          <div style={{ padding: "0 0.75rem 0.75rem" }}><TraceLegend /></div>
        </figure>
        <div className="hero-rest">
          <div className="margin-figure">
            <div className="numeral num" aria-hidden="true">{smsLead}</div>
            <p>
              <strong>minutes</strong> after the front passed Syabrubesi at {syab.arrival_npt}, the national SMS alert went out at 09:15.
              <span className="sr-only"> The front passed Syabrubesi {smsLead} minutes before the SMS alert.</span>
            </p>
          </div>
          <ol className="stations" aria-label="The three findings">
            <li><a href="#footprint"><span className="st-key">A</span><span className="st-name">Footprint</span><span className="st-lead" /><span className="st-val num">{total.toFixed(1)} km² of changed ground</span></a></li>
            <li><a href="#exposure"><span className="st-key">B</span><span className="st-name">Exposure</span><span className="st-lead" /><span className="st-val num">{pct(destroyed.share)} of destroyed buildings inside</span></a></li>
            <li><a href="#leadtime"><span className="st-key">C</span><span className="st-name">Lead time</span><span className="st-lead" /><span className="st-val num">{autoMid[0]}–{autoMid[2]} min an automatic alert could give</span></a></li>
          </ol>
          <p className="byline" style={{ marginTop: "1.25rem" }}>
            Companion to <i>Downstream impacts and warning lead time of the 26 August 2026 Bhote Koshi–Trishuli cascade, Nepal,
            from open multi-sensor data</i>, by Nischal Acharya (in preparation).
          </p>
        </div>
      </section>

      <div className="body">
        <aside className="rail-col"><Rail sections={SECTIONS} /></aside>
        <main>
          {/* ---------------- The event ---------------- */}
          <section id="event" className="station" aria-labelledby="h-event">
            <div className="station-head"><h2 id="h-event">Eighty kilometres in about an hour</h2></div>
            <div className="prose">
              <p className="lede">
                The collapse began at 5,200 to 5,400 m on the north side of the Langtang Lirung massif at 08:37 Nepal time
                (02:52 UTC). The US Geological Survey recorded its seismic signal as event us7000tbwb; ICIMOD put its volume at
                100 to 200 million m³.
              </p>
              <p>
                The debris came down the Lhende Khola and reached Gyirong Port, on the border at Rasuwagadhi, about seven minutes
                later. It followed the Bhote Koshi past Timure to Syabrubesi, where the river becomes the Trishuli, and on past
                Betrawati to Bidur (Trishuli Bazar) in Nuwakot. It is Nepal&rsquo;s deadliest natural disaster since the 2015
                Gorkha earthquake.
              </p>
              <p>
                Drag the pen on the trace at the top of the page, or press Play: the map follows the modelled front down the
                river, minute by minute, and marks each place as it is reached.
              </p>
            </div>

            <figure className="figure">
              <CorridorMap view="front" arrivals={arrivals} />
              <figcaption className="caption"><b>The corridor</b>The flood front as modelled in section C, over the impact footprint of section A. Modelled arrival times are medians; below Betrawati they are extrapolated past the last observation.</figcaption>
            </figure>

            <div className="table-wrap" style={{ maxWidth: "38rem" }}>
              <table>
                <caption>Reported impact in Nepal, as of early October 2026 (Table I)</caption>
                <thead><tr><th>Impact</th><th className="r">Value</th><th>Source</th></tr></thead>
                <tbody>
                  {[
                    ["Dead", "1,455 or more", "USGS"], ["Missing", "5,285", "USGS"], ["Houses damaged", "7,570", "Government rapid assessment"],
                    ["Hydropower projects damaged", "13 (759 MW)", "Government rapid assessment"], ["Bridges damaged", "109", "USGS"],
                    ["Road damaged", "69 km", "USGS"], ["Farmland damaged", "1,806 ha", "Government rapid assessment"],
                    ["Recovery needs", "NPR 723 billion", "Government rapid assessment"],
                  ].map(([k, v, s]) => <tr key={k}><th scope="row">{k}</th><td className="num r">{v}</td><td className="src">{s}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p className="src" style={{ maxWidth: "var(--measure)" }}>
              Figures as reported in the paper: USGS event page us7000tbwb, and the government rapid assessment reported by The
              Kathmandu Post, 10 September 2026. They are not results of this study.
            </p>

            <h3 className="sub">Before and after</h3>
            <div className="prose"><p>Very-high-resolution imagery from before the event and from the days after it, and PlanetScope from the morning itself.</p></div>
            <BeforeAfter />
          </section>

          {/* ---------------- Data and method ---------------- */}
          <section id="method" className="station" aria-labelledby="h-method">
            <div className="station-head"><h2 id="h-method">Open data, three questions</h2></div>
            <div className="prose">
              <p className="lede">
                Rapid-mapping services such as Copernicus EMS map damage in selected areas within days, but not the whole
                corridor. Open satellite archives, open building and road data and public timing records now make a
                corridor-wide, validated reconstruction possible without commercial data.
              </p>
            </div>
            <ol className="findings">
              <li><span className="k">A</span><span>What area did the event affect along the corridor, and how closely does an open-data footprint reproduce official damage mapping?</span></li>
              <li><span className="k">B</span><span>Which buildings, roads, bridges and hydropower sites lay inside the footprint, and how complete are the open datasets that list them?</span></li>
              <li><span className="k">C</span><span>When did the flood front reach each settlement, and how much warning was, or could have been, given?</span></li>
            </ol>
            <div className="table-wrap">
              <table>
                <caption>Data used (Table II) · all open, processed in Google Earth Engine and Python</caption>
                <thead><tr><th>Dataset</th><th>Used for</th><th>Detail</th></tr></thead>
                <tbody>
                  {[
                    ["Sentinel-2 surface reflectance, Cloud Score+", "Optical change", "Medians of 27 Aug to 28 Oct, 2025 and 2026; bands B2, B3, B4, B8, B11, B12"],
                    ["Sentinel-1 GRD, VH, IW", "Radar change", "Relative orbit 85; 1 Jul to 25 Aug and 26 Aug to 14 Sep 2026"],
                    ["Vantor Open Data", "Before and after views", "0.35 to 0.65 m; WorldView-2, -3, Legion"],
                    ["Planet Disaster Data", "View hours after the collapse", "PlanetScope 3.8 m; 26 Aug 2026, 05:01 and 05:45 UTC"],
                    ["MERIT Hydro", "Corridor, valley floor, river profile", "90 m upstream area, height above nearest drainage, elevation"],
                    ["Copernicus EMS EMSR927", "Validation reference", "Syabrubesi, Timure and Bidur grading maps; 3,922 graded buildings"],
                    ["Google Open Buildings v3", "Building exposure", "Pre-event footprints; confidence 0.75 or more"],
                    ["OpenStreetMap", "Roads, bridges, hydropower", "Overpass extract of 30 Oct 2026"],
                    ["Event timing", "Flood-front calibration", "Video at Gyirong Port; gauges at Syabrubesi and Betrawati; SMS alert"],
                  ].map(([a, b, c]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td><td className="src">{c}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p className="src" style={{ maxWidth: "var(--measure)" }}>Open Buildings does not cover China, so the Tibetan part of the corridor, including Gyirong Port, has no building data.</p>
            <p className="prose" style={{ marginTop: "1.5rem" }}>
              <Link href="/method/"><strong>How it was done, step by step:</strong> the whole chain from satellite pictures to results, and how every setting was chosen and checked.</Link>
            </p>
          </section>

          {/* ---------------- A. Footprint ---------------- */}
          <section id="footprint" className="station" aria-labelledby="h-footprint">
            <div className="station-head"><span className="plate solid">A</span><h2 id="h-footprint">Where the ground changed</h2></div>
            <div className="prose">
              <p className="lede">
                We compared satellite pictures of the valley from the same time of year, before and after the flood, and marked
                every spot that had changed.
              </p>
            </div>
            <ol className="findings two-by-two">
              <li><span className="k">1</span><span><strong>Green that disappeared.</strong> Forest, fields or grass that were there before the flood and gone after it, scraped away or buried.
                <span className="tech">NDVI (a satellite measure of how green and leafy the ground is) fell by more than 0.1 between the before and after pictures: Sentinel-2 averages of 27 Aug to 28 Oct, 2025 and 2026, with clouds removed by Cloud Score+.</span></span></li>
              <li><span className="k">2</span><span><strong>Bare ground covered by new debris.</strong> Riverbeds, river banks, roads and roofs had no plants to lose, so step 1 cannot see them. Here we look for a strong change of colour instead, such as grey river sand buried under brown mud and boulders.
                <span className="tech">Change-vector magnitude <i>d</i> (how far a spot&rsquo;s colour moved across six colour bands, equation 1) above 0.08. In steps 1 and 2 alike, the spot must look like bare mud, rock or water after the flood: NDVI after below 0.35.</span></span></li>
              <li><span className="k">3</span><span><strong>A second, independent check by radar.</strong> Clouds can hide the ground in the pictures of steps 1 and 2. Radar satellites see through cloud, so we ask them too. Where the radar also saw a change, we are more sure.
                <span className="tech">Sentinel-1 radar echo (VH backscatter) changed by more than 4 dB, about 2.5 times stronger or weaker. Before and after are compared from the same satellite path (relative orbit 85), so the viewing angle is identical, and the grainy noise of radar (speckle) is smoothed over 50 m. Places found by both pictures and radar form the higher-confidence class.</span></span></li>
              <li><span className="k">4</span><span><strong>Only the flood&rsquo;s path.</strong> Not every change in the valley was this flood. We keep only the valley floor along the river it ran down, and drop snow, cloud, high slopes, other rivers and tiny specks.
                <span className="tech">Valley floor: less than 150 m above the nearest river (height above nearest drainage, MERIT Hydro). Snow, ice and cloud: snow index NDSI above 0.4, or very bright blue (reflectance above 0.25), in either picture. Corridor: the main river where more than 2,500 km² of land drains into it, plus 1 km either side and the Lhende Khola valley; this leaves out the river above the border in Tibet (2,141 km²) and the Tadi (551 km²) and Langtang (519 km²) side rivers. Specks: patches under 20 pixels (0.8 ha, about one football pitch) are dropped.</span></span></li>
            </ol>
            <div className="eq" role="math" aria-label="d equals the square root of the sum over bands b of the squared change in reflectance">
              <span><i>d</i> = √ Σ<sub><i>b</i></sub> (<i>ρ</i><sub><i>b</i>,after</sub> − <i>ρ</i><sub><i>b</i>,before</sub>)²,&ensp; <i>b</i> ∈ {"{"}B2, B3, B4, B8, B11, B12{"}"}</span>
              <span className="eq-n">(1)</span>
            </div>
            <div className="two-up">
              <div className="prose">
                <p>
                  The result is <strong className="num">{total.toFixed(1)} km²</strong> of changed ground: a ribbon along the river
                  from the source of the flood down to Bidur. Untouched valleys next to it stay clear. Most of it was found in the
                  pictures alone ({areas["Optical only"].toFixed(1)} km²); radar mostly confirmed the same places
                  ({areas["Both (higher confidence)"].toFixed(1)} km² flagged by both, {areas["Radar only"].toFixed(1)} km² by radar alone).
                </p>
              </div>
              <aside className="note">
                <p>
                  <strong>Think of it as a ribbon</strong> about 80 km long and, on average, about {Math.round((total / 80) * 200) * 5} m
                  wide: narrow in the gorges, wider at the source and where the valley opens near Bidur.
                </p>
                <p>
                  <strong>It is not all damage.</strong> It is ground whose surface changed: forest and fields stripped, mud and
                  boulders dumped, the river spread wider, buildings and roads buried. What lay inside it is counted in section B.
                </p>
              </aside>
            </div>
            <figure className="figure">
              <FootprintStack areas={areas} />
              <div className="table-wrap" style={{ marginTop: "1rem" }}>
                <table>
                  <thead>
                    <tr><th>Piece</th><th>What it means</th><th className="r">Area</th><th className="r">Share</th></tr>
                  </thead>
                  <tbody>
                    {[
                      { cls: 1, name: "Optical only", stripes: "Red stripes", v: areas["Optical only"], pen: "var(--pen)",
                        text: "Found in the satellite pictures (steps 1 and 2); radar saw no clear change there." },
                      { cls: 3, name: "Both", stripes: "Crossed stripes", v: areas["Both (higher confidence)"], pen: "var(--pen)",
                        text: "Found by the pictures and by radar. Two independent checks agree, so these are the surest places." },
                      { cls: 2, name: "Radar only", stripes: "Blue stripes", v: areas["Radar only"], pen: "var(--pen-2)",
                        text: "Only radar saw a change: most likely where cloud hid the ground in the pictures, or where the change showed in the radar echo but not in the colour." },
                    ].map((r) => (
                      <tr key={r.cls}>
                        <th scope="row" style={{ whiteSpace: "nowrap" }}>
                          <svg width="22" height="14" aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: "0.5rem" }}>
                            <rect x="0.5" y="0.5" width="21" height="13" fill={`url(#hatch-${r.cls})`} stroke={r.pen} />
                          </svg>
                          {r.name}<span className="sr-only"> ({r.stripes.toLowerCase()})</span>
                        </th>
                        <td>{r.text}</td>
                        <td className="num r" style={{ whiteSpace: "nowrap" }}>{r.v.toFixed(2)} km²</td>
                        <td className="num r">{pct(r.v / total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <figcaption className="caption"><b>Who found it</b>The changed ground split by which satellite found it, in km².</figcaption>
            </figure>
            <figure className="figure">
              <CorridorMap view="footprint" />
              <figcaption className="caption"><b>Fig. 3–4</b>Striped: our footprint, mapped by this study from the satellite images. Black outline: the damage Copernicus EMS experts drew by hand (EMSR927), only inside the three areas they covered, whose edges are dashed. Zoom into an area to compare the two.</figcaption>
            </figure>
          </section>

          {/* ---------------- A. Validation ---------------- */}
          <section id="validation" className="station" aria-labelledby="h-validation">
            <div className="station-head"><span className="plate solid">A</span><h2 id="h-validation">Checked against Copernicus</h2></div>
            <div className="prose">
              <p className="lede">
                Against the Copernicus EMS rapid mapping of the event, the footprint reaches F1 scores of{" "}
                {Math.min(...f1s).toFixed(2)} to {Math.max(...f1s).toFixed(2)}, with precision of {Math.min(...precisions).toFixed(2)} to{" "}
                {Math.max(...precisions).toFixed(2)}. The misses lie at the margins of the mapped extent.
              </p>
              <p>
                The thresholds were not set by hand. A sweep of 1,008 combinations was scored against the EMSR927 mapped extent
                inside each area&rsquo;s analysed region, on a 20 m grid. Leave-one-area-out tuning chose settings on two areas
                and scored them on the third. The Langtang Khola valley, untouched in 2026, served as a control: settings that
                flagged more than 2 % of its valley floor were rejected.
              </p>
            </div>
            <figure className="figure">
              <ValidationTable scores={validation} />
              <figcaption className="caption"><b>Table III</b>Switch to radar or both to see why optical change carries the footprint: radar alone recalled {pct(radarRecall["Syabrubesi"])} and {pct(radarRecall["Timure"])} of the mapped extent in the Syabrubesi and Timure gorges, where steep walls cause layover and shadow, but {pct(radarRecall["Bidur"])} at Bidur, where the valley widens.</figcaption>
            </figure>
            <div className="two-up">
              <figure className="figure" style={{ marginTop: 0 }}>
                <F1Change first={f1(firstRule)} final={f1(validation)} heldOut={heldOut} />
                <figcaption className="caption"><b>F1, by area</b>From a hand-set first rule without change vector analysis to the chosen rule, and the score when that area was held out of tuning.</figcaption>
              </figure>
              <div className="prose">
                <p>
                  Adding change vector analysis raised F1 most at Timure, because much of its debris buried ground that was already
                  bare. Held-out scores were {Object.values(heldOut).map((v) => v.toFixed(2)).join(", ")}, close to the in-sample
                  values, and all three folds chose nearly the same thresholds.
                </p>
                <p>
                  The control limit mattered. The best setting without it flagged {(tuning.unconstrained_best.control_flagged * 100).toFixed(1)} %{" "}
                  of the untouched Langtang valley floor, against {(tuning.final.control_flagged * 100).toFixed(1)} % for the chosen one.
                </p>
              </div>
            </div>
          </section>

          {/* ---------------- B. Exposure ---------------- */}
          <section id="exposure" className="station" aria-labelledby="h-exposure">
            <div className="station-head"><span className="plate solid">B</span><h2 id="h-exposure">What lay in its path</h2></div>
            <div className="prose">
              <p className="lede">
                The footprint contains {pct(destroyed.share)} of the buildings Copernicus graded as destroyed (
                {n(destroyed.in_footprint)} of {n(destroyed.graded)}), {pct(roads.share_in_footprint)} of the{" "}
                {roads.destroyed_road_km.toFixed(1)} km of road graded destroyed, and all {roads.destroyed_bridges} destroyed
                bridges within {roads.bridge_tolerance_m} m.
              </p>
              <p>
                Buildings count as inside when their 20 m pixel is flagged. Road length inside is sampled every 5 m along each
                line. Bridges count within 40 m of the footprint, hydropower sites within 100 m, since both sit at the
                river&rsquo;s edge.
              </p>
            </div>
            <figure className="figure">
              <BuildingsChart pooled={buildings.cems_pooled} byArea={buildings.cems} />
              <figcaption className="caption"><b>Fig. 5</b>Share of the buildings Copernicus graded in its three areas that lie inside our footprint, by damage grade. Destroyed buildings are almost all inside; possibly damaged ones mostly lie beyond it.</figcaption>
            </figure>
            <figure className="figure">
              <CorridorMap view="exposure" />
              <figcaption className="caption"><b>Exposure</b>Pink: our footprint. Blue: every building, road and bridge the Copernicus experts graded as damaged; a filled dot lies inside our footprint, a hollow one outside it. Tap or hover a mark for its grade. Hydropower plants on the main stem are named.</figcaption>
            </figure>

            <h3 className="sub">Open data undercount what was hit</h3>
            <div className="two-up">
              <div className="prose">
                <p>
                  Along the corridor, {n(ob.in_footprint)} of the {n(ob.in_corridor)} Open Buildings footprints lie inside the
                  footprint. But within the Copernicus areas, Open Buildings holds fewer buildings than Copernicus graded as
                  destroyed: Copernicus photo-interprets every structure on post-event imagery, while Open Buildings is mapped
                  from earlier imagery with a confidence cut-off.
                </p>
                <p>
                  The footprint holds {osmRoadKm.toFixed(1)} km of OpenStreetMap road and {osmBridges.road + osmBridges.foot}{" "}
                  bridges, {osmBridges.road} for roads and {osmBridges.foot} for pedestrians, against 53 footbridges the government
                  assessment reports damaged. Five named hydropower plants lie within 100 m of it: the Chilime powerhouse, the
                  Trishuli dam and power station, Upper Trishuli 3A and the Upper Trishuli 3B powerhouse, with four unnamed weirs
                  and dams. Two other projects on the corridor, Rasuwagadhi and Upper Trishuli 1, are not in OpenStreetMap.
                </p>
                <p>Exposure counts from open data are therefore a lower bound, and rapid loss estimates built on them will run low.</p>
              </div>
              <figure className="figure" style={{ marginTop: 0 }}>
                <UndercountChart cems={cemsDestroyedIn} open={ob.in_footprint_by_cems_area} />
                <figcaption className="caption"><b>Inside the footprint</b>Buildings Copernicus graded destroyed, and Open Buildings footprints, in each Copernicus area.</figcaption>
              </figure>
            </div>
          </section>

          {/* ---------------- C. Lead time ---------------- */}
          <section id="leadtime" className="station" aria-labelledby="h-leadtime">
            <div className="station-head"><span className="plate solid">C</span><h2 id="h-leadtime">How much warning there was</h2></div>
            <div className="prose">
              <p className="lede">
                The front reached Syabrubesi about {Math.round(syab.arrival_min)} minutes after the collapse, {smsLead} minutes
                before the SMS alert, and Betrawati about {Math.round(lt["Betrawati"].arrival_min)} minutes after it.
              </p>
              <p>
                The river profile is the MERIT Hydro main stem, ordered downstream by upstream area, with bed slope <i>S</i>{" "}
                smoothed over 500 m either side. From Rasuwagadhi to Syabrubesi the front is a debris flow at a steady speed of
                at most 52 m/s, the speed observed between the collapse and Gyirong Port. Below Syabrubesi it is a kinematic
                flood wave whose celerity follows Manning&rsquo;s equation:
              </p>
            </div>
            <div className="eq" role="math" aria-label="c equals k times the square root of S, where k equals five thirds h to the two thirds over n">
              <span><i>c</i> = <i>k</i>√<i>S</i>,&emsp; <i>k</i> = (5/3) <i>h</i><sup>2/3</sup> / <i>n</i></span>
              <span className="eq-n">(2)</span>
            </div>
            <div className="prose">
              <p>
                The single unknown <i>k</i> is fitted to the observed timing: Gyirong Port 7 minutes after the collapse,
                Syabrubesi by 13 minutes (its gauge stopped transmitting at 08:50), and Betrawati at 38 to 48 minutes, a ±5 minute
                band around 09:20, when its gauge stopped transmitting. A Monte Carlo of 10,000 draws across these windows gives
                the arrival times and their 5 to 95 % ranges.
              </p>
            </div>
            <figure className="figure trace-plate">
              <div className="trace-head">
                <span className="plate solid">Fig. 7 · arrival along the river</span>
                <TraceLegend full />
              </div>
              <Trace full />
            </figure>
            <figure className="figure">
              <WarningTable places={lt} />
            </figure>
            <div className="prose">
              <p>
                The fitted model implies a flood depth of {depth[0]} to {depth[2]} m (median {depth[1]} m, Manning&rsquo;s{" "}
                <i>n</i> = {leadtime.implied_flood_depth_m.manning_n}), of the same order as the 9 m rise in 30 minutes that ICIMOD
                reported on the Trishuli at Galchhi, further downstream, although depth was not used in the fit.
              </p>
              <p>
                The Flood Forecasting Division learned of the flood at 09:05, and SMS alerts went out at 09:15, after the front had
                passed Timure and Syabrubesi and as it reached the Upper Trishuli plants and Betrawati. Near the border, even an
                instant automatic alert gives only 5 to 10 minutes. Further downstream the time existed but was not used: an alert
                triggered automatically, from the collapse&rsquo;s seismic signal or from upstream sensors with data shared across
                the border, would have given {autoMid[0]} to {autoMid[2]} minutes at the midstream hydropower sites and Betrawati.
              </p>
            </div>
          </section>

          {/* ---------------- What it means ---------------- */}
          <section id="meaning" className="station" aria-labelledby="h-meaning">
            <div className="station-head"><h2 id="h-meaning">What open data can and cannot do</h2></div>
            <div className="prose">
              <p className="lede">
                Open data reproduced the official damage mapping within nine weeks of the event and without commercial imagery.
                Three choices made the difference: change vector analysis for debris on already-bare ground, an event corridor
                that keeps other rivers and the late-September rains out, and a control valley that stopped tuning from rewarding
                false alarms outside the reference areas.
              </p>
              <p>
                Two attempts failed and are worth reporting. Ending the Sentinel-2 window before the 24 to 28 September rains left
                too few cloud-free monsoon scenes, and F1 fell to 0.1 to 0.3. A snow mask widened by 100 m erased much of the
                corridor, because water and wet debris pass the snow index test as well as snow does.
              </p>
              <h3>Limitations</h3>
            </div>
            <div className="two-up limits">
              <ol className="findings">
                <li><span className="k">1</span><span>The timing observations come from news reports compiled after the event, and a gauge falling silent may partly reflect telemetry failure rather than the flood&rsquo;s arrival.</span></li>
                <li><span className="k">2</span><span>The flood model is first-order and one-dimensional and ignores attenuation, so its downstream arrival times are early and its downstream warning times are minimums. A 2D hydraulic model would refine them.</span></li>
                <li><span className="k">3</span><span>MERIT Hydro&rsquo;s 90 m grid limits the river profile and the valley mask.</span></li>
                <li><span className="k">4</span><span>Validation is possible only where Copernicus mapped: three areas, with one control valley.</span></li>
              </ol>
              <ol className="findings" start={5}>
                <li><span className="k">5</span><span>
                  <strong>Our map misses part of what Copernicus mapped.</strong> In its three areas the footprint misses{" "}
                  {pct(1 - Math.max(...recalls))} to {pct(1 - Math.min(...recalls))} of the damage Copernicus outlined (recall{" "}
                  {Math.min(...recalls).toFixed(2)} to {Math.max(...recalls).toFixed(2)}), and {pct(1 - Math.max(...precisions))} to{" "}
                  {pct(1 - Math.min(...precisions))} of the footprint lies outside that outline. The misses lie mostly at the edges.
                  Likely reasons, not separately tested: our pixels are 20 m across and patches under 0.8 ha are dropped, while
                  Copernicus traced 0.5 m imagery by hand, so thin strips at the margins are lost; some flooded ground changed too
                  little to pass the rule, such as a thin layer of silt or plants that survived or grew back before the late-October
                  images; and in the narrow gorges radar cannot add a second look. The ground outside the outline may be change from
                  the late-September rains, or damage Copernicus did not draw.
                  <span className="tech">On the map, compare our footprint with the solid black Copernicus outline. The dashed line only marks where Copernicus looked, not damage.</span>
                </span></li>
                <li><span className="k">6</span><span>The Sentinel-2 window runs to 28 October, so main-stem changes from the late-September rains cannot be separated from the August event, and Open Buildings comes from imagery that predates the event by several years.</span></li>
              </ol>
            </div>
            <div className="prose">
              <p className="lede" style={{ marginTop: "2.5rem" }}>
                The flood reached the border settlements within minutes, before any warning could be issued, but the midstream
                hydropower sites and towns had {autoMid[0]} to {autoMid[2]} minutes that an automatic alert could have used. For
                Nepal&rsquo;s transboundary valleys, investment in automatic detection and data sharing is likely to save more
                lives than faster mapping after the fact.
              </p>
            </div>
          </section>

          {/* ---------------- Code and citation ---------------- */}
          <section id="code" className="station" aria-labelledby="h-code">
            <div className="station-head"><h2 id="h-code">Code and citation</h2></div>
            <div className="prose">
              <p>
                Every number on this page is read from the <a href={REPO}>rasuwa</a> package&rsquo;s outputs when the site is built.
                The package has one module per analysis and a command-line step for each. The footprint is released as 20 m
                GeoTIFF tiles (UTM 45N) with the scores and counts as JSON, and will be archived on Zenodo with a DOI before
                submission.
              </p>
            </div>
            <pre>{`python -m rasuwa export          # footprint into data/footprint/, tile by tile
python -m rasuwa footprint       # areas and map
python -m rasuwa validate        # scores against Copernicus EMSR927
python -m rasuwa buildings
python -m rasuwa infrastructure
python -m rasuwa leadtime
python -m rasuwa web             # map layers and imagery for this site`}</pre>
            <div className="cite">
              <p style={{ margin: 0 }}>
                Acharya, N. <i>Downstream impacts and warning lead time of the 26 August 2026 Bhote Koshi–Trishuli cascade,
                Nepal, from open multi-sensor data.</i> In preparation, 2026. Code: {REPO.replace("https://", "")}
              </p>
            </div>
          </section>
        </main>
      </div>

    </>
  );
}
