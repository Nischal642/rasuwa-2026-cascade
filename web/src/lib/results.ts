// The paper's numbers, read at build time from ../outputs (written by `python -m rasuwa`).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const REPO = "https://github.com/Nischal642/rasuwa-2026-cascade";
export const DOI = "https://doi.org/10.5281/zenodo.23887627";
export const SITE = "https://rasuwaflood.nischalacharya642.com.np";

const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "..", "outputs", name), "utf8"));

export type Score = { precision: number; recall: number; f1: number; iou: number; ours_km2: number; copernicus_km2: number };
export type Method = "any" | "optical" | "radar" | "both";
export type Place = {
  chainage_km: number;
  arrival_min: number;
  arrival_5_95_min: [number, number];
  arrival_npt: string;
  after_sms_min: number;
  warning_with_auto_alert_min: number;
  extrapolated: boolean;
};

export const footprint: { areas_km2: Record<string, number> } = read("footprint_areas.json");
export const validation: Record<string, Record<Method, Score>> = read("validation.json");
export const firstRule: Record<string, Record<Method, Score>> = read("validation_v1.json"); // hand-set rule, no CVA
export type Params = { ndvi_drop: number; cva_min: number | null; ndvi_after_max: number; vh_db: number; hand_max_m: number };
export const tuning: {
  tune_grid: Record<keyof Params, (number | null)[]>;
  max_control_flagged: number;
  leave_one_area_out: Record<string, { params: Params; train_f1: number; control_flagged: number; test_scores: Score }>;
  final: { params: Params; control_flagged: number };
  unconstrained_best: { params: Params; control_flagged: number };
} = read("tuning.json");
/** F1 of the whole footprint, per Copernicus area; and per area when it was held out of tuning. */
export const f1ByArea = (s: typeof validation) => Object.fromEntries(Object.entries(s).map(([a, v]) => [a, v.any.f1]));
export const heldOutF1 = Object.fromEntries(Object.entries(tuning.leave_one_area_out).map(([a, v]) => [a, v.test_scores.f1]));
// The hand-set first rule, as recorded with its footprint (no change-vector test yet)
const v1 = read("footprint_areas_v1.json");
export const firstGuess: { params: Params; areas_km2: Record<string, number> } = {
  params: { ndvi_drop: v1.thresholds.NDVI_DROP, cva_min: null, ndvi_after_max: v1.thresholds.NDVI_AFTER_MAX,
            vh_db: v1.thresholds.VH_CHANGE_DB, hand_max_m: v1.thresholds.HAND_MAX_M },
  areas_km2: v1.areas_km2,
};
export const buildings: {
  cems: Record<string, Record<string, { graded: number; in_footprint: number }>>;
  cems_pooled: Record<string, { graded: number; in_footprint: number; share: number }>;
  open_buildings: { in_corridor: number; in_footprint: number; by_stretch: Record<string, number>; in_footprint_by_cems_area: Record<string, number> };
} = read("buildings.json");
export const infrastructure: {
  cems: Record<string, { destroyed_road_km: number; in_footprint_km: number; destroyed_bridges: number; bridges_in_footprint: number }>;
  cems_pooled: { destroyed_road_km: number; share_in_footprint: number; destroyed_bridges: number; bridges_in_footprint: number; bridge_tolerance_m: number };
  osm: {
    road_km_in_footprint: Record<string, { main: number; local: number; track: number }>;
    bridges_in_footprint: Record<string, { road: number; foot: number }>;
    hydropower_sites_within_100m: Record<string, string[]>;
  };
} = read("infrastructure.json");
export const leadtime: {
  places: Record<string, Place>;
  flood_speed_k: [number, number, number];
  implied_flood_depth_m: { manning_n: number; "5_50_95": [number, number, number] };
  worked_example: {
    k1_seconds: { betrawati: number; upper_trishuli_3a: number };
    draws: { syabrubesi_min: number; betrawati_min: number; k: number; upper_trishuli_3a_min: number }[];
  };
} = read("leadtime.json");

// Minutes between the front passing Syabrubesi and the 09:15 SMS alert.
export const SMS_LEAD = Math.round(-leadtime.places["Syabrubesi"].after_sms_min);

// Link-preview card, also offered as the press figure. Rendered once from the site's own type and colours.
export const OG_IMAGE = {
  url: "/press/rasuwa-flood-2026.png",
  width: 2400,
  height: 1260,
  alt: `The flood outran the warning: the front of the 26 August 2026 Rasuwa flood passed Syabrubesi ${SMS_LEAD} minutes before the 09:15 SMS alert.`,
};
