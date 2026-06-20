import { globeToScreen, type GlobeRotation } from "./drawGlobe";
import { flatViewSpans, normalizeLongitude, projectFlatCoordinate, sampleField } from "./drawSSTLayer";
import type { FlatMapView, GridDefinition, SimulationFrame, ViewMode } from "../types/simulation";

interface Particle { lat: number; lon: number; age: number; }

export interface WindCameraState {
  rotation: GlobeRotation;
  globeZoom: number;
  flatView: FlatMapView;
}

function reset(particle: Particle, viewMode: ViewMode, camera: WindCameraState): void {
  if (viewMode === "flat") {
    const { lonSpan, latSpan } = flatViewSpans(camera.flatView);
    particle.lon = normalizeLongitude(camera.flatView.centerLon + (Math.random() - 0.5) * lonSpan);
    particle.lat = camera.flatView.centerLat + (Math.random() - 0.5) * latSpan;
  } else {
    particle.lon = Math.random() * 360;
    particle.lat = -82 + Math.random() * 164;
  }
  particle.age = 55 + Math.random() * 130;
}

export function createWindAnimator(
  canvas: HTMLCanvasElement,
  grid: GridDefinition,
  frame: SimulationFrame,
  viewMode: ViewMode,
  getCamera: () => WindCameraState,
): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => undefined;
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * ratio));
  canvas.height = Math.max(1, Math.floor(height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const count = Math.max(360, Math.floor((width * height) / (viewMode === "flat" ? 750 : 900)));
  const particles = Array.from({ length: count }, () => ({ lat: 0, lon: 0, age: 0 }));
  particles.forEach((particle) => reset(particle, viewMode, getCamera()));

  let animationFrame = 0;
  const draw = () => {
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "rgba(0, 0, 0, 0.15)";
    context.fillRect(0, 0, width, height);
    context.restore();
    context.save();
    context.globalCompositeOperation = "lighter";
    context.lineCap = "round";

    for (const particle of particles) {
      const camera = getCamera();
      const u = sampleField(frame.fields.u10m, grid, particle.lat, particle.lon) || 0;
      const v = sampleField(frame.fields.v10m, grid, particle.lat, particle.lon) || 0;
      const oldLat = particle.lat;
      const oldLon = particle.lon;
      const zoom = viewMode === "flat" ? camera.flatView.zoom : camera.globeZoom;
      const timeStep = 0.055 / Math.max(1, zoom * 0.65);
      const cosLat = Math.max(0.25, Math.cos((particle.lat * Math.PI) / 180));
      particle.lon = normalizeLongitude(particle.lon + (u * timeStep) / cosLat);
      particle.lat = Math.max(-88, Math.min(88, particle.lat + v * timeStep));
      particle.age -= 1;

      const previous = viewMode === "flat"
        ? projectFlatCoordinate(oldLat, oldLon, width, height, camera.flatView)
        : globeToScreen(oldLat, oldLon, width, height, camera.rotation, camera.globeZoom);
      const next = viewMode === "flat"
        ? projectFlatCoordinate(particle.lat, particle.lon, width, height, camera.flatView)
        : globeToScreen(particle.lat, particle.lon, width, height, camera.rotation, camera.globeZoom);
      if (previous.visible && next.visible && Math.hypot(next.x - previous.x, next.y - previous.y) < 24) {
        const speed = Math.hypot(u, v);
        context.strokeStyle = `rgba(242, 255, 248, ${Math.min(0.82, 0.3 + speed * 0.035)})`;
        context.lineWidth = Math.min(1.8, 0.75 + speed * 0.045);
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(next.x, next.y);
        context.stroke();
      }

      if (particle.age <= 0 || Math.abs(particle.lat) >= 88 || (viewMode === "flat" && !next.visible)) {
        reset(particle, viewMode, camera);
      }
    }
    context.restore();
    animationFrame = requestAnimationFrame(draw);
  };
  draw();
  return () => cancelAnimationFrame(animationFrame);
}
