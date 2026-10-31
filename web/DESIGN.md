---
name: Rasuwa–Trishuli 2026, companion site
description: The river's stage record of 26 August 2026, a chart-recorder sheet where one pen traces the flood front against the clock.
colors:
  paper: "#f2f5f0"
  paper-2: "#e7eee6"
  rule: "#d4e2d6"
  rule-2: "#afcab5"
  ink: "#17211c"
  ink-2: "#435249"
  ink-3: "#6a7a70"
  pen: "#c42b3a"
  pen-2: "#2357a8"
  map-ground: "#eaf0e8"
  relief-highlight: "#fbfdf9"
  relief-shadow: "#5f8069"
  relief-accent: "#3f5a48"
typography:
  numeral:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(8rem, 15vw, 13.5rem)"
    fontWeight: 600
    lineHeight: 0.74
    letterSpacing: "-0.03em"
    fontFeature: "lnum"
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3rem, 6.2vw, 5.6rem)"
    fontWeight: 600
    lineHeight: 0.92
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.25rem, 4.4vw, 3.6rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
  lede:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
  reading:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
    fontFeature: "tnum, lnum"
rounded:
  none: "0"
  nib: "7px 7px 2px 2px"
  marker: "50%"
spacing:
  minor: "8px"
  major: "40px"
  gutter: "clamp(1rem, 3vw, 2.5rem)"
  measure: "66ch"
  station: "clamp(4rem, 8vw, 7rem)"
components:
  plate:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.35em 0.55em 0.3em"
  plate-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  plate-pen:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.pen}"
    typography: "{typography.label}"
  switch-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.7rem 0.4rem"
  switch-button-hover:
    backgroundColor: "{colors.paper-2}"
  switch-button-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  pen-nib:
    backgroundColor: "{colors.pen}"
    rounded: "{rounded.nib}"
    width: "14px"
    height: "30px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0.4rem 0.55rem"
  rule-block-term:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    padding: "0.7rem 0.75rem"
---

# Design System: Rasuwa–Trishuli 2026, companion site

## Overview

**Creative North Star: "The Stage Record"**

The site is a river-stage recorder sheet: pale green ruled chart paper, graphite ink, and two recorder pens. Pen 1 (carmine) draws the flood front against the clock; pen 2 (recorder blue) marks what was actually observed. Everything else is graphite on paper. The reading is that of an instrument record, not a story map: hairline frames, boxed caps name plates bolted onto the thing they name, tabular figures for every reading, and a serif column for the argument.

Density is that of a well-set scientific report: generous reading measure, figures that sit as framed plates in the column, a sticky contents rail down the ruled left margin. Ground is always light (read at desks and on phones in daylight). Depth comes from rules and frames, not from shadow or tone; the only colour that shouts is the carmine pen, and it shouts about one thing.

The world rejects the dark satellite story map with stat cards. The map itself is a hillshade inked in the paper's own greens; satellite imagery is an opt-in layer, not the ground.

**Key Characteristics:**
- Ruled chart paper (8px minor, 40px major) in the frame and on chart plates, never behind running text.
- One committed spot colour (carmine pen) for the front, our footprint and the cursor; recorder blue only for observations and Copernicus.
- Optical, radar and both as 45°, −45° and crossed hatches.
- Condensed grotesk caps for plates, station heads and readings; a serif reading face for prose.
- Square corners and 1px graphite frames throughout; 3px graphite top rules open every major band.

## Colors

Pale green chart paper, graphite ink, two recorder pens; colour is semantic, never decorative.

### Primary
- **Recorder Carmine** (pen): pen 1. The flood front (median line, 5–95 % band at about 13 % opacity, the moving dot), our impact footprint, the time cursor and its clock flag, the margin numeral, links' underline, focus ring, selection, the active rail entry, "flood arrived first" bars. Its tint `--pen-wash` (14 % into paper, mixed in OKLCH) grounds the optical hatch.

### Secondary
- **Recorder Blue** (pen-2): pen 2. Observations (the Syabrubesi and Betrawati windows, the port reading) and anything Copernicus EMS produced (graded buildings, the radar hatch, out-of-footprint roads). `--pen-2-wash` (12 %) grounds the radar hatch.

