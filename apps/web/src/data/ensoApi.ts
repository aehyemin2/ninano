import { createPreviewDataset, createPreviewFrame, PREVIEW_METADATA } from "./demoSimulation";
import {
  buildF32FileName,
  expectedF32ByteLength,
  readF32Frame,
  readScalarF32,
  readWindF32,
} from "./readF32Frame";
import {
  RAW_VARIABLE_KEYS,
  type DisplayVariableKey,
  type EnsoMetadata,
  type ExperimentInputs,
  type GridDefinition,
  type RawVariableKey,
  type SimulationDataset,
  type SimulationFrame,
} from "../types/simulation";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");
const PACKED_BASE_URL = (import.meta.env.VITE_F32_BASE_URL ?? "/public_data/f32_packed").replace(/\/$/, "");
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
  wind: { variables: string[]; component_order: string[]; bytes_per_file: number };
}

const SCALAR_KEYS = new Set<RawVariableKey>(["sst", "t2m", "tpf", "msl", "tcwv"]);

function axisValues(axis: { start: number; step: number; count: number }): number[] {
  return Array.from({ length: axis.count }, (_, index) => axis.start + axis.step * index);
}

function isVariableKey(value: string): value is RawVariableKey {
  return (RAW_VARIABLE_KEYS as readonly string[]).includes(value);
}

function validateMetadata(value: EnsoMetadata): EnsoMetadata {
  if (!value || value.encoding?.dtype !== "float32" || value.encoding.byteOrder !== "little-endian") {
    throw new Error("지원하지 않는 ENSO binary encoding입니다.");
  }
  if (value.encoding.layout !== "variable_lat_lon") throw new Error("지원하지 않는 frame layout입니다.");
  if (!value.datasetVersion || !value.baselineDate.endsWith("Z")) throw new Error("datasetVersion 또는 UTC baselineDate가 없습니다.");
  if (value.variables.length !== RAW_VARIABLE_KEYS.length) throw new Error("metadata는 정확히 7개 변수를 제공해야 합니다.");
  const keys = new Set<string>();
  const indices = new Set<number>();
  for (const variable of value.variables) {
    if (!isVariableKey(variable.key)) throw new Error(`지원하지 않는 변수: ${variable.key}`);
    if (!Number.isInteger(variable.index) || variable.index < 0 || variable.index >= RAW_VARIABLE_KEYS.length) {
      throw new Error(`${variable.key}: 잘못된 buffer index`);
    }
    keys.add(variable.key);
    indices.add(variable.index);
  }
  if (keys.size !== 7 || indices.size !== 7) throw new Error("변수 key/index가 중복되거나 누락됐습니다.");
  const expectedBytes = expectedF32ByteLength(value);
  if (value.encoding.byteLength !== expectedBytes) throw new Error(`metadata byteLength 불일치: ${value.encoding.byteLength} != ${expectedBytes}`);
  return value;
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
  return value;
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
  baseUrl: string,
  key: RawVariableKey,
  fileName: string,
  fieldSize: number,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const cacheKey = `${baseUrl}:${key}:${fileName}`;
  const cached = getCached<Float32Array>(cacheKey);
  if (cached) return cached;
  const values = readScalarF32(await fetchBuffer(`${baseUrl}/${key}/${fileName}`, signal), fieldSize, key);
  return cacheValue(cacheKey, values, values.byteLength);
}

async function fetchPackedWind(
  baseUrl: string,
  fileName: string,
  fieldSize: number,
  signal?: AbortSignal,
): Promise<{ u10m: Float32Array; v10m: Float32Array }> {
  const cacheKey = `${baseUrl}:wind:${fileName}`;
  const cached = getCached<{ u10m: Float32Array; v10m: Float32Array }>(cacheKey);
  if (cached) return cached;
  const wind = readWindF32(await fetchBuffer(`${baseUrl}/wind/${fileName}`, signal), fieldSize);
  return cacheValue(cacheKey, wind, wind.u10m.buffer.byteLength);
}

