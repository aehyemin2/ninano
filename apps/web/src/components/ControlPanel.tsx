import { DISPLAY_VARIABLES } from "../data/variableCatalog";
import { useViewerStore } from "../store/useViewerStore";
import { Icon } from "./Icon";

interface ControlPanelProps {
  frameCount: number;
  timestamp: string;
}

function scenarioLabel(value: number): string {
  if (value < 34) return "La Niña leaning";
  if (value > 66) return "El Niño leaning";
  return "Neutral range";
}

export function ControlPanel({ frameCount, timestamp }: ControlPanelProps) {
  const {
    selectedVariable,
    scenarioValue,
    timeIndex,
    showWind,
    setSelectedVariable,
    setScenarioValue,
    setTimeIndex,
    setShowWind,
  } = useViewerStore();

  return (
    <aside className="control-panel panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Experiment setup</span>
          <h2>기후 실험실</h2>
        </div>
        <span className="heading-icon"><Icon name="spark" /></span>
      </div>

      <section className="control-section">
        <div className="control-title-row">
          <label htmlFor="scenario">ENSO 시나리오</label>
          <span className="value-chip">{scenarioLabel(scenarioValue)}</span>
        </div>
        <input
          aria-label="ENSO scenario"
          className="scenario-range"
          id="scenario"
          max="100"
          min="0"
          onChange={(event) => setScenarioValue(Number(event.target.value))}
          type="range"
          value={scenarioValue}
        />
        <div className="range-labels">
          <span>La Niña</span>
          <span>Neutral</span>
          <span>El Niño</span>
        </div>
        <p className="control-note">
          endpoint가 연결되면 중간 상태를 선형 보간합니다. 현재는 UI preview입니다.
        </p>
      </section>

      <section className="control-section">
        <div className="control-title-row">
          <label>표시 레이어</label>
          <Icon name="layers" size={16} />
        </div>
        <div className="variable-list">
          {DISPLAY_VARIABLES.map((variable) => (
            <button
              className={`variable-option ${selectedVariable === variable.key ? "is-active" : ""}`}
              key={variable.key}
              onClick={() => setSelectedVariable(variable.key)}
              type="button"
            >
              <span className="variable-radio" />
              <span>
                <strong>{variable.label}</strong>
                <small>{variable.shortLabel}</small>
              </span>
              <span className="variable-unit">{variable.unit}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="control-section timeline-section">
        <div className="control-title-row">
          <label htmlFor="timeline">시간</label>
          <Icon name="calendar" size={16} />
        </div>
        <time>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date(timestamp))}</time>
        <input
          disabled={frameCount <= 1}
          id="timeline"
          max={Math.max(0, frameCount - 1)}
          min="0"
          onChange={(event) => setTimeIndex(Number(event.target.value))}
          type="range"
          value={Math.min(timeIndex, frameCount - 1)}
        />
        <small>{frameCount === 1 ? "단일 snapshot · 추가 시계열 대기 중" : `${timeIndex + 1} / ${frameCount}`}</small>
      </section>

      <section className="wind-toggle">
        <span className="toggle-copy">
          <Icon name="wind" />
          <span><strong>바람 흐름</strong><small>u10m + v10m particle</small></span>
        </span>
        <button
          aria-pressed={showWind}
          className={`switch ${showWind ? "is-on" : ""}`}
          onClick={() => setShowWind(!showWind)}
          type="button"
        ><span /></button>
      </section>
    </aside>
  );
}
