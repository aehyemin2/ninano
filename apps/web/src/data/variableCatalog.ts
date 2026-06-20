import type {
  DisplayVariableKey,
  EnsoMetadata,
  EnsoVariableMetadata,
  VariableCatalog,
  VariableDefinition,
} from "../types/simulation";

const PALETTES: Record<string, readonly string[]> = {
  // 사진(NOAA SST)처럼 찬물=파랑 → 가운데=흰색 → 따뜻한물=빨강 발산형 색상.
  thermal: ["#08306b", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#67001f"],
  temperature: ["#08306b", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#67001f"],
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
  sst: { label: "해수면 온도", shortLabel: "바다 표면의 물 온도", description: "바다 표면의 온도예요. 엘니뇨·라니냐를 가장 잘 보여주는 핵심 지표라, 적도 동태평양이 평년보다 따뜻하면 엘니뇨, 차가우면 라니냐예요." },
  t2m: { label: "기온", shortLabel: "땅 위 공기의 온도", description: "땅에서 2m 높이 공기의 온도예요. 바다가 데워지거나 식으면 그 영향이 땅 위 기온까지 퍼지는데, 그게 어디까지 미치는지 볼 수 있어요." },
  u10m: { label: "동서 바람", shortLabel: "동쪽·서쪽으로 부는 바람", description: "동쪽·서쪽으로 부는 바람이에요. 적도에서 동→서로 부는 무역풍의 세기를 여기서 볼 수 있고, 무역풍이 약해지면 엘니뇨예요." },
  v10m: { label: "남북 바람", shortLabel: "북쪽·남쪽으로 부는 바람", description: "북쪽·남쪽으로 부는 바람의 세기예요." },
  msl: { label: "기압", shortLabel: "공기가 누르는 힘", description: "공기가 누르는 힘(기압)이에요. 공기는 기압 높은 곳에서 낮은 곳으로 부는데, 평소엔 고기압인 동태평양에서 저기압인 서태평양으로 부는 게 무역풍이에요. 동·서 기압이 비슷해지면 무역풍이 약해져 엘니뇨가 돼요." },
  tcwv: { label: "공기 속 수증기", shortLabel: "공기에 들어 있는 물기", description: "공기 속에 들어 있는 물기(수증기)의 양이에요. 비구름의 재료라서, 따뜻한 바다 위에 수증기가 많이 모이면 그 위로 비가 많이 와요." },
  tpf: { label: "강수량", shortLabel: "내리는 비의 양", description: "하루 동안 내리는 비의 양이에요. 엘니뇨·라니냐가 되면 비 오는 곳이 동쪽이나 서쪽으로 옮겨가는데, 어디서 비가 늘고 줄어드는지 볼 수 있어요." },
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
