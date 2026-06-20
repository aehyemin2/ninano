import { useEffect, useMemo, useRef, useState } from "react";
import { VARIABLE_CATALOG, formatLegendTick } from "../data/variableCatalog";
import { drawMapOverlay } from "../render/drawMap";
import { drawFieldLayer, getDisplayField } from "../render/drawSSTLayer";
import { createWindAnimator } from "../render/drawWindParticles";
import type {
  DisplayVariableKey,
  GridDefinition,
  MapSample,
  SimulationFrame,
} from "../types/simulation";

interface PacificMapCanvasProps {
  frame: SimulationFrame;
  grid: GridDefinition;
  showWind: boolean;
  variable: DisplayVariableKey;
}

function drawBase(
  canvas: HTMLCanvasElement,
  grid: GridDefinition,
  frame: SimulationFrame,
  variable: DisplayVariableKey,
): void {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
  canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawFieldLayer(context, bounds.width, bounds.height, grid, frame, variable);
  drawMapOverlay(context, bounds.width, bounds.height);
}

export function PacificMapCanvas({ frame, grid, showWind, variable }: PacificMapCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const windRef = useRef<HTMLCanvasElement>(null);
  const [sample, setSample] = useState<MapSample | null>(null);
  const definition = VARIABLE_CATALOG[variable];
  const values = useMemo(() => getDisplayField(frame, variable), [frame, variable]);

  useEffect(() => {
    const canvas = baseRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const redraw = () => drawBase(canvas, grid, frame, variable);
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [frame, grid, variable]);

  useEffect(() => {
    const canvas = windRef.current;
    if (!canvas || !showWind) return;
    const stop = createWindAnimator(canvas, grid, frame);
    return stop;
  }, [frame, grid, showWind]);

  const inspect = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(0.999, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(0.999, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    const column = Math.floor(x * grid.lon.length);
    const row = Math.floor(y * grid.lat.length);
    const index = row * grid.lon.length + column;
    setSample({
      lat: grid.lat[row],
      lon: grid.lon[column],
      value: values[index],
      u: frame.fields.u10m[index],
      v: frame.fields.v10m[index],
    });
  };

  return (
    <section className="map-panel panel">
      <div className="map-heading">
        <div>
          <span className="eyebrow">Pacific basin · 30°N — 30°S</span>
          <h1>{definition.label}</h1>
          <p>{definition.description}</p>
        </div>
        <div className="live-badge"><span />LIVE MODEL</div>
      </div>
      <div
        className="map-stage"
        onPointerLeave={() => setSample(null)}
        onPointerMove={inspect}
        ref={wrapperRef}
      >
        <canvas aria-label={`${definition.label} climate map`} ref={baseRef} />
        {showWind && <canvas className="wind-canvas" ref={windRef} />}
        <span className="map-label label-north">30°N</span>
        <span className="map-label label-equator">EQ</span>
        <span className="map-label label-south">30°S</span>
        <span className="map-label label-west">120°E</span>
        <span className="map-label label-east">70°W</span>
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
          <div className="legend-ticks">{definition.ticks.map((tick) => <span key={tick}>{formatLegendTick(variable, tick)}</span>)}</div>
        </div>
        <div className="map-meta"><span>Grid <strong>0.25° source</strong></span><span>Projection <strong>Pacific equirectangular</strong></span></div>
      </div>
    </section>
  );
}
