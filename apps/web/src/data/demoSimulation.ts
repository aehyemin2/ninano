import type {
  RawVariableKey,
  ScenarioKey,
  SimulationBundle,
  SimulationEndpoint,
  SimulationFrame,
} from "../types/simulation";

const lat = Array.from({ length: 41 }, (_, index) => 30 - index * 1.5);
const lon = Array.from({ length: 86 }, (_, index) => 120 + index * 2);

const scenarioSignal: Record<ScenarioKey, number> = {
  la_nina: -1,
  neutral: 0,
  el_nino: 1,
};

function gaussian(value: number, center: number, width: number): number {
  return Math.exp(-1 * ((value - center) / width) ** 2);
}

function buildFrame(scenario: ScenarioKey): SimulationFrame {
  const signal = scenarioSignal[scenario];
  const fields: Record<RawVariableKey, number[]> = {
    t2m: [],
    msl: [],
    tcwv: [],
    u10m: [],
    v10m: [],
  };

  for (const latitude of lat) {
    for (const longitude of lon) {
      const equator = gaussian(latitude, 0, 12);
      const eastPacific = gaussian(longitude, 225, 42);
      const westPacific = gaussian(longitude, 150, 34);
      const wave = Math.sin(((longitude - 120) / 170) * Math.PI * 3);
      const enso = signal * equator * eastPacific;

      fields.t2m.push(
        300.2 - Math.abs(latitude) * 0.28 + westPacific * 1.5 + enso * 2.8 + wave * 0.35,
      );
      fields.msl.push(
        101100 + Math.abs(latitude) * 18 - enso * 260 + Math.cos(longitude / 18) * 95,
      );
      fields.tcwv.push(
        52 * equator + 7 + enso * 5 + Math.sin(longitude / 13) * 2.5,
      );
      fields.u10m.push(
        -5.2 * equator + signal * 3.8 * equator * eastPacific + Math.sin(latitude / 8),
      );
      fields.v10m.push(
        Math.sin((longitude - 180) / 24) * 1.7 + Math.sign(latitude || 1) * 0.9,
      );
    }
  }

  return { timestamp: "2013-12-15T00:00:00Z", fields };
}

function buildEndpoint(scenario: ScenarioKey): SimulationEndpoint {
  return {
    scenario,
    grid: { lat, lon },
    frames: [buildFrame(scenario)],
  };
}

export function createPreviewBundle(): SimulationBundle {
  return {
    source: "preview",
    sourceLabel: "neutral_2013-12-15.nc 기반 UI preview",
    endpoints: {
      la_nina: buildEndpoint("la_nina"),
      neutral: buildEndpoint("neutral"),
      el_nino: buildEndpoint("el_nino"),
    },
  };
}