### Neutral
- **Chart Paper** (paper): page ground, plates, frames, and the halo behind chart text.
- **Paper Shade** (paper-2): rule-block terms, switch hover, empty map well, the unfilled track of score bars.
- **Faint Ruling** (rule): minor chart-paper lines.
- **Major Ruling** (rule-2): major chart-paper lines, and every light row divider (table rows, station list, rail border, rule-block rows).
- **Graphite** (ink): text, every frame and heavy rule, the SMS line, the automatic what-if alert, warning-minute bars, Open Buildings bars, solid plates and tooltips.
- **Soft Graphite** (ink-2): captions, bylines, axis ticks, secondary labels, inactive rail entries.
- **Pale Graphite** (ink-3): strokes and large text only (station leader lines, dotted station rules); fails body-text contrast and must not set small text.
- **Inked Relief** (map-ground, relief-highlight, relief-shadow, relief-accent): the MapLibre ground and hillshade, inked in the paper's own greens. Map-only.

### Named Rules
**The Two Pens Rule.** Carmine means the front, our footprint, or the cursor. Blue means observed, or Copernicus. Nothing else gets a pen: alerts, warning minutes, open-data counts and every structural mark are graphite.

**The Exposure Hatch Rule.** Optical change is a carmine 45° hatch on carmine wash; radar change is a blue −45° hatch on blue wash; "both" is the two hatches crossed. A legend swatch carries the same hatch as the mark it explains.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, sans-serif), weights 400–700
**Body Font:** Source Serif 4 (with Georgia, serif), optical sizing on, roman and italic

**Character:** A condensed instrument grotesk for everything that names or reads out, against a calm optical-size serif for everything that argues. Headings are set tight (line-height 0.92–1) and balanced.

### Hierarchy
- **Numeral** (600, clamp(8rem, 15vw, 13.5rem), 0.74): the margin figure, one per viewport at most, in carmine.
- **Display** (600, clamp(3rem, 6.2vw, 5.6rem), 0.92): the page title only.
- **Headline** (600, clamp(2.25rem, 4.4vw, 3.6rem), 1): station headers under a 3px graphite rule.
- **Title** (600, 1.5rem, 1): sub-heads inside a station.
- **Lede** (400, 1.25rem, 1.55): the opening paragraph of a station.
- **Body** (400, 1.125rem, 1.6; 1.0625rem under 640px): running prose at a 66ch measure.
- **Caption** (400, 0.95rem, 1.5, soft graphite): figure captions to 72ch, led by a bold caps figure tag ("Fig. 5", "Table III") in the label face.
- **Label** (600, 0.8125–0.95rem, 0.05–0.1em tracking, uppercase): plates, table heads, rail, switches, recorder strip terms, map markers.
- **Reading** (700, 1.6rem, tabular lining figures): the live clock readout under the trace.

### Named Rules
**The Tabular Reading Rule.** Every number a reader might compare (tables, readouts, axis values, bar ends) is set with tabular lining figures.

**The Two Voices Rule.** The serif never sets a label, and the condensed grotesk never sets a paragraph.

## Layout

A single long column of stations. The first viewport is a 5:7 grid (title, standfirst, margin numeral and station list on the left; the master trace on the right), under a full-width recorder header strip of label/value cells divided by major-ruling hairlines. Below it, a two-column body: a 12.5rem sticky contents rail on ruled paper, then the main column with prose capped at 66ch and figures allowed to run full width; paired figures sit in a two-up grid.

Spacing runs on the chart-paper module (8px minor, 40px major) and a fluid gutter (clamp(1rem, 3vw, 2.5rem)). Stations open with clamp(4rem, 8vw, 7rem) of air above a 3px rule. Figures take about 2.25–2.5rem above and below.

At 1100px and below, the hero stacks (head, trace, rest), the rail becomes a sticky disclosure bar at the top showing the current station, and two-up figures stack. At 640px and below, the recorder strip drops low-priority cells, the station list loses its dotted leaders, rule blocks stack term over definition, and maps shrink to 64vh.

### Named Rules
**The Ruled Frame Rule.** The chart-paper ruling belongs to the frame (the rail column) and to chart plates without a numeric axis. A chart with a numeric axis (the trace, flat charts, the warning-minute bars) turns the CSS ruling off and draws its own ruling on its data scale inside the SVG, so every line means a unit. Running text never sits on ruling.

## Elevation & Depth

Flat. Depth is carried by graphite frames (1px), opening rules (2–3px), and the paper/paper-shade step. Shadows exist only on things that float above the record or are held in the hand, and are soft and graphite-tinted.

### Shadow Vocabulary
- **Floating tip** (`box-shadow: 0 4px 14px rgb(23 33 28 / 0.25)`): chart and map tooltips.
- **Held control** (`box-shadow: 0 1px 3px rgb(23 33 28 / 0.35)`): the pen nib on the scrubber.
- **Before/after knob** (`box-shadow: 0 2px 10px rgb(23 33 28 / 0.35)`): the drag knob over imagery.

