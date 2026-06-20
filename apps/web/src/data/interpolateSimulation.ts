import type {
  RawVariableKey,
  SimulationBundle,
  SimulationEndpoint,
  SimulationFrame,
} from "../types/simulation";

const RAW_FIELDS: RawVariableKey[] = ["t2m", "msl", "tcwv", "u10m", "v10m"];

function mixArray(left: number[], right: number[], amount: number): number[] {
  if (left.length !== right.length) {
    throw new Error("Endpoint grid sizes do not match");
  }
  return left.map((value, index) => value + (right[index] - value) * amount);
}

function mixFrame(
  left: SimulationFrame,
  right: SimulationFrame,
  amount: number,
): SimulationFrame {
  const fields = {} as SimulationFrame["fields"];
  for (const key of RAW_FIELDS) {
    fields[key] = mixArray(left.fields[key], right.fields[key], amount);
  }
  return { timestamp: left.timestamp, fields };
}

export function interpolateSimulation(
  bundle: SimulationBundle,
  scenarioValue: number,
): SimulationEndpoint {
  const clamped = Math.min(100, Math.max(0, scenarioValue));
  const isColdSide = clamped <= 50;
  const left = isColdSide ? bundle.endpoints.la_nina : bundle.endpoints.neutral;
  const right = isColdSide ? bundle.endpoints.neutral : bundle.endpoints.el_nino;
  const amount = isColdSide ? clamped / 50 : (clamped - 50) / 50;

  return {
    scenario: clamped < 34 ? "la_nina" : clamped > 66 ? "el_nino" : "neutral",
    grid: left.grid,
    frames: left.frames.map((frame, index) =>
      mixFrame(frame, right.frames[index] ?? frame, amount),
    ),
  };
}
