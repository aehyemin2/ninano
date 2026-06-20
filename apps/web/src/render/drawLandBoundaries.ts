import type { LandBoundaries } from "../data/loadGeoJson";
import { globeGeometry, globeToScreen, type GlobeRotation } from "./drawGlobe";
import { projectFlatCoordinate } from "./drawSSTLayer";
import type { FlatMapView, ViewMode } from "../types/simulation";

function strokeBoundaryPath(context: CanvasRenderingContext2D, path: Path2D): void {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(3, 12, 18, 0.72)";
  context.lineWidth = 2.6;
  context.stroke(path);
  context.strokeStyle = "rgba(241, 249, 246, 0.82)";
  context.lineWidth = 0.85;
  context.stroke(path);
  context.restore();
}

function drawFlatBoundaries(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  boundaries: LandBoundaries,
  view: FlatMapView,
): void {
  const path = new Path2D();
  for (const ring of boundaries.rings) {
    let drawing = false;
    let previousX = 0;
    for (const [longitude, latitude] of ring) {
      const point = projectFlatCoordinate(latitude, longitude, width, height, view);
      if (!point.visible) {
        drawing = false;
        continue;
      }
      if (!drawing || Math.abs(point.x - previousX) > width * 0.4) path.moveTo(point.x, point.y);
      else path.lineTo(point.x, point.y);
      previousX = point.x;
      drawing = true;
    }
  }
  strokeBoundaryPath(context, path);
}

function drawGlobeBoundaries(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  boundaries: LandBoundaries,
  rotation: GlobeRotation,
  zoom: number,
): void {
  const path = new Path2D();
  const { radius } = globeGeometry(width, height, zoom);
  for (const ring of boundaries.rings) {
    let drawing = false;
    let previousX = 0;
    let previousY = 0;
    for (const [longitude, latitude] of ring) {
      const point = globeToScreen(latitude, longitude, width, height, rotation, zoom);
      if (!point.visible) {
        drawing = false;
        continue;
      }
      const jump = Math.hypot(point.x - previousX, point.y - previousY);
      if (!drawing || jump > radius * 0.22) path.moveTo(point.x, point.y);
      else path.lineTo(point.x, point.y);
      previousX = point.x;
      previousY = point.y;
      drawing = true;
    }
  }
  strokeBoundaryPath(context, path);
}

export function drawLandBoundaryLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  boundaries: LandBoundaries,
  viewMode: ViewMode,
  rotation: GlobeRotation,
  flatView: FlatMapView,
  globeZoom: number,
): void {
  context.clearRect(0, 0, width, height);
  if (viewMode === "globe") drawGlobeBoundaries(context, width, height, boundaries, rotation, globeZoom);
  else drawFlatBoundaries(context, width, height, boundaries, flatView);
}
