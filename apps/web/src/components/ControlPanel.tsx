import { useViewerStore } from "../store/useViewerStore";
import type { EnsoMetadata, ExperimentInputs, VariableCatalog } from "../types/simulation";
import { Icon } from "./Icon";

interface ControlPanelProps {
  metadata: EnsoMetadata;
  variables: VariableCatalog;
  isApplying: boolean;
  applyError: string | null;
  onCommitInputs: (inputs: ExperimentInputs) => void;
}

function signed(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function closestIndex(values: number[], target: number): number {
  return values.reduce((best, value, index) =>
    Math.abs(value - target) < Math.abs(values[best] - target) ? index : best, 0);
}

interface EnsoGuide { kind: "warn" | "ok"; title: string; text: string; }

// 엘니뇨/라니냐는 해수면온도와 무역풍이 물리적으로 맞물려야 생긴다.
// (따뜻한 바다 ↔ 약한 무역풍(+), 찬 바다 ↔ 강한 무역풍(−))
// 부호가 반대인 큰 값이면 현실에선 보기 어려운 조합이라 안내한다.
function ensoGuide(sst: number, wind: number): EnsoGuide | null {
  const sstStrong = Math.abs(sst) >= 0.5;
  const windStrong = Math.abs(wind) >= 2;
  if (!sstStrong || !windStrong) return null;
  const sameRegime = Math.sign(sst) === Math.sign(wind);
  if (!sameRegime) {
    return sst > 0
      ? {
          kind: "warn",
          title: "⚠️ 실제로는 보기 어려운 조합",
          text: "무역풍이 강해지면(−) 동태평양에 찬 바닷물이 올라와 바다가 식어요. 그래서 ‘따뜻한 바다 + 강한 무역풍’은 함께 나타나기 어렵습니다. 엘니뇨는 무역풍이 약해질 때(+) 생겨요.",
        }
      : {
          kind: "warn",
          title: "⚠️ 실제로는 보기 어려운 조합",
          text: "무역풍이 약해지면(+) 따뜻한 물이 동쪽으로 퍼져 바다가 데워져요. 그래서 ‘찬 바다 + 약한 무역풍’은 함께 나타나기 어렵습니다. 라니냐는 무역풍이 강해질 때(−) 생겨요.",
        };
  }
  return sst > 0
    ? { kind: "ok", title: "✓ 엘니뇨에 가까운 조합", text: "따뜻한 바다 + 약한 무역풍이 맞물린 상태예요." }
    : { kind: "ok", title: "✓ 라니냐에 가까운 조합", text: "찬 바다 + 강한 무역풍이 맞물린 상태예요." };
}

export function ControlPanel({
  metadata,
  variables,
  isApplying,
  applyError,
  onCommitInputs,
}: ControlPanelProps) {
  const {
    selectedVariable,
    draftInputs,
    showWind,
    setSelectedVariable,
    setDraftSstAnomaly,
    setDraftTradeWindChange,
    setShowWind,
  } = useViewerStore();
  const sstValues = metadata.sliders.sstAnomaly.values;
  const windValues = metadata.sliders.windDelta.values;
  const displayVariables = metadata.variables
    .filter(({ key }) => key !== "u10m" && key !== "v10m")
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(({ key }) => variables[key]);

  const guide = ensoGuide(draftInputs.sstAnomaly, draftInputs.tradeWindChange);
  const commitSst = (index: number) => onCommitInputs({
    ...draftInputs,
    sstAnomaly: sstValues[index],
  });
  const commitWind = (index: number) => onCommitInputs({
    ...draftInputs,
    tradeWindChange: windValues[index],
  });

  return (
    <aside className="control-panel panel">
      <div className="panel-heading">
        <div><span className="eyebrow">실험 조절</span><h2>기후 실험실</h2></div>
        <span className="heading-icon"><Icon name="spark" /></span>
      </div>

      <section className="control-section experiment-controls">
        <div className="input-slider-block">
          <div className="control-title-row">
            <label htmlFor="trade-wind">무역풍 변화</label>
            <output className="value-chip wind-value">{signed(draftInputs.tradeWindChange, 0)} m/s</output>
          </div>
          <input
            aria-label="Trade wind change"
            className="trade-wind-range"
            id="trade-wind"
            max={windValues.length - 1}
            min="0"
            onChange={(event) => setDraftTradeWindChange(windValues[Number(event.target.value)])}
            onBlur={(event) => commitWind(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitWind(Number(event.currentTarget.value))}
            onPointerCancel={(event) => commitWind(Number(event.currentTarget.value))}
            onPointerUp={(event) => commitWind(Number(event.currentTarget.value))}
            step="1"
            type="range"
            value={closestIndex(windValues, draftInputs.tradeWindChange)}
          />
          <div className="range-labels">
            <span>{signed(windValues[0], 0)}</span>
            <span className="range-zero" style={{ left: `${(closestIndex(windValues, 0) / (windValues.length - 1)) * 100}%` }}>0</span>
            <span>{signed(windValues.at(-1) ?? 0, 0)} m/s</span>
          </div>
        </div>

        <div className="input-slider-block">
          <div className="control-title-row">
            <label htmlFor="sst-anomaly">적도 동태평양 수온 변화</label>
            <output className="value-chip warm-value">{signed(draftInputs.sstAnomaly)} °C</output>
          </div>
          <input
            aria-label="SST anomaly"
            className="sst-range"
            id="sst-anomaly"
            max={sstValues.length - 1}
            min="0"
            onChange={(event) => setDraftSstAnomaly(sstValues[Number(event.target.value)])}
            onBlur={(event) => commitSst(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitSst(Number(event.currentTarget.value))}
            onPointerCancel={(event) => commitSst(Number(event.currentTarget.value))}
            onPointerUp={(event) => commitSst(Number(event.currentTarget.value))}
            step="1"
            type="range"
            value={closestIndex(sstValues, draftInputs.sstAnomaly)}
          />
          <div className="range-labels">
            <span>{signed(sstValues[0])}</span>
            <span className="range-zero" style={{ left: `${(closestIndex(sstValues, 0) / (sstValues.length - 1)) * 100}%` }}>0</span>
            <span>{signed(sstValues.at(-1) ?? 0)} °C</span>
          </div>
        </div>

        <p className={`live-apply-status ${isApplying ? "is-loading" : ""}`}>
          <span />{isApplying ? "선택한 데이터를 불러오는 중…" : "슬라이더를 놓으면 적용"}
        </p>
        {guide && (
          <div className={`enso-guide ${guide.kind}`}>
            <strong>{guide.title}</strong>
            <span>{guide.text}</span>
          </div>
        )}
        {applyError && <p className="apply-error" role="alert">{applyError}</p>}
      </section>

      <section className="control-section">
        <div className="control-title-row"><label>표시 레이어</label><span className="layer-count">변수 {displayVariables.length}개</span></div>
        <div className="variable-list">
          {displayVariables.map((variable) => (
            <button
              className={`variable-option ${selectedVariable === variable.key ? "is-active" : ""}`}
              key={variable.key}
              onClick={() => setSelectedVariable(variable.key)}
              type="button"
            >
              <span className="variable-radio" />
              <span><strong>{variable.label}</strong><small>{variable.shortLabel}</small></span>
              <span className="variable-unit">{variable.unit}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="wind-toggle">
        <span className="toggle-copy"><Icon name="wind" /><span><strong>바람 흐름</strong><small>동서·남북 바람을 입자로 표시</small></span></span>
        <button aria-pressed={showWind} className={`switch ${showWind ? "is-on" : ""}`} onClick={() => setShowWind(!showWind)} type="button"><span /></button>
      </section>
    </aside>
  );
}
