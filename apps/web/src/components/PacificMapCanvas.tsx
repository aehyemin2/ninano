import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { loadLandBoundaries } from "../data/loadGeoJson";
import { formatLegendTick } from "../data/variableCatalog";
import { drawGlobe, drawGlobeChrome, screenToGlobe, type GlobeRotation } from "../render/drawGlobe";
import { drawImpactLabels, drawLandBoundaryLayer, drawRegionNames, type ImpactLabel } from "../render/drawLandBoundaries";
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
import { WebGLFieldRenderer } from "../render/webglFieldRenderer";
import { WebGLWindRenderer } from "../render/webglWindRenderer";
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
  baseline: SimulationFrame;
  grid: GridDefinition;
  showWind: boolean;
  variable: DisplayVariableKey;
  variables: VariableCatalog;
}

// 편차(현재−평년) 보기용 발산형 색: 찬 이상 파랑 → 0 흰색 → 따뜻한 이상 빨강.
const ANOMALY_COLORS = [
  "#08306b", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0",
  "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#67001f",
];

// 엘니뇨/라니냐로 특정 경향이 나타나는 지역 라벨(지도 좌표 기준).
// 기본 태평양 화면(동경 145~265°·위도 ±30°) 안에 들어오도록 양옆에 배치한다.
const IMPACT_REGIONS: Record<"elnino" | "lanina" | "neutral", ImpactLabel[]> = {
  lanina: [
    { lat: -13, lon: 158, text: "호주·동남아 · 폭우·홍수↑", tone: "rain" },
    { lat: 12, lon: 252, text: "미국·남미 · 가뭄↑", tone: "dry" },
  ],
  elnino: [
    { lat: -13, lon: 158, text: "호주·동남아 · 가뭄·산불↑", tone: "dry" },
    { lat: 12, lon: 252, text: "페루·미국 · 폭우·홍수↑", tone: "rain" },
  ],
  neutral: [
    { lat: -13, lon: 158, text: "호주·동남아 · 평년 수준", tone: "calm" },
    { lat: 12, lon: 252, text: "아메리카 · 평년 수준", tone: "calm" },
  ],
};

