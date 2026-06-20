import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { loadLandBoundaries } from "../data/loadGeoJson";
import { formatLegendTick } from "../data/variableCatalog";
import { drawGlobe, screenToGlobe, type GlobeRotation } from "../render/drawGlobe";
import { drawLandBoundaryLayer } from "../render/drawLandBoundaries";
import { drawMapOverlay } from "../render/drawMap";
import {
  clampFlatView,
  DEFAULT_FLAT_VIEW,
  drawFieldLayer,
  flatViewSpans,
  getDisplayField,
  MAX_FLAT_ZOOM,
  MIN_FLAT_ZOOM,
  normalizeLongitude,
  sampleField,
  screenToFlatCoordinate,
} from "../render/drawSSTLayer";
import { createWindAnimator, type WindCameraState } from "../render/drawWindParticles";
import { useViewerStore } from "../store/useViewerStore";
import type {
  DisplayVariableKey,
  FlatMapView,
  GridDefinition,
  MapSample,
  SimulationFrame,
  VariableCatalog,
  VariableDefinition,
  ViewMode,
} from "../types/simulation";

interface PacificMapCanvasProps {
  frame: SimulationFrame;
  grid: GridDefinition;
  showWind: boolean;
  variable: DisplayVariableKey;
  variables: VariableCatalog;
}

const DEFAULT_ROTATION: GlobeRotation = { lon: 205, lat: 0 };
const MIN_GLOBE_ZOOM = 0.68;
const MAX_GLOBE_ZOOM = 5;

function drawBase(
  canvas: HTMLCanvasElement,
  grid: GridDefinition,
  frame: SimulationFrame,
  definition: VariableDefinition,
  viewMode: ViewMode,
  rotation: GlobeRotation,
  globeZoom: number,
  flatView: FlatMapView,
): void {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
  canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  if (viewMode === "globe") {
    drawGlobe(context, bounds.width, bounds.height, grid, frame, definition, rotation, globeZoom);
  } else {
    drawFieldLayer(context, bounds.width, bounds.height, grid, frame, definition, flatView);
    drawMapOverlay(context, bounds.width, bounds.height, flatView);
  }
}

