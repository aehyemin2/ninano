import { colorAt, getDisplayField, sampleField } from "./drawSSTLayer";
import type { GridDefinition, SimulationFrame, VariableDefinition } from "../types/simulation";

export interface GlobeRotation {
  lon: number;
  lat: number;
}

export interface GlobePoint {
  lat: number;
  lon: number;
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (value: number) => (value * 180) / Math.PI;

export function globeGeometry(width: number, height: number, zoom = 1) {
  return { cx: width / 2, cy: height / 2, radius: Math.min(width, height) * 0.435 * zoom };
}

export function screenToGlobe(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: GlobeRotation,
  zoom = 1,
): GlobePoint | null {
  const { cx, cy, radius } = globeGeometry(width, height, zoom);
  const sx = (x - cx) / radius;
  const sy = (cy - y) / radius;
  const rho = Math.hypot(sx, sy);
  if (rho > 1) return null;
  if (rho < 0.000001) return { lat: rotation.lat, lon: ((rotation.lon % 360) + 360) % 360 };

  const c = Math.asin(rho);
  const lat0 = radians(rotation.lat);
  const lon0 = radians(rotation.lon);
  const lat = Math.asin(
    Math.cos(c) * Math.sin(lat0) + (sy * Math.sin(c) * Math.cos(lat0)) / rho,
  );
  const lon = lon0 + Math.atan2(
    sx * Math.sin(c),
    rho * Math.cos(lat0) * Math.cos(c) - sy * Math.sin(lat0) * Math.sin(c),
  );
  return { lat: degrees(lat), lon: ((degrees(lon) % 360) + 360) % 360 };
}

export function globeToScreen(
  lat: number,
  lon: number,
  width: number,
  height: number,
  rotation: GlobeRotation,
  zoom = 1,
): { x: number; y: number; visible: boolean } {
  const { cx, cy, radius } = globeGeometry(width, height, zoom);
  const phi = radians(lat);
  const phi0 = radians(rotation.lat);
  const lambda = radians(lon);
  const lambda0 = radians(rotation.lon);
  const delta = lambda - lambda0;
  const visibility = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(delta);
  return {
    x: cx + radius * Math.cos(phi) * Math.sin(delta),
    y: cy - radius * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(delta)),
    visible: visibility >= 0,
  };
}

function drawGraticule(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  rotation: GlobeRotation,
  zoom: number,
): void {
  context.save();
  context.strokeStyle = "rgba(231, 247, 239, 0.13)";
  context.lineWidth = 0.8;
  const lines: GlobePoint[][] = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    lines.push(Array.from({ length: 181 }, (_, i) => ({ lat, lon: i * 2 })));
  }
  for (let lon = 0; lon < 360; lon += 30) {
    lines.push(Array.from({ length: 121 }, (_, i) => ({ lat: -90 + i * 1.5, lon })));
  }
  for (const line of lines) {
    let drawing = false;
    context.beginPath();
    for (const point of line) {
      const projected = globeToScreen(point.lat, point.lon, width, height, rotation, zoom);
      if (!projected.visible) {
        drawing = false;
        continue;
      }
      if (!drawing) context.moveTo(projected.x, projected.y);
      else context.lineTo(projected.x, projected.y);
      drawing = true;
    }
    context.stroke();
  }
  context.restore();
}

export function drawGlobe(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: GridDefinition,
  frame: SimulationFrame,
  definition: VariableDefinition,
  rotation: GlobeRotation,
  zoom: number,
): void {
  const values = getDisplayField(frame, definition.key);
  const [min, max] = definition.displayRange;
  const { cx, cy, radius } = globeGeometry(width, height, zoom);
  const block = 3;

  context.clearRect(0, 0, width, height);
  const glow = context.createRadialGradient(cx, cy, radius * 0.72, cx, cy, radius * 1.25);
  glow.addColorStop(0, "rgba(64, 148, 153, 0.03)");
  glow.addColorStop(0.72, "rgba(48, 136, 146, 0.13)");
  glow.addColorStop(1, "rgba(3, 12, 18, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  for (let y = Math.max(0, cy - radius); y <= Math.min(height, cy + radius); y += block) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width, cx + radius); x += block) {
      const coordinate = screenToGlobe(x + block / 2, y + block / 2, width, height, rotation, zoom);
      if (!coordinate) continue;
      const value = sampleField(values, grid, coordinate.lat, coordinate.lon);
      if (!Number.isFinite(value)) continue;
      context.fillStyle = colorAt(definition.colors, (value - min) / (max - min));
      context.fillRect(x, y, block + 0.5, block + 0.5);
    }
  }

  drawGraticule(context, width, height, rotation, zoom);
  const shade = context.createRadialGradient(
    cx - radius * 0.28,
    cy - radius * 0.24,
    radius * 0.08,
    cx,
    cy,
    radius,
  );
  shade.addColorStop(0, "rgba(255,255,255,0.10)");
  shade.addColorStop(0.66, "rgba(4,14,20,0.02)");
  shade.addColorStop(1, "rgba(0,5,10,0.48)");
  context.fillStyle = shade;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(219, 244, 235, 0.5)";
  context.lineWidth = 1.25;
  context.stroke();
}
