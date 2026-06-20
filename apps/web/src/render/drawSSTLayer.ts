import type {
  DisplayVariableKey,
  FieldValues,
  FlatMapView,
  GridDefinition,
  SimulationFrame,
  VariableDefinition,
} from "../types/simulation";

// A world map is 360 x 180 degrees. Keeping this 2:1 geographic span at every
// zoom level prevents the projection from changing shape while zooming.
const BASE_LONGITUDE_SPAN = 120;
const BASE_LATITUDE_SPAN = 60;
export const MIN_FLAT_ZOOM = 1 / 3;
export const MAX_FLAT_ZOOM = 12;
export const DEFAULT_FLAT_VIEW: FlatMapView = { centerLon: 205, centerLat: 0, zoom: 1 };

export function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function longitudeDelta(longitude: number, center: number): number {
  return ((normalizeLongitude(longitude) - normalizeLongitude(center) + 540) % 360) - 180;
}

export function flatViewSpans(view: FlatMapView): { lonSpan: number; latSpan: number } {
  return {
    lonSpan: BASE_LONGITUDE_SPAN / view.zoom,
    latSpan: BASE_LATITUDE_SPAN / view.zoom,
  };
}

export function clampFlatView(view: FlatMapView): FlatMapView {
  const zoom = Math.max(MIN_FLAT_ZOOM, Math.min(MAX_FLAT_ZOOM, view.zoom));
  const { latSpan } = flatViewSpans({ ...view, zoom });
  const maxCenterLatitude = Math.max(0, 90 - latSpan / 2);
  return {
    centerLon: normalizeLongitude(view.centerLon),
    centerLat: Math.max(-maxCenterLatitude, Math.min(maxCenterLatitude, view.centerLat)),
    zoom,
  };
}

export function screenToFlatCoordinate(
  x: number,
  y: number,
  width: number,
  height: number,
  view: FlatMapView,
): { lat: number; lon: number } {
  const { lonSpan, latSpan } = flatViewSpans(view);
  return {
    lon: normalizeLongitude(view.centerLon + (x / width - 0.5) * lonSpan),
    lat: view.centerLat + (0.5 - y / height) * latSpan,
  };
}

export function projectFlatCoordinate(
  lat: number,
  lon: number,
  width: number,
  height: number,
  view: FlatMapView,
): { x: number; y: number; visible: boolean } {
  const { lonSpan, latSpan } = flatViewSpans(view);
  const deltaLon = longitudeDelta(lon, view.centerLon);
  const deltaLat = lat - view.centerLat;
  return {
    x: (deltaLon / lonSpan + 0.5) * width,
    y: (0.5 - deltaLat / latSpan) * height,
    visible: Math.abs(deltaLon) <= lonSpan / 2 && Math.abs(deltaLat) <= latSpan / 2,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function colorAt(colors: readonly string[], amount: number): string {
  if (!Number.isFinite(amount)) return "rgba(0, 0, 0, 0)";
  const position = Math.min(0.9999, Math.max(0, amount)) * (colors.length - 1);
  const index = Math.floor(position);
  const local = position - index;
  const from = hexToRgb(colors[index]);
  const to = hexToRgb(colors[Math.min(colors.length - 1, index + 1)]);
  const channel = (i: number) => Math.round(from[i] + (to[i] - from[i]) * local);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

function regularGridIndex(values: number[], target: number): number {
  if (values.length < 2) return 0;
  const step = values[1] - values[0];
  if (!Number.isFinite(step) || step === 0) return 0;
  return Math.max(0, Math.min(values.length - 1, Math.round((target - values[0]) / step)));
}

export function sampleField(values: FieldValues, grid: GridDefinition, lat: number, lon: number): number {
  const normalizedLon = grid.lon[0] < 0
    ? ((lon + 540) % 360) - 180
    : normalizeLongitude(lon);
  const row = regularGridIndex(grid.lat, Math.max(-90, Math.min(90, lat)));
  const column = regularGridIndex(grid.lon, normalizedLon);
  return values[row * grid.lon.length + column];
}

export function getDisplayField(frame: SimulationFrame, variable: DisplayVariableKey): FieldValues {
  return frame.fields[variable];
}

export function drawFieldLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: GridDefinition,
  frame: SimulationFrame,
  definition: VariableDefinition,
  view: FlatMapView,
): void {
  const values = getDisplayField(frame, definition.key);
  const [min, max] = definition.displayRange;
  const block = 3;

  context.save();
  context.globalAlpha = 0.94;
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      const coordinate = screenToFlatCoordinate(x, y, width, height, view);
      const value = sampleField(values, grid, coordinate.lat, coordinate.lon);
      if (!Number.isFinite(value)) continue;
      context.fillStyle = colorAt(definition.colors, (value - min) / (max - min));
      context.fillRect(x, y, block + 0.5, block + 0.5);
    }
  }
  context.restore();
}
