import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Source_Serif_4 } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { HatchDefs } from "@/components/Charts";
import PageLinks from "@/components/PageLinks";
import { REPO } from "@/lib/results";

const label = Barlow_Condensed({ variable: "--font-label", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const text = Source_Serif_4({ variable: "--font-text", subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "The flood outran the warning · Rasuwa–Trishuli cascade, 26 August 2026",
  description:
    "Companion to the paper on the 26 August 2026 Bhote Koshi–Trishuli cascade in Nepal: where the ground changed, what lay in its path, and how much warning there was, from open satellite data.",
};

export const viewport: Viewport = { themeColor: "#f2f5f0" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${label.variable} ${text.variable}`}>
      <body>
        <HatchDefs />
        <header>
          <dl className="record">
            <div><dt>Record</dt><dd>Bhote Koshi–Trishuli cascade</dd></div>
            <div className="hide-sm grow"><dt>River</dt><dd>Lhende Khola · Bhote Koshi · Trishuli, Nepal</dd></div>
            <div className="hide-sm"><dt>Date</dt><dd className="num">26 Aug 2026</dd></div>
            <div className="hide-sm"><dt>Start</dt><dd className="num">08:37 NPT</dd></div>
            <div className="end"><dt>Pages</dt><dd><PageLinks repo={REPO} /></dd></div>
          </dl>
        </header>
        {children}
        <footer className="foot">
          <div>
            <h2>Rasuwa–Trishuli 2026</h2>
            <p>Nischal Acharya and Sagar Pathak. Code MIT licensed.</p>
          </div>
          <div>
            <h2>Data and licences</h2>
            <p>
              Vantor Open Data and Planet imagery, CC BY-NC 4.0. Copernicus Emergency Management Service EMSR927 © European Union.
              Sentinel-1 and Sentinel-2: modified Copernicus Sentinel data 2025–2026. Google Open Buildings v3. OpenStreetMap
              © OpenStreetMap contributors, ODbL. MERIT Hydro. Relief from Terrain Tiles (Mapzen); satellite base map Sentinel-2
              cloudless 2024 by EOX, CC BY-NC-SA 4.0.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
