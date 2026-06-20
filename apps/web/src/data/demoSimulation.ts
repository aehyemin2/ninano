import type {
  EnsoMetadata,
  ExperimentInputs,
  GridDefinition,
  RawVariableKey,
  SimulationDataset,
  SimulationFrame,
} from "../types/simulation";

const sstValues = Array.from({ length: 23 }, (_, index) => Number((-2 + index * 0.2).toFixed(1)));
const windValues = Array.from({ length: 11 }, (_, index) => index - 5);

export const PREVIEW_METADATA: EnsoMetadata = {
  datasetVersion: "ui-preview-1deg-v1",
  baselineDate: "2013-12-15T00:00:00Z",
  encoding: { dtype: "float32", byteOrder: "little-endian", layout: "variable_lat_lon", byteLength: 1_824_480, values: "display" },
  grid: {
    lat: { start: 90, step: -1, count: 181 },
    lon: { start: 0, step: 1, count: 360 },
  },
  sliders: { sstAnomaly: { values: sstValues }, windDelta: { values: windValues } },
  variables: [
    { key: "sst", index: 0, unit: "°C", label: "해수면 온도", displayRange: [0, 32], colorScale: "thermal", noData: "NaN" },
    { key: "u10m", index: 1, unit: "m/s", label: "동서 바람", displayRange: [-15, 15], colorScale: "wind" },
    { key: "v10m", index: 2, unit: "m/s", label: "남북 바람", displayRange: [-12, 12], colorScale: "wind" },
    { key: "t2m", index: 3, unit: "°C", label: "2m 기온", displayRange: [-50, 35], colorScale: "temperature" },
    { key: "tpf", index: 4, unit: "mm/day", label: "강수량", displayRange: [0, 60], colorScale: "precipitation" },
    { key: "msl", index: 5, unit: "hPa", label: "해면 기압", displayRange: [980, 1040], colorScale: "pressure" },
    { key: "tcwv", index: 6, unit: "kg/m²", label: "대기 수증기", displayRange: [0, 60], colorScale: "moisture" },
  ],
};

function gaussian(value: number, center: number, width: number): number {
  return Math.exp(-1 * ((value - center) / width) ** 2);
}

export function createPreviewFrame(inputs: ExperimentInputs): SimulationFrame {
  const size = PREVIEW_METADATA.grid.lat.count * PREVIEW_METADATA.grid.lon.count;
  const fields = Object.fromEntries(
    PREVIEW_METADATA.variables.map(({ key }) => [key, new Float32Array(size)]),
  ) as Record<RawVariableKey, Float32Array>;

  for (let row = 0; row < PREVIEW_METADATA.grid.lat.count; row += 1) {
    const lat = PREVIEW_METADATA.grid.lat.start + row * PREVIEW_METADATA.grid.lat.step;
    for (let column = 0; column < PREVIEW_METADATA.grid.lon.count; column += 1) {
      const lon = PREVIEW_METADATA.grid.lon.start + column * PREVIEW_METADATA.grid.lon.step;
      const index = row * PREVIEW_METADATA.grid.lon.count + column;
      const equator = gaussian(lat, 0, 12);
      const eastPacific = gaussian(lon, 225, 42);
      const westPacific = gaussian(lon, 150, 34);
      const ninoMask = equator * eastPacific;
      const tradeMask = equator * gaussian(lon, 205, 75);
      const thermalDelta = inputs.sstAnomaly * ninoMask;
      const windDelta = inputs.tradeWindChange * tradeMask;

      fields.sst[index] = 26 - Math.abs(lat) * 0.2 + westPacific * 2.1 + thermalDelta;
      fields.t2m[index] = 27 - Math.abs(lat) * 0.45 + westPacific * 1.5 + thermalDelta * 0.42;
      fields.u10m[index] = -5.2 * equator + Math.sin(lat / 8) + windDelta;
      fields.v10m[index] = Math.sin((lon - 180) / 24) * 1.7 + Math.sign(lat || 1) * 0.9;
      fields.msl[index] = 1011 + Math.abs(lat) * 0.18 - thermalDelta * 0.85 - windDelta * 0.18;
      fields.tcwv[index] = Math.max(0, 52 * equator + 7 + thermalDelta * 1.4 + Math.sin(lon / 13) * 2.5);
      fields.tpf[index] = Math.max(0, 2.2 + equator * westPacific * 27 + thermalDelta * 3 - windDelta * 0.35);
    }
  }
  return { timestamp: PREVIEW_METADATA.baselineDate, fields };
}

function axisValues(axis: { start: number; step: number; count: number }): number[] {
  return Array.from({ length: axis.count }, (_, index) => axis.start + axis.step * index);
}

export function createPreviewDataset(): SimulationDataset {
  const grid: GridDefinition = {
    lat: axisValues(PREVIEW_METADATA.grid.lat),
    lon: axisValues(PREVIEW_METADATA.grid.lon),
  };
  return {
    source: "preview",
    sourceLabel: "FastAPI 연결 대기 중 · 1° UI preview",
    metadata: PREVIEW_METADATA,
    grid,
    baselineFrame: createPreviewFrame({ sstAnomaly: 0, tradeWindChange: 0 }),
  };
}
