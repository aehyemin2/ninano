import { createPreviewBundle } from "./demoSimulation";
import type {
  ScenarioKey,
  SimulationBundle,
  SimulationEndpoint,
  SimulationManifest,
} from "../types/simulation";

const DEFAULT_BASE_URL = "/data/simulations";
const scenarios: ScenarioKey[] = ["la_nina", "neutral", "el_nino"];
const requiredFields = ["t2m", "msl", "tcwv", "u10m", "v10m"] as const;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function validateEndpoint(endpoint: SimulationEndpoint): void {
  const expectedSize = endpoint.grid.lat.length * endpoint.grid.lon.length;
  if (!endpoint.frames.length) throw new Error(`${endpoint.scenario}: no frames`);
  for (const frame of endpoint.frames) {
    for (const key of requiredFields) {
      const values = frame.fields[key];
      if (!Array.isArray(values)) {
        throw new Error(`${endpoint.scenario}/${key}: missing field`);
      }
      if (values.length !== expectedSize) {
        throw new Error(`${endpoint.scenario}/${key}: invalid grid size`);
      }
    }
  }
}

export async function loadEndpointSimulations(): Promise<SimulationBundle> {
  const baseUrl = import.meta.env.VITE_SIMULATION_BASE_URL ?? DEFAULT_BASE_URL;
  try {
    const manifest = await fetchJson<SimulationManifest>(
      `${baseUrl}/simulation_index.json`,
    );
    const results = await Promise.all(
      scenarios.map((scenario) =>
        fetchJson<SimulationEndpoint>(`${baseUrl}/${manifest.endpoints[scenario]}`),
      ),
    );
    results.forEach(validateEndpoint);
    return {
      source: "api",
      sourceLabel: "processed cBottle endpoint data",
      endpoints: Object.fromEntries(
        results.map((endpoint) => [endpoint.scenario, endpoint]),
      ) as SimulationBundle["endpoints"],
    };
  } catch (error) {
    console.info("Simulation API unavailable; using the UI preview dataset.", error);
    return createPreviewBundle();
  }
}
