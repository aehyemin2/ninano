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
  const visited = new Uint8Array(Math.ceil(packed.length / 8));
  const wasVisited = (index: number) => (visited[index >> 3] & (1 << (index & 7))) !== 0;
  const markVisited = (index: number) => { visited[index >> 3] |= 1 << (index & 7); };
  const destination = (index: number) => index % 2 === 0
    ? index / 2
    : fieldSize + (index - 1) / 2;

  // Convert [u0, v0, u1, v1, ...] to [u0, u1, ..., v0, v1, ...] in the
  // response buffer itself. The bitset costs ~0.25 MiB for the 0.25° grid,
  // instead of allocating another full 8 MiB pair of component arrays.
  for (let start = 0; start < packed.length; start += 1) {
    if (wasVisited(start)) continue;
    let current = start;
    let carried = packed[current];
    do {
      markVisited(current);
      const next = destination(current);
      const displaced = packed[next];
      packed[next] = carried;
      carried = displaced;
      current = next;
    } while (current !== start);
  }

  return {
    u10m: packed.subarray(0, fieldSize),
    v10m: packed.subarray(fieldSize),
  };
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