export function PacificMapCanvas({ frame, grid, showWind, variable, variables }: PacificMapCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const windRef = useRef<HTMLCanvasElement>(null);
  const boundaryRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [rotation, setRotation] = useState<GlobeRotation>(DEFAULT_ROTATION);
  const [globeZoom, setGlobeZoom] = useState(1);
  const [flatView, setFlatView] = useState<FlatMapView>(DEFAULT_FLAT_VIEW);
  const [sample, setSample] = useState<MapSample | null>(null);
  const { viewMode, setViewMode } = useViewerStore();
  const viewModeRef = useRef(viewMode);
  const definition = variables[variable];
  const values = useMemo(() => getDisplayField(frame, variable), [frame, variable]);
  const cameraRef = useRef<WindCameraState>({ rotation, globeZoom, flatView });
  cameraRef.current = { rotation, globeZoom, flatView };
  viewModeRef.current = viewMode;

  useEffect(() => {
    const canvas = baseRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const redraw = () => drawBase(canvas, grid, frame, definition, viewMode, rotation, globeZoom, flatView);
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [definition, flatView, frame, globeZoom, grid, rotation, viewMode]);

  useEffect(() => {
    const canvas = windRef.current;
    if (!canvas || !showWind) return;
    return createWindAnimator(canvas, grid, frame, viewMode, () => cameraRef.current);
  }, [frame, grid, showWind, viewMode]);

  useEffect(() => {
    const canvas = boundaryRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const boundaries = loadLandBoundaries();
    const redraw = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawLandBoundaryLayer(context, bounds.width, bounds.height, boundaries, viewMode, rotation, flatView, globeZoom);
    };
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [flatView, globeZoom, rotation, viewMode]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      if (viewModeRef.current === "globe") {
        setGlobeZoom((current) => Math.max(MIN_GLOBE_ZOOM, Math.min(MAX_GLOBE_ZOOM, current * factor)));
        return;
      }
      const bounds = wrapper.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      setFlatView((current) => {
        const anchor = screenToFlatCoordinate(x, y, bounds.width, bounds.height, current);
        const zoom = Math.max(MIN_FLAT_ZOOM, Math.min(MAX_FLAT_ZOOM, current.zoom * factor));
        const next = { ...current, zoom };
        const { lonSpan, latSpan } = flatViewSpans(next);
        return clampFlatView({
          zoom,
          centerLon: anchor.lon - (x / bounds.width - 0.5) * lonSpan,
          centerLat: anchor.lat + (y / bounds.height - 0.5) * latSpan,
        });
      });
    };
    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", handleWheel);
  }, []);

  function coordinateAt(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (viewMode === "globe") return screenToGlobe(x, y, bounds.width, bounds.height, rotation, globeZoom);
    return screenToFlatCoordinate(x, y, bounds.width, bounds.height, flatView);
  }

  function inspect(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      const previous = dragRef.current;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      dragRef.current = { x: event.clientX, y: event.clientY };
      if (viewMode === "globe") {
        setRotation((current) => ({
          lon: normalizeLongitude(current.lon - (dx * 0.42) / globeZoom),
          lat: Math.max(-85, Math.min(85, current.lat + (dy * 0.34) / globeZoom)),
        }));
      } else {
        const bounds = event.currentTarget.getBoundingClientRect();
        setFlatView((current) => {
          const { lonSpan, latSpan } = flatViewSpans(current);
          return clampFlatView({
            ...current,
            centerLon: current.centerLon - (dx / bounds.width) * lonSpan,
            centerLat: current.centerLat + (dy / bounds.height) * latSpan,
          });
        });
      }
      setSample(null);
      return;
    }
    const coordinate = coordinateAt(event);
    if (!coordinate) {
      setSample(null);
      return;
    }
    setSample({
      ...coordinate,
      value: sampleField(values, grid, coordinate.lat, coordinate.lon),
      u: sampleField(frame.fields.u10m, grid, coordinate.lat, coordinate.lon),
      v: sampleField(frame.fields.v10m, grid, coordinate.lat, coordinate.lon),
    });
  }

  function resetView() {
    setFlatView(DEFAULT_FLAT_VIEW);
    setRotation(DEFAULT_ROTATION);
    setGlobeZoom(1);
    setSample(null);
  }

  const zoomPercent = Math.round((viewMode === "flat" ? flatView.zoom : globeZoom) * 100);

  return (
    <section className="map-panel panel">
      <div className="map-heading">
        <div><span className="eyebrow">{viewMode === "flat" ? "Draggable global field" : "Interactive orthographic globe"}</span><h1>{definition.label}</h1></div>
        <div className="map-heading-actions">
          <div aria-label="지도 보기 방식" className="view-toggle" role="group">
            <button className={viewMode === "flat" ? "is-active" : ""} onClick={() => setViewMode("flat")} type="button">평면도</button>
            <button className={viewMode === "globe" ? "is-active" : ""} onClick={() => setViewMode("globe")} type="button">3D 지구</button>
          </div>
        </div>
      </div>
      <div
        className={`map-stage ${viewMode === "globe" ? "globe-stage" : ""}`}
        onDoubleClick={resetView}
        onPointerCancel={() => { dragRef.current = null; }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerLeave={() => { if (!dragRef.current) setSample(null); }}
        onPointerMove={inspect}
        onPointerUp={(event) => {
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        ref={wrapperRef}
      >
        <canvas aria-label={`${definition.label} climate map`} ref={baseRef} />
        {showWind && <canvas className="wind-canvas" ref={windRef} />}
        <canvas aria-hidden="true" className="boundary-canvas" ref={boundaryRef} />
        <span className="drag-hint">드래그 {viewMode === "flat" ? "이동" : "회전"} · 휠 확대/축소 · {zoomPercent}% · 더블클릭 초기화</span>
        {sample && (
          <div className="map-tooltip">
            <small>{Math.abs(sample.lat).toFixed(1)}°{sample.lat >= 0 ? "N" : "S"} · {sample.lon.toFixed(1)}°E</small>
            <strong>{definition.format(sample.value)}</strong>
            <span>wind {Math.hypot(sample.u, sample.v).toFixed(1)} m/s</span>
          </div>
        )}
      </div>
      <div className="map-footer">
        <div className="color-legend">
          <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${definition.colors.join(",")})` }} />
          <div className="legend-ticks">{definition.ticks.map((tick) => <span key={tick}>{formatLegendTick(definition, tick)}</span>)}</div>
        </div>
      </div>
    </section>
  );
}
