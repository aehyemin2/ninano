import type {
  DisplayVariableKey,
  VariableDefinition,
} from "../types/simulation";

// Ranges use p01–p99 from neutral_2013-12-15.nc to avoid outlier-driven legends.
export const VARIABLE_CATALOG: Record<DisplayVariableKey, VariableDefinition> = {
  t2m: {
    key: "t2m",
    label: "2m 기온",
    shortLabel: "Temperature",
    sourceFields: ["t2m"],
    unit: "°C",
    description: "지표면 2m 높이의 공기 온도",
    rawRange: [237.2, 301.7],
    ticks: [243.15, 263.15, 283.15, 303.15],
    colors: ["#293b72", "#2f91b7", "#7ecf9a", "#f1c76b", "#e86f51"],
    format: (value) => `${(value - 273.15).toFixed(1)} °C`,
  },
  wind: {
    key: "wind",
    label: "10m 바람",
    shortLabel: "Wind field",
    sourceFields: ["u10m", "v10m"],
    unit: "m/s",
    description: "동서·남북 10m 바람 성분으로 계산한 풍속",
    rawRange: [0, 15.9],
    ticks: [0, 5, 10, 15],
    colors: ["#173f55", "#2b8b96", "#83c9a6", "#f0c56d", "#e87352"],
    format: (value) => `${value.toFixed(1)} m/s`,
  },
  msl: {
    key: "msl",
    label: "해면 기압",
    shortLabel: "Sea-level pressure",
    sourceFields: ["msl"],
    unit: "hPa",
    description: "평균 해수면 기준 기압",
    rawRange: [96895, 103346],
    ticks: [97000, 99000, 101000, 103000],
    colors: ["#544178", "#397ca2", "#69b6a7", "#dccb78", "#d77a55"],
    format: (value) => `${(value / 100).toFixed(0)} hPa`,
  },
  tcwv: {
    key: "tcwv",
    label: "대기 수증기",
    shortLabel: "Column water vapour",
    sourceFields: ["tcwv"],
    unit: "kg/m²",
    description: "대기 기둥 전체의 수증기량",
    rawRange: [0, 58.9],
    ticks: [0, 20, 40, 60],
    colors: ["#242f4a", "#2b6d83", "#3da69b", "#a8cc75", "#edc868"],
    format: (value) => `${Math.max(0, value).toFixed(1)} kg/m²`,
  },
};

export const DISPLAY_VARIABLES = Object.values(VARIABLE_CATALOG);

export function formatLegendTick(key: DisplayVariableKey, value: number): string {
  if (key === "t2m") return `${Math.round(value - 273.15)}°`;
  if (key === "msl") return `${Math.round(value / 100)}`;
  return `${Math.round(value)}`;
}
