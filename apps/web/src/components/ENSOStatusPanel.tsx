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

function metric(value: number, digits: number, unit: string): string {
  return Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : "불러오는 중";
}

export function ENSOStatusPanel({ grid, frame, inputs }: ENSOStatusPanelProps) {
  const seaTemperature = regionMean(frame.fields.sst, grid, [5, -5], [190, 240]);
  const zonalWind = regionMean(frame.fields.u10m, grid, [5, -5], [160, 240]);
  const state = inputs.sstAnomaly < -0.5 ? "라니냐 경향" : inputs.sstAnomaly > 0.5 ? "엘니뇨 경향" : "평년 수준";
  const tone = inputs.sstAnomaly < -0.5 ? "cold" : inputs.sstAnomaly > 0.5 ? "warm" : "neutral";

  return (
    <section className="status-panel panel">
      <div className="panel-heading compact">
        <div><h2>해역 진단</h2></div>
        <span className={`status-dot ${tone}`} />
      </div>
      <div className={`enso-state ${tone}`}>
        <span>적용된 실험값</span>
        <strong>{state}</strong>
        <small>해수면온도 {signed(inputs.sstAnomaly)} °C · 무역풍 {signed(inputs.tradeWindChange, 0)} m/s</small>
      </div>
      <div className="metric-grid">
        <article>
          <span className="metric-icon"><Icon name="temperature" /></span>
          <div><small>니뇨3.4 해역 수온</small><strong>{metric(seaTemperature, 1, "°C")}</strong></div>
        </article>
        <article>
          <span className="metric-icon"><Icon name="wind" /></span>
          <div><small>적도 동서 바람</small><strong>{metric(zonalWind, 1, "m/s")}</strong></div>
        </article>
      </div>
    </section>
  );
}
