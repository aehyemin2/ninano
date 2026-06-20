import { VARIABLE_CATALOG } from "../data/variableCatalog";
import type {
  DisplayVariableKey,
  GridDefinition,
  SimulationFrame,
} from "../types/simulation";

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function colorAt(colors: readonly string[], amount: number): string {
  const position = Math.min(0.9999, Math.max(0, amount)) * (colors.length - 1);
  const index = Math.floor(position);
  const local = position - index;
  const from = hexToRgb(colors[index]);
  const to = hexToRgb(colors[Math.min(colors.length - 1, index + 1)]);
  const channel = (i: number) => Math.round(from[i] + (to[i] - from[i]) * local);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

export function getDisplayField(
  frame: SimulationFrame,
  variable: DisplayVariableKey,
): number[] {
  if (variable !== "wind") return frame.fields[variable];
  return frame.fields.u10m.map((u, index) => Math.hypot(u, frame.fields.v10m[index]));
}

export function drawFieldLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: GridDefinition,
  frame: SimulationFrame,
  variable: DisplayVariableKey,
): void {
  const definition = VARIABLE_CATALOG[variable];
  const values = getDisplayField(frame, variable);
  const columns = grid.lon.length;
  const rows = grid.lat.length;
  const cellWidth = width / columns + 0.6;
  const cellHeight = height / rows + 0.6;
  const [min, max] = definition.rawRange;

  context.save();
  context.globalAlpha = 0.92;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = values[row * columns + column];
      context.fillStyle = colorAt(definition.colors, (value - min) / (max - min));
      context.fillRect(column * (width / columns), row * (height / rows), cellWidth, cellHeight);
    }
  }
  context.restore();
}
