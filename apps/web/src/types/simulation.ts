export const RAW_VARIABLE_KEYS = [
  "sst",
  "u10m",
  "v10m",
  "t2m",
  "tpf",
  "msl",
  "tcwv",
] as const;

export type RawVariableKey = (typeof RAW_VARIABLE_KEYS)[number];
export type DisplayVariableKey = RawVariableKey;
export type ViewMode = "flat" | "globe";
export type FieldValues = Float32Array;

export interface ExperimentInputs {
  sstAnomaly: number;
  tradeWindChange: number;
}

export interface GridDefinition {
  lat: number[];
  lon: number[];
}

export interface FlatMapView {
  centerLon: number;
  centerLat: number;
  zoom: number;
}

export interface SimulationFrame {
  timestamp: string;
  fields: Record<RawVariableKey, FieldValues>;
}

export interface AxisMetadata {
  start: number;
  step: number;
  count: number;
}

export interface EnsoVariableMetadata {
  key: RawVariableKey;
  index: number;
  unit: string;
  label: string;
  displayRange: [number, number];
  colorScale: string | string[];
  noData?: "NaN" | string | null;
}

export interface EnsoMetadata {
  datasetVersion: string;
  baselineDate: string;
  encoding: {
    dtype: "float32";
    byteOrder: "little-endian";
    layout: "variable_lat_lon";
    byteLength: number;
    values?: "raw" | "display";
  };
  grid: {
    lat: AxisMetadata;
    lon: AxisMetadata;
  };
  sliders: {
    sstAnomaly: { values: number[] };
    windDelta: { values: number[] };
  };
  variables: EnsoVariableMetadata[];
}

export interface SimulationDataset {
  source: "api" | "packed" | "preview";
  sourceLabel: string;
  metadata: EnsoMetadata;
  grid: GridDefinition;
  baselineFrame: SimulationFrame;
  packedBaseUrl?: string;
}

export interface VariableDefinition {
  key: DisplayVariableKey;
  label: string;
  shortLabel: string;
  unit: string;
  description: string;
  displayRange: readonly [number, number];
  ticks: readonly number[];
  colors: readonly string[];
  format: (value: number) => string;
}

export type VariableCatalog = Record<DisplayVariableKey, VariableDefinition>;

export interface MapSample {
  lat: number;
  lon: number;
  value: number;
  u: number;
  v: number;
}
