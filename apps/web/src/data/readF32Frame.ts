import type {
  EnsoMetadata,
  ExperimentInputs,
  RawVariableKey,
  SimulationFrame,
} from "../types/simulation";

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const nativeLittleEndian = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 4;

export function buildF32FileName(inputs: ExperimentInputs): string {
  return `sst_${inputs.sstAnomaly.toFixed(1)}_wind_${inputs.tradeWindChange.toFixed(0)}.f32`;
}

export function expectedF32ByteLength(metadata: EnsoMetadata): number {
  return metadata.variables.length * metadata.grid.lat.count * metadata.grid.lon.count * FLOAT_BYTES;
}

function readLittleEndianFloat32(buffer: ArrayBuffer): Float32Array {
  if (nativeLittleEndian) return new Float32Array(buffer);
  const view = new DataView(buffer);
  const values = new Float32Array(buffer.byteLength / FLOAT_BYTES);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = view.getFloat32(index * FLOAT_BYTES, true);
  }
  return values;
}

export function readScalarF32(
  buffer: ArrayBuffer,
  fieldSize: number,
  key: RawVariableKey,
): Float32Array {
  const expectedBytes = fieldSize * FLOAT_BYTES;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`${key} f32 파일 크기 오류: ${buffer.byteLength} != ${expectedBytes}`);
  }
  const values = readLittleEndianFloat32(buffer);
  convertRawFieldInPlace(values, 0, values.length, key);
  return values;
}

export function readWindF32(
  buffer: ArrayBuffer,
  fieldSize: number,
): { u10m: Float32Array; v10m: Float32Array } {
  const expectedBytes = fieldSize * 2 * FLOAT_BYTES;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`wind f32 파일 크기 오류: ${buffer.byteLength} != ${expectedBytes}`);
  }
  const packed = readLittleEndianFloat32(buffer);
  const u10m = new Float32Array(fieldSize);
  const v10m = new Float32Array(fieldSize);
  for (let index = 0; index < fieldSize; index += 1) {
    u10m[index] = packed[index * 2];
    v10m[index] = packed[index * 2 + 1];
  }
  return { u10m, v10m };
}

function convertRawFieldInPlace(
  values: Float32Array,
  start: number,
  end: number,
  key: RawVariableKey,
): void {
  for (let index = start; index < end; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) continue;
    if (key === "sst" || key === "t2m") values[index] = value - 273.15;
    else if (key === "msl") values[index] = value / 100;
    else if (key === "tpf") values[index] = Math.max(0, value * 86400);
    else if (key === "tcwv") values[index] = Math.max(0, value);
  }
}

export function readF32Frame(buffer: ArrayBuffer, metadata: EnsoMetadata): SimulationFrame {
  const expectedBytes = expectedF32ByteLength(metadata);
  if (metadata.encoding.byteLength !== expectedBytes) {
    throw new Error(`metadata 격자 크기 오류: ${metadata.encoding.byteLength} != ${expectedBytes}`);
  }
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`f32 파일 크기 오류: ${buffer.byteLength} != ${expectedBytes}`);
  }
  const fieldSize = metadata.grid.lat.count * metadata.grid.lon.count;
  const values = readLittleEndianFloat32(buffer);
  if ((metadata.encoding.values ?? "raw") === "raw") {
    for (const variable of metadata.variables) {
      const start = variable.index * fieldSize;
      convertRawFieldInPlace(values, start, start + fieldSize, variable.key);
    }
  }
  const fields = Object.fromEntries(metadata.variables.map((variable) => {
    const start = variable.index * fieldSize;
    return [variable.key, values.subarray(start, start + fieldSize)] as const;
  })) as Record<RawVariableKey, Float32Array>;
  return { timestamp: metadata.baselineDate, fields };
}
