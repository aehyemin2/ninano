import { createPreviewDataset, createPreviewFrame, PREVIEW_METADATA } from "./demoSimulation";
import {
  buildF32FileName,
  readPlanarWindF32,
  readScalarF32,
  readWindF32,
} from "./readF32Frame";
import {
  RAW_VARIABLE_KEYS,
  type DisplayVariableKey,
  type EnsoMetadata,
  type ExperimentInputs,
  type RawVariableKey,
  type SimulationDataset,
  type SimulationFrame,
} from "../types/simulation";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");
const PACKED_BASE_URL = (import.meta.env.VITE_F32_BASE_URL ?? "/public_data/f32_packed_05deg").replace(/\/$/, "");
const MAX_CACHED_BYTES = 64 * 1024 * 1024;

interface CacheEntry {
  value: unknown;
  byteLength: number;
}

const dataCache = new Map<string, CacheEntry>();
let cachedByteLength = 0;

interface PackedManifest {
  dtype: "float32";
  byte_order: "little_endian";
  lat_size: number;
  lon_size: number;
  lat_order: { first: number; last: number; step: number };
  lon_order: { first: number; last: number; step: number };
  scalar: { variables: string[]; bytes_per_file: number };
  wind: { variables: string[]; layout?: string[]; component_order: string[]; bytes_per_file: number };
}

const SCALAR_KEYS = new Set<RawVariableKey>(["sst", "t2m", "tpf", "msl", "tcwv"]);

function axisValues(axis: { start: number; step: number; count: number }): number[] {
  return Array.from({ length: axis.count }, (_, index) => axis.start + axis.step * index);
}

function validatePackedManifest(value: PackedManifest): PackedManifest {
  const fieldSize = value?.lat_size * value?.lon_size;
  if (value?.dtype !== "float32" || value.byte_order !== "little_endian" || !Number.isInteger(fieldSize)) {
    throw new Error("지원하지 않는 packed f32 manifest입니다.");
  }
  if (value.scalar.bytes_per_file !== fieldSize * 4 || value.wind.bytes_per_file !== fieldSize * 8) {
    throw new Error("packed f32 manifest의 파일 크기가 격자와 일치하지 않습니다.");
  }
  if (value.wind.component_order.join(",") !== "u10m,v10m") {
    throw new Error("wind component 순서는 u10m, v10m이어야 합니다.");
  }
  const windLayout = value.wind.layout?.join(",");
  if (windLayout !== "lat,lon,component" && windLayout !== "component,lat,lon") {
    throw new Error(`지원하지 않는 wind layout입니다: ${windLayout}`);
  }
  return value;
}

function windLayoutFromManifest(manifest: PackedManifest): "interleaved" | "planar" {
  return manifest.wind.layout?.[0] === "component" ? "planar" : "interleaved";
}

function metadataFromManifest(manifest: PackedManifest): EnsoMetadata {
  const fieldSize = manifest.lat_size * manifest.lon_size;
  return {
    ...PREVIEW_METADATA,
    datasetVersion: `packed-${Math.abs(manifest.lon_order.step)}deg-v1`,
    encoding: {
      dtype: "float32",
      byteOrder: "little-endian",
      layout: "variable_lat_lon",
      byteLength: fieldSize * RAW_VARIABLE_KEYS.length * 4,
      values: "raw",
    },
    grid: {
      lat: { start: manifest.lat_order.first, step: manifest.lat_order.step, count: manifest.lat_size },
      lon: { start: manifest.lon_order.first, step: manifest.lon_order.step, count: manifest.lon_size },
    },
  };
}

function getCached<T>(key: string): T | undefined {
  const entry = dataCache.get(key);
  if (!entry) return undefined;
  dataCache.delete(key);
  dataCache.set(key, entry);
  return entry.value as T;
}

function cacheValue<T>(key: string, value: T, byteLength: number): T {
  const previous = dataCache.get(key);
  if (previous) cachedByteLength -= previous.byteLength;
  dataCache.delete(key);
  dataCache.set(key, { value, byteLength });
  cachedByteLength += byteLength;
  while (cachedByteLength > MAX_CACHED_BYTES && dataCache.size > 1) {
    const oldestKey = dataCache.keys().next().value as string;
    const oldest = dataCache.get(oldestKey);
    dataCache.delete(oldestKey);
    cachedByteLength -= oldest?.byteLength ?? 0;
  }
  return value;
}

