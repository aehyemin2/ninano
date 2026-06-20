import type { GridDefinition, SimulationFrame } from "../types/simulation";

interface Nino34ChartProps { grid: GridDefinition; current: SimulationFrame; neutral: SimulationFrame; }

function anomalyProfile(current: SimulationFrame, neutral: SimulationFrame, grid: GridDefinition): number[] {
  return grid.lon.map((_, column) => {
    let total = 0;
    let count = 0;
    grid.lat.forEach((lat, row) => {
      if (Math.abs(lat) <= 5) {
        const index = row * grid.lon.length + column;
        const currentValue = current.fields.sst[index];
        const neutralValue = neutral.fields.sst[index];
        if (Number.isFinite(currentValue) && Number.isFinite(neutralValue)) {
          total += currentValue - neutralValue;
          count += 1;
        }
      }
    });
    return count ? total / count : 0;
  });
}

function linePath(values: number[], min: number, max: number): string {
  return values.map((value, index) => {
    const x = 8 + (index / Math.max(1, values.length - 1)) * 304;
    const y = 96 - ((value - min) / (max - min)) * 72;
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function Nino34Chart({ grid, current, neutral }: Nino34ChartProps) {
  const fullProfile = anomalyProfile(current, neutral, grid);
  const values = fullProfile.filter((_, index) => grid.lon[index] >= 120 && grid.lon[index] <= 290);
  const extent = Math.max(0.5, Math.ceil(Math.max(...values.map(Math.abs)) * 2) / 2);
  const reference = values.map(() => 0);

  return (
    <section className="profile-panel panel">
      <div className="panel-heading compact">
        <div><span className="eyebrow">Equatorial transect</span><h2>적도 SST 편차</h2></div>
        <div className="chart-legend"><span className="current" />현재 <span className="reference" />기준</div>
      </div>
      <svg aria-label="Equatorial sea surface temperature anomaly profile" className="profile-chart" role="img" viewBox="0 0 320 112">
        {[24, 48, 72, 96].map((y) => <line className="chart-grid" key={y} x1="8" x2="312" y1={y} y2={y} />)}
        <rect className="nino-zone" height="72" width="90" x="134" y="24" />
        <path className="reference-line" d={linePath(reference, -extent, extent)} />
        <path className="current-line" d={linePath(values, -extent, extent)} />
        <text x="8" y="109">120°E</text><text textAnchor="middle" x="160" y="109">Niño 3.4</text><text textAnchor="end" x="312" y="109">70°W</text>
      </svg>
    </section>
  );
}
