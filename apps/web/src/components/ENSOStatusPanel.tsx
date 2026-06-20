import type { GridDefinition, SimulationFrame } from "../types/simulation";
import { Icon } from "./Icon";

interface ENSOStatusPanelProps {
  grid: GridDefinition;
  frame: SimulationFrame;
  scenarioValue: number;
}

function regionMean(
  values: number[],
  grid: GridDefinition,
  latRange: [number, number],
  lonRange: [number, number],
): number {
  let total = 0;
  let count = 0;
  grid.lat.forEach((lat, row) => {
    if (lat > latRange[0] || lat < latRange[1]) return;
    grid.lon.forEach((lon, column) => {
      if (lon < lonRange[0] || lon > lonRange[1]) return;
      total += values[row * grid.lon.length + column];
      count += 1;
    });
  });
  return count ? total / count : Number.NaN;
}

export function ENSOStatusPanel({ grid, frame, scenarioValue }: ENSOStatusPanelProps) {
  const airTemperature = regionMean(frame.fields.t2m, grid, [5, -5], [190, 240]);
  const zonalWind = regionMean(frame.fields.u10m, grid, [5, -5], [160, 240]);
  const state = scenarioValue < 34 ? "La Niña leaning" : scenarioValue > 66 ? "El Niño leaning" : "Neutral reference";
  const tone = scenarioValue < 34 ? "cold" : scenarioValue > 66 ? "warm" : "neutral";

  return (
    <section className="status-panel panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">Basin diagnostics</span>
          <h2>ENSO 상태</h2>
        </div>
        <span className={`status-dot ${tone}`} />
      </div>
      <div className={`enso-state ${tone}`}>
        <span>Current scenario</span>
        <strong>{state}</strong>
        <small>실험 강도 {scenarioValue}%</small>
      </div>
      <div className="metric-grid">
        <article>
          <span className="metric-icon"><Icon name="temperature" /></span>
          <div><small>Niño 3.4 T2m</small><strong>{(airTemperature - 273.15).toFixed(1)} °C</strong></div>
        </article>
        <article>
          <span className="metric-icon"><Icon name="wind" /></span>
          <div><small>적도 zonal wind</small><strong>{zonalWind.toFixed(1)} m/s</strong></div>
        </article>
      </div>
      <div className="data-gap-note">
        <Icon name="activity" size={16} />
        <p><strong>Niño 3.4 anomaly 산출 대기</strong><span>현재 파일에는 SST와 climatology가 없습니다.</span></p>
      </div>
    </section>
  );
}