async function fetchBuffer(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} 요청 실패 (${response.status})`);
  return response.arrayBuffer();
}

async function fetchPackedScalar(
  cacheNamespace: string,
  url: string,
  key: RawVariableKey,
  fieldSize: number,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const cacheKey = `${cacheNamespace}:${key}:${url}`;
  const cached = getCached<Float32Array>(cacheKey);
  if (cached) return cached;
  const values = readScalarF32(await fetchBuffer(url, signal), fieldSize, key);
  return cacheValue(cacheKey, values, values.byteLength);
}

async function fetchPackedWind(
  cacheNamespace: string,
  url: string,
  fieldSize: number,
  layout: "interleaved" | "planar",
  signal?: AbortSignal,
): Promise<{ u10m: Float32Array; v10m: Float32Array }> {
  const cacheKey = `${cacheNamespace}:wind:${url}`;
  const cached = getCached<{ u10m: Float32Array; v10m: Float32Array }>(cacheKey);
  if (cached) return cached;
  const buffer = await fetchBuffer(url, signal);
  const wind = layout === "planar"
    ? readPlanarWindF32(buffer, fieldSize)
    : readWindF32(buffer, fieldSize);
  return cacheValue(cacheKey, wind, wind.u10m.byteLength + wind.v10m.byteLength);
}

async function fetchPackedScalarFrame(
  cacheNamespace: string,
  layerUrl: (layer: RawVariableKey | "wind", fileName: string) => string,
  metadata: EnsoMetadata,
  inputs: ExperimentInputs,
  selectedVariable: DisplayVariableKey,
  includeSst: boolean,
  signal?: AbortSignal,
): Promise<SimulationFrame> {
  const fileName = buildF32FileName(inputs);
  const fieldSize = metadata.grid.lat.count * metadata.grid.lon.count;
  const scalarKeys = new Set<RawVariableKey>();
  if (SCALAR_KEYS.has(selectedVariable)) scalarKeys.add(selectedVariable);
  if (includeSst) scalarKeys.add("sst");
  const scalarEntries = await Promise.all(Array.from(scalarKeys, async (key) => [
      key,
      await fetchPackedScalar(cacheNamespace, layerUrl(key, fileName), key, fieldSize, signal),
    ] as const));
  const empty = new Float32Array(0);
  const fields = Object.fromEntries(RAW_VARIABLE_KEYS.map((key) => [key, empty])) as Record<RawVariableKey, Float32Array>;
  for (const [key, values] of scalarEntries) fields[key] = values;
  return { timestamp: metadata.baselineDate, fields };
}

async function fetchPackedDataset(selectedVariable: DisplayVariableKey, signal?: AbortSignal): Promise<SimulationDataset> {
  const response = await fetch(`${PACKED_BASE_URL}/manifest.json`, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`packed manifest 요청 실패 (${response.status})`);
  const manifest = validatePackedManifest(await response.json() as PackedManifest);
  const metadata = metadataFromManifest(manifest);
  const windLayout = windLayoutFromManifest(manifest);
  const grid = { lat: axisValues(metadata.grid.lat), lon: axisValues(metadata.grid.lon) };
  const baselineFrame = await fetchPackedScalarFrame(
    `static:${PACKED_BASE_URL}`,
    (layer, fileName) => `${PACKED_BASE_URL}/${layer}/${fileName}`,
    metadata,
    { sstAnomaly: 0, tradeWindChange: 0 },
    selectedVariable,
    true,
    signal,
  );
  return {
    source: "packed",
    sourceLabel: `${metadata.datasetVersion} · variable-packed f32`,
    metadata,
    grid,
    baselineFrame,
    packedBaseUrl: PACKED_BASE_URL,
    packedWindLayout: windLayout,
  };
}

async function fetchLayerApiDataset(selectedVariable: DisplayVariableKey, signal?: AbortSignal): Promise<SimulationDataset> {
  const response = await fetch(`${API_BASE_URL}/enso/metadata`, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`FastAPI metadata 요청 실패 (${response.status})`);
  const manifest = validatePackedManifest(await response.json() as PackedManifest);
  const metadata = metadataFromManifest(manifest);
  const grid = { lat: axisValues(metadata.grid.lat), lon: axisValues(metadata.grid.lon) };
  const layerUrl = (layer: RawVariableKey | "wind", _fileName: string): string => {
    const query = new URLSearchParams({ sst_anomaly: "0.0", wind_delta: "0" });
    if (layer === "wind") query.set("layout", "planar");
    return `${API_BASE_URL}/enso/layers/${layer}?${query}`;
  };
  const baselineFrame = await fetchPackedScalarFrame(
    `api:${API_BASE_URL}`,
    layerUrl,
    metadata,
    { sstAnomaly: 0, tradeWindChange: 0 },
    selectedVariable,
    true,
    signal,
  );
  return {
    source: "api",
    sourceLabel: `${metadata.datasetVersion} · FastAPI layer f32`,
    metadata,
    grid,
    baselineFrame,
    layerApiBaseUrl: API_BASE_URL,
  };
}

export async function loadSimulationDataset(
  selectedVariable: DisplayVariableKey = "t2m",
  signal?: AbortSignal,
): Promise<SimulationDataset> {
  try {
    return await fetchLayerApiDataset(selectedVariable, signal);
  } catch (apiError) {
    if (apiError instanceof DOMException && apiError.name === "AbortError") throw apiError;
    console.info("ENSO layer API unavailable; trying static packed f32.", apiError);
  }
  try {
    return await fetchPackedDataset(selectedVariable, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    console.info("ENSO API unavailable; using the UI preview dataset.", error);
    return createPreviewDataset();
  }
}

function sourceRequest(
  dataset: SimulationDataset,
  inputs: ExperimentInputs,
): {
  cacheNamespace: string;
  layerUrl: (layer: RawVariableKey | "wind", fileName: string) => string;
  windLayout: "interleaved" | "planar";
} | null {
  if (dataset.source === "api" && dataset.layerApiBaseUrl) {
    const baseUrl = dataset.layerApiBaseUrl;
    const query = new URLSearchParams({
      sst_anomaly: inputs.sstAnomaly.toFixed(1),
      wind_delta: inputs.tradeWindChange.toFixed(0),
    });
    return {
      cacheNamespace: `api:${baseUrl}`,
      layerUrl: (layer) => {
        const layerQuery = new URLSearchParams(query);
        if (layer === "wind") layerQuery.set("layout", "planar");
        return `${baseUrl}/enso/layers/${layer}?${layerQuery}`;
      },
      windLayout: "planar",
    };
  }
  if (dataset.source === "packed" && dataset.packedBaseUrl) {
    const baseUrl = dataset.packedBaseUrl;
    return {
      cacheNamespace: `static:${baseUrl}`,
      layerUrl: (layer, fileName) => `${baseUrl}/${layer}/${fileName}`,
      windLayout: dataset.packedWindLayout ?? "interleaved",
    };
  }
  return null;
}

export async function loadSimulationScalarFrame(
  dataset: SimulationDataset,
  inputs: ExperimentInputs,
  selectedVariable: DisplayVariableKey,
  signal?: AbortSignal,
): Promise<SimulationFrame> {
  if (dataset.source === "preview") {
    const frame = createPreviewFrame(inputs);
    frame.fields.u10m = new Float32Array(0);
    frame.fields.v10m = new Float32Array(0);
    return frame;
  }
  const source = sourceRequest(dataset, inputs);
  if (!source) throw new Error("지원하지 않는 데이터 소스입니다.");
  return fetchPackedScalarFrame(
    source.cacheNamespace,
    source.layerUrl,
    dataset.metadata,
    inputs,
    selectedVariable,
    false,
    signal,
  );
}

export async function loadSimulationSst(
  dataset: SimulationDataset,
  inputs: ExperimentInputs,
  signal?: AbortSignal,
): Promise<Float32Array> {
  if (dataset.source === "preview") return createPreviewFrame(inputs).fields.sst;
  const source = sourceRequest(dataset, inputs);
  if (!source) throw new Error("지원하지 않는 데이터 소스입니다.");
  const fileName = buildF32FileName(inputs);
  const fieldSize = dataset.metadata.grid.lat.count * dataset.metadata.grid.lon.count;
  return fetchPackedScalar(
    source.cacheNamespace,
    source.layerUrl("sst", fileName),
    "sst",
    fieldSize,
    signal,
  );
}

export async function loadSimulationWind(
  dataset: SimulationDataset,
  inputs: ExperimentInputs,
  signal?: AbortSignal,
): Promise<{ u10m: Float32Array; v10m: Float32Array }> {
  if (dataset.source === "preview") {
    const frame = createPreviewFrame(inputs);
    return { u10m: frame.fields.u10m, v10m: frame.fields.v10m };
  }
  const source = sourceRequest(dataset, inputs);
  if (!source) throw new Error("지원하지 않는 데이터 소스입니다.");
  const fileName = buildF32FileName(inputs);
  const fieldSize = dataset.metadata.grid.lat.count * dataset.metadata.grid.lon.count;
  return fetchPackedWind(
    source.cacheNamespace,
    source.layerUrl("wind", fileName),
    fieldSize,
    source.windLayout,
    signal,
  );
}
