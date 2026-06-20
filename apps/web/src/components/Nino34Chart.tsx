import type { GridDefinition, SimulationFrame } from "../types/simulation";

interface Nino34ChartProps {
  grid: GridDefinition;
  current: SimulationFrame;
  neutral: SimulationFrame;
}

function equatorialProfile(frame: SimulationFrame, grid: GridDefinition): number[] {
  return grid.lon.map((_, column) => {
    let total = 0;
    let count = 0;
    grid.lat.forEach((lat, row) => {
      if (Math.abs(lat) <= 5) {
        total += frame.fields.t2m[row * grid.lon.length + column] - 273.15;
        count += 1;
      }
    });
    return total / Math.max(1, count);
  });
}

function linePath(values: number[], min: number, max: number): string {
  return values
    .map((value, index) => {
      const x = 8 + (index / Math.max(1, values.length - 1)) * 304;
      const y = 96 - ((value - min) / (max - min)) * 72;
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Nino34Chart({ grid, current, neutral }: Nino34ChartProps) {
  const currentValues = equatorialProfile(current, grid);
  const neutralValues = equatorialProfile(neutral, grid);
  const allValues = [...currentValues, ...neutralValues];
  const min = Math.floor(Math.min(...allValues) - 1);
  const max = Math.ceil(Math.max(...allValues) + 1);

  return (
    <section className="profile-panel panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">Equatorial transect</span>
          <h2>태평양 열 신호</h2>
        </div>
        <div className="chart-legend"><span className="current" />현재 <span className="reference" />중립</div>
      </div>
      <svg aria-label="Equatorial air temperature profile" className="profile-chart" role="img" viewBox="0 0 320 112">
        {[24, 48, 72, 96].map((y) => <line className="chart-grid" key={y} x1="8" x2="312" y1={y} y2={y} />)}
        <rect className="nino-zone" height="72" width="90" x="134" y="24" />
        <path className="reference-line" d={linePath(neutralValues, min, max)} />
        <path className="current-line" d={linePath(currentValues, min, max)} />
        <text x="8" y="109">120°E</text>
        <text textAnchor="middle" x="160" y="109">Niño 3.4</text>
        <text textAnchor="end" x="312" y="109">70°W</text>
      </svg>
      <p className="chart-caption">적도 ±5°의 2m 공기 온도 · SST anomaly가 아님</p>
    </section>
  );
}
