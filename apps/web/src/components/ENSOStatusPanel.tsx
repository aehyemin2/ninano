import type { ExperimentInputs, FieldValues, GridDefinition, SimulationFrame } from "../types/simulation";
import { Icon } from "./Icon";

interface ENSOStatusPanelProps {
  grid: GridDefinition;
  frame: SimulationFrame;
  inputs: ExperimentInputs;
}

function regionMean(values: FieldValues, grid: GridDefinition, latRange: [number, number], lonRange: [number, number]): number {
  let total = 0;
  let count = 0;
  grid.lat.forEach((lat, row) => {
    if (lat > latRange[0] || lat < latRange[1]) return;
    grid.lon.forEach((lon, column) => {
      if (lon < lonRange[0] || lon > lonRange[1]) return;
      const value = values[row * grid.lon.length + column];
      if (Number.isFinite(value)) {
        total += value;
        count += 1;
      }
    });
  });
  return count ? total / count : Number.NaN;
}

function signed(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function ENSOStatusPanel({ grid, frame, inputs }: ENSOStatusPanelProps) {
  const seaTemperature = regionMean(frame.fields.sst, grid, [5, -5], [190, 240]);
  const zonalWind = regionMean(frame.fields.u10m, grid, [5, -5], [160, 240]);
  const state = inputs.sstAnomaly < -0.5 ? "La Niña leaning" : inputs.sstAnomaly > 0.5 ? "El Niño leaning" : "Neutral reference";
  const tone = inputs.sstAnomaly < -0.5 ? "cold" : inputs.sstAnomaly > 0.5 ? "warm" : "neutral";

  return (
    <section className="status-panel panel">
      <div className="panel-heading compact">
        <div><span className="eyebrow">Basin diagnostics</span><h2>ENSO 상태</h2></div>
        <span className={`status-dot ${tone}`} />
      </div>
      <div className={`enso-state ${tone}`}>
        <span>Applied experiment</span>
        <strong>{state}</strong>
        <small>SST {signed(inputs.sstAnomaly)} °C · Wind {signed(inputs.tradeWindChange, 0)} m/s</small>
      </div>
      <div className="metric-grid">
        <article>
          <span className="metric-icon"><Icon name="temperature" /></span>
          <div><small>Niño 3.4 SST</small><strong>{seaTemperature.toFixed(1)} °C</strong></div>
        </article>
        <article>
          <span className="metric-icon"><Icon name="wind" /></span>
          <div><small>적도 zonal wind</small><strong>{zonalWind.toFixed(1)} m/s</strong></div>
        </article>
      </div>
    </section>
  );
}
