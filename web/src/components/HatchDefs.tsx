// Hatch patterns the footprint charts and keys fill with. Static SVG, so a server component.
/** Optical: pen 1 at 45 degrees; radar: pen 2 at -45 degrees; both flagged: the two crossed. Rendered once per page. */
export default function HatchDefs() {
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
