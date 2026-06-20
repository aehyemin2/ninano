import { useViewerStore } from "../store/useViewerStore";
import type { EnsoMetadata, VariableCatalog } from "../types/simulation";
import { Icon } from "./Icon";

interface ControlPanelProps {
  metadata: EnsoMetadata;
  variables: VariableCatalog;
  isApplying: boolean;
  applyError: string | null;
}

function signed(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function closestIndex(values: number[], target: number): number {
  return values.reduce((best, value, index) =>
    Math.abs(value - target) < Math.abs(values[best] - target) ? index : best, 0);
}

export function ControlPanel({
  metadata,
  variables,
  isApplying,
  applyError,
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

  return (
    <aside className="control-panel panel">
      <div className="panel-heading">
        <div><span className="eyebrow">Experiment inputs</span><h2>기후 실험실</h2></div>
        <span className="heading-icon"><Icon name="spark" /></span>
      </div>

      <section className="control-section experiment-controls">
        <div className="input-slider-block">
          <div className="control-title-row">
            <label htmlFor="sst-anomaly">SST anomaly</label>
            <output className="value-chip warm-value">{signed(draftInputs.sstAnomaly)} °C</output>
          </div>
          <input
            aria-label="SST anomaly"
            className="sst-range"
            id="sst-anomaly"
            max={sstValues.length - 1}
            min="0"
            onChange={(event) => setDraftSstAnomaly(sstValues[Number(event.target.value)])}
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

        <p className={`live-apply-status ${isApplying ? "is-loading" : ""}`}>
          <span />{isApplying ? "선택한 데이터를 불러오는 중…" : "슬라이더 입력 후 자동 적용"}
        </p>
        {applyError && <p className="apply-error" role="alert">{applyError}</p>}
      </section>

      <section className="control-section">
        <div className="control-title-row"><label>표시 레이어</label><span className="layer-count">{displayVariables.length} variables</span></div>
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
        <span className="toggle-copy"><Icon name="wind" /><span><strong>바람 흐름</strong><small>u10m + v10m stream particles</small></span></span>
        <button aria-pressed={showWind} className={`switch ${showWind ? "is-on" : ""}`} onClick={() => setShowWind(!showWind)} type="button"><span /></button>
      </section>
    </aside>
  );
}