async function fetchPackedFrame(
  baseUrl: string,
  metadata: EnsoMetadata,
  inputs: ExperimentInputs,
  selectedVariable: DisplayVariableKey,
  signal?: AbortSignal,
): Promise<SimulationFrame> {
  const fileName = buildF32FileName(inputs);
  const fieldSize = metadata.grid.lat.count * metadata.grid.lon.count;
  const scalarKeys = new Set<RawVariableKey>(["sst"]);
  if (SCALAR_KEYS.has(selectedVariable)) scalarKeys.add(selectedVariable);
  const [scalarEntries, wind] = await Promise.all([
    Promise.all(Array.from(scalarKeys, async (key) => [
      key,
      await fetchPackedScalar(baseUrl, key, fileName, fieldSize, signal),
    ] as const)),
    fetchPackedWind(baseUrl, fileName, fieldSize, signal),
  ]);
  const empty = new Float32Array(0);
  const fields = Object.fromEntries(RAW_VARIABLE_KEYS.map((key) => [key, empty])) as Record<RawVariableKey, Float32Array>;
  for (const [key, values] of scalarEntries) fields[key] = values;
  fields.u10m = wind.u10m;
  fields.v10m = wind.v10m;
  return { timestamp: metadata.baselineDate, fields };
}

async function fetchPackedDataset(selectedVariable: DisplayVariableKey, signal?: AbortSignal): Promise<SimulationDataset> {
  const response = await fetch(`${PACKED_BASE_URL}/manifest.json`, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`packed manifest 요청 실패 (${response.status})`);
  const manifest = validatePackedManifest(await response.json() as PackedManifest);
  const metadata = metadataFromManifest(manifest);
  const grid = { lat: axisValues(metadata.grid.lat), lon: axisValues(metadata.grid.lon) };
  const baselineFrame = await fetchPackedFrame(
    PACKED_BASE_URL,
    metadata,
    { sstAnomaly: 0, tradeWindChange: 0 },
    selectedVariable,
    signal,
  );
  return { source: "packed", sourceLabel: `${metadata.datasetVersion} · variable-packed f32`, metadata, grid, baselineFrame, packedBaseUrl: PACKED_BASE_URL };
}

async function fetchMetadata(signal?: AbortSignal): Promise<EnsoMetadata> {
  const response = await fetch(`${API_BASE_URL}/enso/metadata`, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`metadata 요청 실패 (${response.status})`);
  return validateMetadata(await response.json() as EnsoMetadata);
}

async function fetchApiFrame(metadata: EnsoMetadata, inputs: ExperimentInputs, signal?: AbortSignal): Promise<SimulationFrame> {
  const key = `${metadata.datasetVersion}:${inputs.sstAnomaly.toFixed(1)}:${inputs.tradeWindChange.toFixed(0)}`;
  const cached = getCached<SimulationFrame>(key);
  if (cached) return cached;
  const query = new URLSearchParams({ dataset_version: metadata.datasetVersion, sst_anomaly: inputs.sstAnomaly.toFixed(1), wind_delta: inputs.tradeWindChange.toFixed(0) });
  const response = await fetch(`${API_BASE_URL}/enso/frame?${query}`, { signal });
  if (!response.ok) throw new Error(`frame 요청 실패 (${response.status})`);
  const frame = readF32Frame(await response.arrayBuffer(), metadata);
  return cacheValue(key, frame, metadata.encoding.byteLength);
}

export async function loadSimulationDataset(
  selectedVariable: DisplayVariableKey = "t2m",
  signal?: AbortSignal,
): Promise<SimulationDataset> {
  try {
    return await fetchPackedDataset(selectedVariable, signal);
  } catch (packedError) {
    if (packedError instanceof DOMException && packedError.name === "AbortError") throw packedError;
    console.info("Packed f32 unavailable; trying the ENSO API.", packedError);
  }
  try {
    const metadata = await fetchMetadata(signal);
    const grid: GridDefinition = { lat: axisValues(metadata.grid.lat), lon: axisValues(metadata.grid.lon) };
    const baselineFrame = await fetchApiFrame(metadata, { sstAnomaly: 0, tradeWindChange: 0 }, signal);
    return { source: "api", sourceLabel: `${metadata.datasetVersion} · FastAPI binary`, metadata, grid, baselineFrame };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    console.info("ENSO API unavailable; using the UI preview dataset.", error);
    return createPreviewDataset();
  }
}

export async function loadSimulationFrame(
  dataset: SimulationDataset,
  inputs: ExperimentInputs,
  selectedVariable: DisplayVariableKey,
  signal?: AbortSignal,
): Promise<SimulationFrame> {
  if (dataset.source === "preview") return createPreviewFrame(inputs);
  if (dataset.source === "packed" && dataset.packedBaseUrl) {
    return fetchPackedFrame(dataset.packedBaseUrl, dataset.metadata, inputs, selectedVariable, signal);
  }
  return fetchApiFrame(dataset.metadata, inputs, signal);
}
