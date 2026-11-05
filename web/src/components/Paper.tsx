// The paper the site accompanies: byline, citation with downloads, and links between the two pages.
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { AUTHORS, DOI, OG_IMAGE, PAPER, PUBLISHED, REPO, UPDATED } from "@/lib/results";

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function Byline({ style }: { style?: CSSProperties }) {
  return (
    <p className="byline" style={style}>
      Companion to <i>{PAPER}</i>, by{" "}
      {AUTHORS.map((a, i) => (
        <Fragment key={a.id}>
          {i ? " and " : ""}
          {a.name} (<a href={`https://orcid.org/${a.orcid}`}>ORCID</a>)
        </Fragment>
      ))}
      , geomatics engineers in Nepal. The manuscript is under peer review, and its results may change. Published{" "}
      <time dateTime={PUBLISHED}>{day(PUBLISHED)}</time>, updated <time dateTime={UPDATED}>{day(UPDATED)}</time>.
    </p>
  );
}

export function Cite() {
  return (
    <div className="cite">
      <p style={{ margin: 0 }}>
        Acharya, N., and Pathak, S. <i>{PAPER}.</i> Manuscript under review, 2026. Code: {REPO.replace("https://", "")}. Data:{" "}
        {DOI.replace("https://", "")}
      </p>
      <div className="actions">
        <a href="/cite.bib" download>Cite (BibTeX)</a>
        <a href="/data/footprint.geojson" download>Footprint (GeoJSON)</a>
        <a href={DOI}>All data and code</a>
        <a href={OG_IMAGE.url}>Press figure (PNG)</a>
      </div>
    </div>
  );
}

// "Method, step 7: how …" under a result, or "Result: …" under a method step.
export function SeeAlso({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <p className="prose" style={{ marginTop: "1.5rem" }}>
      <Link href={href}><strong>{label}:</strong> {children}</Link>
    </p>
  );
}
