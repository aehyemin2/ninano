import { flatViewSpans, projectFlatCoordinate } from "./drawSSTLayer";
import type { FlatMapView } from "../types/simulation";

function gridStep(span: number): number {
  if (span >= 300) return 60;
  if (span >= 150) return 30;
  if (span >= 70) return 15;
  if (span >= 30) return 10;
  if (span >= 12) return 5;
  return 1;
}

export function drawMapOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: FlatMapView,
): void {
  const { lonSpan, latSpan } = flatViewSpans(view);
  context.save();
  context.strokeStyle = "rgba(224, 241, 237, 0.14)";
  context.lineWidth = 1;
  context.setLineDash([3, 6]);

  const lonStep = gridStep(lonSpan);
  for (let longitude = 0; longitude < 360; longitude += lonStep) {
    const projected = projectFlatCoordinate(view.centerLat, longitude, width, height, view);
    if (!projected.visible) continue;
    context.beginPath();
    context.moveTo(projected.x, 0);
    context.lineTo(projected.x, height);
    context.stroke();
  }

  const latStep = gridStep(latSpan);
  for (let latitude = -90; latitude <= 90; latitude += latStep) {
    const projected = projectFlatCoordinate(latitude, view.centerLon, width, height, view);
    if (!projected.visible) continue;
    context.beginPath();
    context.moveTo(0, projected.y);
    context.lineTo(width, projected.y);
    context.stroke();
  }

  const equator = projectFlatCoordinate(0, view.centerLon, width, height, view);
  if (equator.visible) {
    // 적도는 검은 점선으로 구분한다.
    context.strokeStyle = "rgba(0, 0, 0, 0.5)";
    context.lineWidth = 1;
    context.setLineDash([7, 6]);
    context.beginPath();
    context.moveTo(0, equator.y);
    context.lineTo(width, equator.y);
    context.stroke();
  }
  context.restore();
}
