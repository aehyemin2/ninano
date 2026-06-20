import type { LandBoundaries } from "../data/loadGeoJson";
import { globeGeometry, globeToScreen, type GlobeRotation } from "./drawGlobe";
import { drawMapOverlay } from "./drawMap";
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

export interface ImpactLabel {
  lat: number;
  lon: number;
  text: string;
  tone: "rain" | "dry" | "calm";
}

function impactToneColor(tone: ImpactLabel["tone"]): string {
  if (tone === "rain") return "rgba(33, 92, 145, 0.92)";
  if (tone === "dry") return "rgba(176, 78, 45, 0.92)";
  return "rgba(78, 98, 108, 0.88)";
}

// 엘니뇨/라니냐로 특정 경향이 나타나는 지역을 지도 위에 텍스트(알약 모양)로 표시한다.
export function drawImpactLabels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewMode: ViewMode,
  rotation: GlobeRotation,
  flatView: FlatMapView,
  globeZoom: number,
  labels: ImpactLabel[],
): void {
  if (!labels.length) return;
  context.save();
  context.font = "600 12px system-ui, -apple-system, 'Pretendard', sans-serif";
  context.textBaseline = "middle";
  context.textAlign = "left";
  const padX = 8;
  const barHeight = 21;
  for (const label of labels) {
    const point = viewMode === "globe"
      ? globeToScreen(label.lat, label.lon, width, height, rotation, globeZoom)
      : projectFlatCoordinate(label.lat, label.lon, width, height, flatView);
    if (!point.visible) continue;
    const textWidth = context.measureText(label.text).width;
    const boxWidth = textWidth + padX * 2;
    const x = Math.max(3, Math.min(width - boxWidth - 3, point.x - boxWidth / 2));
    const y = Math.max(3, Math.min(height - barHeight - 3, point.y - barHeight / 2));

    context.beginPath();
    if (typeof context.roundRect === "function") context.roundRect(x, y, boxWidth, barHeight, 6);
    else context.rect(x, y, boxWidth, barHeight);
    context.fillStyle = impactToneColor(label.tone);
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.35)";
    context.lineWidth = 0.8;
    context.stroke();

    context.fillStyle = "#f6fbff";
    context.fillText(label.text, x + padX, y + barHeight / 2 + 0.5);
  }
  context.restore();
}

// 동/서 태평양 위치를 지도에 살짝 표시(상태와 무관하게 항상).
const REGION_NAMES: { lat: number; lon: number; text: string }[] = [
  { lat: 22, lon: 158, text: "서태평양" },
  { lat: 22, lon: 250, text: "동태평양" },
];

export function drawRegionNames(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewMode: ViewMode,
  rotation: GlobeRotation,
  flatView: FlatMapView,
  globeZoom: number,
): void {
  context.save();
  context.font = "600 13px system-ui, -apple-system, 'Pretendard', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  for (const region of REGION_NAMES) {
    const point = viewMode === "globe"
      ? globeToScreen(region.lat, region.lon, width, height, rotation, globeZoom)
      : projectFlatCoordinate(region.lat, region.lon, width, height, flatView);
    if (!point.visible) continue;
    // 어두운 외곽선 + 밝은 글자라 어떤 배경에서도 읽힌다.
    context.strokeStyle = "rgba(0, 0, 0, 0.55)";
    context.lineWidth = 3;
    context.strokeText(region.text, point.x, point.y);
    context.fillStyle = "rgba(238, 248, 242, 0.82)";
    context.fillText(region.text, point.x, point.y);
  }
  context.restore();
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
  else {
    drawMapOverlay(context, width, height, flatView);
    drawFlatBoundaries(context, width, height, boundaries, flatView);
  }
}