### Named Rules
**The Frame, Not Float Rule.** Plates, charts, maps, tables and controls never lift. If it is part of the record it is framed, not shadowed.

## Shapes

Square everywhere (0 radius), including MapLibre controls and popups, which are restyled to match. The exceptions are instrument parts: the pen nib (7px 7px 2px 2px, a nib silhouette), round map markers and chart dots (50%), and the circular before/after knob. Lines carry meaning by weight and dash: solid for fitted or observed, dashed (6 4) for extrapolated, short dash (5 4) for the what-if alert, dotted (1 3) for station lines, dashed graphite outline for the Copernicus extent.

## Components

### Name Plates
A boxed caps label that literally names the thing it sits on (the trace, a figure, an image corner, the analysis letter on a station head).
- **Shape:** square, 1px graphite border.
- **Default:** paper ground, graphite text; **Solid:** graphite ground, paper text; **Pen:** carmine border and text.
- **Rule:** a plate names the object it is attached to; it is not a heading kicker.

### Buttons and Switches
Segmented caps switches in a 1px graphite box, cells divided by graphite hairlines.
- **Hover:** paper shade. **Pressed:** solid graphite, paper text (`aria-pressed`).
- **Play button** on the scrubber: the same caps box; hover inverts to graphite.
- **Focus:** 2px carmine outline, 3px offset, everywhere.

### Tables and Rule Blocks
- **Tables:** caps caption on top, 2px graphite top rule and 1px under the head, major-ruling row dividers, tabular figures, right-aligned numeric columns.
- **Rule blocks:** a framed definition list set like a hydrological manual's worked rule; caps terms on paper shade in a 7.5rem column.
- **Equations:** between 1px graphite top and bottom rules, the equation number in the label face at the right.

### Navigation
- **Rail:** a sticky ordered list on a graphite left rule; caps entries in soft graphite with a station key; the current entry turns carmine and a 2px carmine tick draws in from the rule (0.4s, cubic-bezier(0.16, 1, 0.3, 1)).
- **Mobile:** a sticky disclosure bar with the current station in carmine; entries divided by major-ruling hairlines.
- **Station list (hero):** caps names with dotted leaders to tabular values under a 2px graphite rule; hover turns the name carmine.

### Charts and Maps
- **Chart plate:** 1px graphite frame, ruled paper unless it has a numeric axis; label-face SVG text with a 3px paper halo.
- **Map plate:** framed, head and foot bars divided by graphite rules; hillshade in inked greens; markers are caps labels on a paper scrim with a ringed dot that fills carmine when inside the footprint.
- **Before/after:** framed image pair split by a 2px paper divider with a round knob; corner plates name the two dates.

### The Trace (signature)
Distance down the river (km below Rasuwagadhi) against minutes after the collapse, on its own 2-unit/10-unit ruling, with station lines as on a graphical timetable. The carmine median draws itself on load (2.4s, cubic-bezier(0.16, 1, 0.3, 1); skipped under reduced motion), solid where fitted and dashed where extrapolated, over a carmine 5–95 % band. Observations are thick round blue strokes. The SMS alert is a 2px graphite line; the what-if automatic alert is dashed graphite. The pen is a carmine cursor with a clock flag, snapped to whole minutes by a range input whose thumb is a pen nib; the readout below states clock, minutes and front position in words, and the same time is shared by every view on the page.

## Do's and Don'ts

### Do:
- **Do** keep carmine for the front, our footprint and the cursor, and blue for observations and Copernicus; set everything else in graphite.
- **Do** draw ruling on the data scale inside any chart with a numeric axis, and switch the CSS ruling off for it.
- **Do** encode optical, radar and both as 45°, −45° and crossed hatches, with matching legend swatches.
- **Do** frame plates, charts, maps and tables with 1px graphite and open bands with a 2–3px graphite rule.
- **Do** set every compared number in tabular lining figures.
- **Do** keep ink-3 to strokes and large text.

### Don't:
- **Don't** put chart-paper ruling behind running text.
- **Don't** use a pen colour for alerts, warning minutes or any structural mark.
- **Don't** introduce a dark ground or a satellite basemap as the default map ground.
- **Don't** round corners on plates, controls, charts, maps or tooltips.
- **Don't** lift record surfaces with shadows; shadows are for floating tips and held controls only.
- **Don't** set paragraphs in the condensed face or labels in the serif.
