import type {
  DisplayVariableKey,
  EnsoMetadata,
  EnsoVariableMetadata,
  VariableCatalog,
  VariableDefinition,
} from "../types/simulation";

const PALETTES: Record<string, readonly string[]> = {
  thermal: ["#142a62", "#1568a6", "#29b4a4", "#b7d96b", "#f2b94b", "#d9474f"],
  temperature: ["#202354", "#285da5", "#29a7ad", "#92c879", "#efb85b", "#dc5a4d"],
  wind: ["#3858a6", "#58a7c4", "#dce7d2", "#e9b15e", "#c84b51"],
  pressure: ["#514078", "#3379a4", "#65b7a7", "#dccb78", "#d16b51"],
  moisture: ["#202c46", "#236681", "#2ba79d", "#a6ce72", "#edc45f"],
  precipitation: ["#17263b", "#176887", "#20a5a0", "#87cf7e", "#d9de67", "#f1aa49"],
};

const FALLBACK_PALETTE: Record<DisplayVariableKey, keyof typeof PALETTES> = {
  sst: "thermal",
  t2m: "temperature",
  u10m: "wind",
  v10m: "wind",
  msl: "pressure",
  tcwv: "moisture",
  tpf: "precipitation",
};

const DETAILS: Record<DisplayVariableKey, { label: string; shortLabel: string; description: string }> = {
  sst: { label: "해수면 온도", shortLabel: "Sea surface temperature", description: "해수면 온도와 ENSO의 중심 신호" },
  t2m: { label: "2m 기온", shortLabel: "Air temperature", description: "지표면 2m 높이의 공기 온도" },
  u10m: { label: "동서 바람", shortLabel: "Zonal wind at 10m", description: "양수는 동쪽, 음수는 서쪽 방향 성분" },
  v10m: { label: "남북 바람", shortLabel: "Meridional wind at 10m", description: "양수는 북쪽, 음수는 남쪽 방향 성분" },
  msl: { label: "해면 기압", shortLabel: "Sea-level pressure", description: "평균 해수면 기준 기압" },
  tcwv: { label: "대기 수증기", shortLabel: "Column water vapour", description: "대기 기둥 전체의 수증기량" },
  tpf: { label: "강수 플럭스", shortLabel: "Precipitation flux", description: "백엔드에서 표시 단위로 변환된 강수량" },
};

function ticks([min, max]: [number, number]): number[] {
  return Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);
}

function decimalsFor(variable: EnsoVariableMetadata): number {
  if (variable.key === "msl") return 0;
  if (variable.key === "u10m" || variable.key === "v10m") return 1;
  return variable.displayRange[1] - variable.displayRange[0] <= 10 ? 2 : 1;
}

function paletteFor(variable: EnsoVariableMetadata): readonly string[] {
  if (Array.isArray(variable.colorScale) && variable.colorScale.length >= 2) return variable.colorScale;
  const named = typeof variable.colorScale === "string" ? PALETTES[variable.colorScale] : undefined;
  return named ?? PALETTES[FALLBACK_PALETTE[variable.key]];
}

export function createVariableCatalog(metadata: EnsoMetadata): VariableCatalog {
  return Object.fromEntries(metadata.variables.map((variable) => {
    const detail = DETAILS[variable.key];
    const definition: VariableDefinition = {
      key: variable.key,
      label: variable.label || detail.label,
      shortLabel: detail.shortLabel,
      unit: variable.unit,
      description: detail.description,
      displayRange: variable.displayRange,
      ticks: ticks(variable.displayRange),
      colors: paletteFor(variable),
      format: (value) => Number.isFinite(value)
        ? `${value.toFixed(decimalsFor(variable))} ${variable.unit}`
        : "데이터 없음",
    };
    return [variable.key, definition];
  })) as VariableCatalog;
}

export function formatLegendTick(definition: VariableDefinition, value: number): string {
  const span = definition.displayRange[1] - definition.displayRange[0];
  const digits = span <= 5 ? 1 : 0;
  return value.toFixed(digits);
}