// 편차 보기 색 범위(±값). 데이터 최댓값으로 자동 설정하면 강수·기압의 극단값
// 때문에 정상 신호가 모두 0(흰색)처럼 묻히므로, 변수별로 적절한 범위를 고정한다.
const ANOMALY_EXTENT: Partial<Record<DisplayVariableKey, number>> = {
  sst: 4, t2m: 4, msl: 8, tpf: 10, tcwv: 6,
};

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
  webglActive: boolean,
): void {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.floor(bounds.width * ratio));
  const pixelHeight = Math.max(1, Math.floor(bounds.height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  // WebGL이 데이터 표면을 그릴 때(webglActive)는 지구본 장식만 얹는다.
  // 평면은 WebGL 필드만으로 충분하므로 그릴 게 없다.
  if (webglActive) {
    if (viewMode === "globe") drawGlobeChrome(context, bounds.width, bounds.height, rotation, globeZoom);
    return;
  }
  if (viewMode === "globe") {
    drawGlobe(context, bounds.width, bounds.height, grid, frame, definition, rotation, globeZoom);
  } else {
    drawFieldLayer(context, bounds.width, bounds.height, grid, frame, definition, flatView);
  }
}

function drawBoundaries(
  canvas: HTMLCanvasElement,
  viewMode: ViewMode,
  rotation: GlobeRotation,
  flatView: FlatMapView,
  globeZoom: number,
  impactLabels: ImpactLabel[],
): void {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.floor(bounds.width * ratio));
  const pixelHeight = Math.max(1, Math.floor(bounds.height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawLandBoundaryLayer(
    context,
    bounds.width,
    bounds.height,
    loadLandBoundaries(),
    viewMode,
    rotation,
    flatView,
    globeZoom,
  );
  drawRegionNames(context, bounds.width, bounds.height, viewMode, rotation, flatView, globeZoom);
  drawImpactLabels(context, bounds.width, bounds.height, viewMode, rotation, flatView, globeZoom, impactLabels);
}

export function PacificMapCanvas({ baseline, frame, grid, showWind, variable, variables }: PacificMapCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flatFieldRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const windWebglRef = useRef<HTMLCanvasElement>(null);
  const windFallbackRef = useRef<HTMLCanvasElement>(null);
  const boundaryRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const fieldRendererRef = useRef<WebGLFieldRenderer | null>(null);
  const windRendererRef = useRef<WebGLWindRenderer | null>(null);
  const [webglEnabled, setWebglEnabled] = useState(true);
  const [windWebglEnabled, setWindWebglEnabled] = useState(true);
  const [rotation, setRotation] = useState<GlobeRotation>(DEFAULT_ROTATION);
  const [globeZoom, setGlobeZoom] = useState(1);
  const [flatView, setFlatView] = useState<FlatMapView>(DEFAULT_FLAT_VIEW);
  const [sample, setSample] = useState<MapSample | null>(null);
  const { viewMode, setViewMode, showAnomaly, setShowAnomaly, appliedInputs } = useViewerStore();
  // 적용된 실험값으로 엘니뇨/라니냐 상태를 판정해 지도에 영향 지역 라벨을 표시.
  const impactRegions = useMemo(() => {
    const index = appliedInputs.sstAnomaly + appliedInputs.tradeWindChange * 0.3;
    const phase = index > 0.4 ? "elnino" : index < -0.4 ? "lanina" : "neutral";
    return IMPACT_REGIONS[phase];
  }, [appliedInputs.sstAnomaly, appliedInputs.tradeWindChange]);
  const viewModeRef = useRef(viewMode);
  const baseField = getDisplayField(baseline, variable);
  const current = getDisplayField(frame, variable);
  const canAnomaly = current.length > 0 && baseField.length === current.length;
  // 편차 보기: 현재−평년을 0 중심 발산형으로 표시(사진 같은 ENSO 신호 강조).
  const { values, definition } = useMemo(() => {
    const base = variables[variable];
    if (!showAnomaly || !canAnomaly) return { values: current, definition: base };
    const anomaly = new Float32Array(current.length);
    let maxAbs = 0;
    for (let i = 0; i < current.length; i += 1) {
      const c = current[i];
      const b = baseField[i];
      if (Number.isFinite(c) && Number.isFinite(b)) {
        const delta = c - b;
        anomaly[i] = delta;
        if (Math.abs(delta) > maxAbs) maxAbs = Math.abs(delta);
      } else {
        anomaly[i] = Number.NaN;
      }
    }
    const ext = ANOMALY_EXTENT[variable] ?? Math.max(1, Math.ceil(maxAbs));
    const ticks = Array.from({ length: 5 }, (_, i) => -ext + (ext * i) / 2);
    // 강수·수증기는 "많음=파랑, 적음=주황"이 직관적이라 색을 뒤집는다.
    const wetVariable = variable === "tpf" || variable === "tcwv";
    const colors = wetVariable ? [...ANOMALY_COLORS].reverse() : ANOMALY_COLORS;
    const definition: VariableDefinition = {
      ...base,
      label: `${base.label} 편차`,
      displayRange: [-ext, ext],
      colors,
      ticks,
      format: (value) => Number.isFinite(value)
        ? `${value > 0 ? "+" : ""}${value.toFixed(1)} ${base.unit}`
        : "데이터 없음",
    };
    return { values: anomaly, definition };
  }, [baseField, canAnomaly, current, showAnomaly, variable, variables]);
  const rotationRef = useRef(rotation);
  const globeZoomRef = useRef(globeZoom);
  const flatViewRef = useRef(flatView);
  const cameraRef = useRef<WindCameraState>({ rotation, globeZoom, flatView });
  const redrawFrameRef = useRef<number | null>(null);
  const redrawLiveRef = useRef<() => void>(() => undefined);
  const showAnomalyRef = useRef(showAnomaly);
  viewModeRef.current = viewMode;
  showAnomalyRef.current = showAnomaly;

  useEffect(() => {
    rotationRef.current = rotation;
    globeZoomRef.current = globeZoom;
    flatViewRef.current = flatView;
    cameraRef.current = { rotation, globeZoom, flatView };
  }, [flatView, globeZoom, rotation]);

  redrawLiveRef.current = () => {
    const mode = viewModeRef.current;
    const liveRotation = rotationRef.current;
    const liveZoom = globeZoomRef.current;
    const liveFlatView = flatViewRef.current;

    if (webglEnabled && fieldRendererRef.current) {
      fieldRendererRef.current.render(values, grid, definition, {
        mode,
        flatView: liveFlatView,
        rotation: liveRotation,
        globeZoom: liveZoom,
      });
      // 지구본은 데이터 위에 장식(대기광·위경선·음영·테두리)을 baseRef에 얹는다.
      if (mode === "globe" && baseRef.current) {
        drawBase(baseRef.current, grid, frame, definition, mode, liveRotation, liveZoom, liveFlatView, true);
      }
    } else if (baseRef.current) {
      drawBase(baseRef.current, grid, frame, definition, mode, liveRotation, liveZoom, liveFlatView, false);
    }
    if (boundaryRef.current) {
      drawBoundaries(boundaryRef.current, mode, liveRotation, liveFlatView, liveZoom, impactRegions);
    }
  };

  function scheduleLiveRedraw(): void {
    if (redrawFrameRef.current !== null) return;
    redrawFrameRef.current = requestAnimationFrame(() => {
      redrawFrameRef.current = null;
      redrawLiveRef.current();
    });
  }

  function updateWindCamera(): void {
    cameraRef.current = {
      rotation: rotationRef.current,
      globeZoom: globeZoomRef.current,
      flatView: flatViewRef.current,
    };
  }

  function commitLiveCamera(): void {
    if (viewModeRef.current === "globe") setRotation(rotationRef.current);
    else setFlatView(flatViewRef.current);
  }

  useEffect(() => () => {
    if (redrawFrameRef.current !== null) cancelAnimationFrame(redrawFrameRef.current);
    fieldRendererRef.current?.dispose();
    fieldRendererRef.current = null;
    windRendererRef.current?.dispose();
    windRendererRef.current = null;
  }, []);

  useEffect(() => {
    const canvas = flatFieldRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper || !webglEnabled) return;

    try {
      const renderer = fieldRendererRef.current ?? new WebGLFieldRenderer(canvas);
      fieldRendererRef.current = renderer;
      const redraw = () => renderer.render(values, grid, definition, { mode: viewMode, flatView, rotation, globeZoom });
      redraw();
      const observer = new ResizeObserver(redraw);
      observer.observe(wrapper);
      return () => observer.disconnect();
    } catch (error) {
      console.warn("WebGL field renderer unavailable; using Canvas 2D.", error);
      fieldRendererRef.current?.dispose();
      fieldRendererRef.current = null;
      setWebglEnabled(false);
    }
  }, [definition, flatView, globeZoom, grid, rotation, values, viewMode, webglEnabled]);

  useEffect(() => {
    const canvas = baseRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    if (viewMode === "flat" && webglEnabled) return;
    const redraw = () => drawBase(canvas, grid, frame, definition, viewMode, rotation, globeZoom, flatView, webglEnabled);
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [definition, flatView, frame, globeZoom, grid, rotation, viewMode, webglEnabled]);

  useEffect(() => {
    const canvas = windWebglRef.current;
    const fieldSize = grid.lat.length * grid.lon.length;
    if (
      !canvas
      || !showWind
      || !windWebglEnabled
      || frame.fields.u10m.length !== fieldSize
      || frame.fields.v10m.length !== fieldSize
    ) return;
    try {
      const renderer = windRendererRef.current ?? new WebGLWindRenderer(canvas);
      windRendererRef.current = renderer;
      renderer.setWind(frame.fields.u10m, frame.fields.v10m, grid);
      renderer.start(() => cameraRef.current, () => viewModeRef.current, () => showAnomalyRef.current);
      return () => renderer.stop();
    } catch (error) {
      console.warn("WebGL wind renderer unavailable; using Canvas 2D.", error);
      windRendererRef.current?.dispose();
      windRendererRef.current = null;
      setWindWebglEnabled(false);
    }
  }, [frame.fields.u10m, frame.fields.v10m, grid, showWind, windWebglEnabled]);

  useEffect(() => {
    const canvas = windFallbackRef.current;
    const fieldSize = grid.lat.length * grid.lon.length;
    if (
      !canvas
      || !showWind
      || windWebglEnabled
      || frame.fields.u10m.length !== fieldSize
      || frame.fields.v10m.length !== fieldSize
    ) return;
    return createWindAnimator(canvas, grid, frame, viewMode, () => cameraRef.current);
  }, [frame, grid, showWind, viewMode, windWebglEnabled]);

  useEffect(() => {
    const canvas = boundaryRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const redraw = () => drawBoundaries(canvas, viewMode, rotation, flatView, globeZoom, impactRegions);
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [flatView, globeZoom, impactRegions, rotation, viewMode]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    // 줌하는 동안에는 바람 애니메이션을 멈춰 둔다(좁아지는 영역으로 입자가
    // 쏟아져 들어가 지저분해 보이는 걸 막는다). 평면은 WebGL 필드라 라이브로
    // 부드럽게 줌하고, 지구본은 CPU 렌더가 무거우니 휠이 멈춘 뒤 한 번만 그린다.
    // 휠이 멈추면 state를 커밋하고 바람을 다시 시작해 새 뷰로 새로 그린다.
    let commitTimer: number | null = null;
    const scheduleCommit = () => {
      if (commitTimer !== null) clearTimeout(commitTimer);
      commitTimer = window.setTimeout(() => {
        commitTimer = null;
        if (viewModeRef.current === "globe") {
          setGlobeZoom(globeZoomRef.current);
          setRotation(rotationRef.current);
        } else {
          setFlatView(flatViewRef.current);
        }
        updateWindCamera();
        redrawLiveRef.current();
        // 기존 입자를 모두 버리고 새 뷰 기준으로 처음부터 다시 그린다.
        windRendererRef.current?.reset();
        windRendererRef.current?.setPaused(false);
      }, 130);
    };
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      if (viewModeRef.current === "globe") {
        globeZoomRef.current = Math.max(MIN_GLOBE_ZOOM, Math.min(MAX_GLOBE_ZOOM, globeZoomRef.current * factor));
      } else {
        const bounds = wrapper.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        const current = flatViewRef.current;
        const anchor = screenToFlatCoordinate(x, y, bounds.width, bounds.height, current);
        const zoom = Math.max(MIN_FLAT_ZOOM, Math.min(MAX_FLAT_ZOOM, current.zoom * factor));
        const next = { ...current, zoom };
        const { lonSpan, latSpan } = flatViewSpans(next);
        flatViewRef.current = clampFlatView({
          zoom,
          centerLon: anchor.lon - (x / bounds.width - 0.5) * lonSpan,
          centerLat: anchor.lat + (y / bounds.height - 0.5) * latSpan,
        });
      }
      windRendererRef.current?.setPaused(true);
      if (viewModeRef.current === "flat") scheduleLiveRedraw();
      scheduleCommit();
    };
    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      wrapper.removeEventListener("wheel", handleWheel);
      if (commitTimer !== null) clearTimeout(commitTimer);
      windRendererRef.current?.setPaused(false);
    };
  }, []);

  function coordinateAt(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (viewMode === "globe") {
      return screenToGlobe(x, y, bounds.width, bounds.height, rotationRef.current, globeZoomRef.current);
    }
    return screenToFlatCoordinate(x, y, bounds.width, bounds.height, flatViewRef.current);
  }

  function inspect(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) {
      const previous = dragRef.current;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      dragRef.current = { x: event.clientX, y: event.clientY };
      if (viewMode === "globe") {
        const current = rotationRef.current;
        const zoom = globeZoomRef.current;
        rotationRef.current = {
          lon: normalizeLongitude(current.lon - (dx * 0.42) / zoom),
          lat: Math.max(-85, Math.min(85, current.lat + (dy * 0.34) / zoom)),
        };
      } else {
        const bounds = event.currentTarget.getBoundingClientRect();
        const current = flatViewRef.current;
        const { lonSpan, latSpan } = flatViewSpans(current);
        flatViewRef.current = clampFlatView({
          ...current,
          centerLon: current.centerLon - (dx / bounds.width) * lonSpan,
          centerLat: current.centerLat + (dy / bounds.height) * latSpan,
        });
      }
      updateWindCamera();
      scheduleLiveRedraw();
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
      u: frame.fields.u10m.length ? sampleField(frame.fields.u10m, grid, coordinate.lat, coordinate.lon) : Number.NaN,
      v: frame.fields.v10m.length ? sampleField(frame.fields.v10m, grid, coordinate.lat, coordinate.lon) : Number.NaN,
    });
  }

  function resetView() {
    flatViewRef.current = DEFAULT_FLAT_VIEW;
    rotationRef.current = DEFAULT_ROTATION;
    globeZoomRef.current = 1;
    updateWindCamera();
    setFlatView(DEFAULT_FLAT_VIEW);
    setRotation(DEFAULT_ROTATION);
    setGlobeZoom(1);
    setSample(null);
  }

  const zoomPercent = Math.round((viewMode === "flat" ? flatView.zoom : globeZoom) * 100);

  return (
    <section className="map-panel panel">
      <div className="map-heading">
        <div><span className="eyebrow">{viewMode === "flat" ? "끌어서 보는 세계 지도" : "돌려보는 입체 지구"}</span><h1>{definition.label}</h1></div>
        <div className="map-heading-actions">
          <button
            className={`anomaly-toggle ${showAnomaly && canAnomaly ? "is-active" : ""}`}
            disabled={!canAnomaly}
            onClick={() => setShowAnomaly(!showAnomaly)}
            title={canAnomaly ? "평년 대비 편차(현재−평년)로 보기" : "이 레이어는 평년 데이터가 없어 편차를 볼 수 없어요"}
            type="button"
          >편차 보기</button>
          <div aria-label="지도 보기 방식" className="view-toggle" role="group">
            <button className={viewMode === "flat" ? "is-active" : ""} onClick={() => setViewMode("flat")} type="button">평면도</button>
            <button className={viewMode === "globe" ? "is-active" : ""} onClick={() => setViewMode("globe")} type="button">3D 지구</button>
          </div>
        </div>
      </div>
      <div
        className={`map-stage ${viewMode === "globe" ? "globe-stage" : ""}`}
        onDoubleClick={resetView}
        onPointerCancel={() => {
          commitLiveCamera();
          dragRef.current = null;
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY };
          setSample(null);
        }}
        onPointerLeave={() => { if (!dragRef.current) setSample(null); }}
        onPointerMove={inspect}
        onPointerUp={(event) => {
          commitLiveCamera();
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        ref={wrapperRef}
      >
        <canvas
          aria-label={`${definition.label} WebGL climate map`}
          className={`field-webgl-canvas ${!webglEnabled ? "is-hidden" : ""}`}
          ref={flatFieldRef}
        />
        <canvas
          aria-label={`${definition.label} climate map`}
          className={viewMode === "flat" && webglEnabled ? "is-hidden" : ""}
          ref={baseRef}
        />
        {showWind && (
          <>
            <canvas className={`wind-canvas ${windWebglEnabled ? "" : "is-hidden"}`} ref={windWebglRef} />
            <canvas className={`wind-canvas ${windWebglEnabled ? "is-hidden" : ""}`} ref={windFallbackRef} />
          </>
        )}
        <canvas aria-hidden="true" className="boundary-canvas" ref={boundaryRef} />
        <span className="drag-hint">드래그 {viewMode === "flat" ? "이동" : "회전"} · 휠 확대/축소 · {zoomPercent}% · 더블클릭 초기화</span>
        {sample && (
          <div className="map-tooltip">
            <small>{Math.abs(sample.lat).toFixed(1)}°{sample.lat >= 0 ? "N" : "S"} · {sample.lon.toFixed(1)}°E</small>
            <strong>{definition.format(sample.value)}</strong>
            <span>{Number.isFinite(sample.u) && Number.isFinite(sample.v) ? `wind ${Math.hypot(sample.u, sample.v).toFixed(1)} m/s` : "wind 불러오는 중"}</span>
          </div>
        )}
      </div>
      <div className="map-footer">
        <div className="color-legend">
          <div className="legend-head">
            <span className="legend-name">{definition.label}</span>
            <span className="legend-unit">단위: {definition.unit}</span>
          </div>
          <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${definition.colors.join(",")})` }} />
          <div className="legend-ticks">{definition.ticks.map((tick) => <span key={tick}>{formatLegendTick(definition, tick)}</span>)}</div>
          <p className="legend-reason">{definition.description}</p>
        </div>
      </div>
    </section>
  );
}
