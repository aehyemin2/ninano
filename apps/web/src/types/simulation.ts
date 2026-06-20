export type RawVariableKey = "t2m" | "msl" | "tcwv" | "u10m" | "v10m";
export type DisplayVariableKey = "t2m" | "msl" | "tcwv" | "wind";
export type ScenarioKey = "la_nina" | "neutral" | "el_nino";

export interface GridDefinition {
  lat: number[];
  lon: number[];
}

export interface SimulationFrame {
  timestamp: string;
  fields: Record<RawVariableKey, number[]>;
}

export interface SimulationEndpoint {
  scenario: ScenarioKey;
  grid: GridDefinition;
  frames: SimulationFrame[];
}

export interface SimulationBundle {
  source: "api" | "preview";
  sourceLabel: string;
  endpoints: Record<ScenarioKey, SimulationEndpoint>;
}

export interface SimulationManifest {
  version: 1;
  endpoints: Record<ScenarioKey, string>;
}

export interface VariableDefinition {
  key: DisplayVariableKey;
  label: string;
  shortLabel: string;
  sourceFields: RawVariableKey[];
  unit: string;
  description: string;
  rawRange: readonly [number, number];
  ticks: readonly number[];
  colors: readonly string[];
  format: (value: number) => string;
}

export interface MapSample {
  lat: number;
  lon: number;
  value: number;
  u: number;
  v: number;
}
