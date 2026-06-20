import { useEffect, useMemo, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { ENSOStatusPanel } from "./components/ENSOStatusPanel";
import { Icon } from "./components/Icon";
import { Nino34Chart } from "./components/Nino34Chart";
import { PacificMapCanvas } from "./components/PacificMapCanvas";
import { interpolateSimulation } from "./data/interpolateSimulation";
import { loadEndpointSimulations } from "./data/loadEndpointSimulations";
import { useViewerStore } from "./store/useViewerStore";
import type { RawVariableKey, SimulationBundle } from "./types/simulation";

const requiredFields: Array<{ key: RawVariableKey; label: string; purpose: string }> = [
  { key: "t2m", label: "2m air temperature", purpose: "열 분포·Niño 3.4 보조 지표" },
  { key: "u10m", label: "10m zonal wind", purpose: "무역풍·바람 입자 X 성분" },
  { key: "v10m", label: "10m meridional wind", purpose: "바람 입자 Y 성분" },
  { key: "msl", label: "mean sea-level pressure", purpose: "Walker 순환 압력장" },
  { key: "tcwv", label: "total column water vapour", purpose: "대기 수분 분포" },
];

export default function App() {
  const [bundle, setBundle] = useState<SimulationBundle | null>(null);
  const { scenarioValue, selectedVariable, showWind, timeIndex } = useViewerStore();

  useEffect(() => {
    let mounted = true;
    loadEndpointSimulations().then((result) => {
      if (mounted) setBundle(result);
    });
    return () => { mounted = false; };
  }, []);

  const simulation = useMemo(
    () => (bundle ? interpolateSimulation(bundle, scenarioValue) : null),
    [bundle, scenarioValue],
  );

  if (!bundle || !simulation) {
    return (
      <main className="loading-screen">
        <div className="brand-mark"><span>N</span></div>
        <p>Pacific climate workspace 준비 중</p>
        <span className="loading-line" />
      </main>
    );
  }

  const safeTimeIndex = Math.min(timeIndex, simulation.frames.length - 1);
  const frame = simulation.frames[safeTimeIndex];
  const neutralFrame = bundle.endpoints.neutral.frames[safeTimeIndex] ?? frame;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span>N</span></div>
          <div><strong>NINANO</strong><small>Pacific Climate Lab</small></div>
        </div>
        <div className="topbar-center">
          <span className="workspace-pill"><Icon name="activity" size={15} /> ENSO workspace</span>
          <span className="separator" />
          <time>{new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(new Date(frame.timestamp))}</time>
        </div>
        <div className={`source-badge ${bundle.source}`}>
          <span />{bundle.source === "api" ? "DATA CONNECTED" : "PREVIEW DATA"}
        </div>
      </header>

      <main className="dashboard">
        <ControlPanel frameCount={simulation.frames.length} timestamp={frame.timestamp} />
        <div className="main-column">
          <PacificMapCanvas
            frame={frame}
            grid={simulation.grid}
            showWind={showWind}
            variable={selectedVariable}
          />
          <section className="provenance-panel panel">
            <div className="provenance-copy">
              <span className="eyebrow">Source readiness</span>
              <h2>NetCDF에서 확인한 필드</h2>
              <p>2013-12-15 · 721 × 1440 · global 0.25°</p>
            </div>
            <div className="field-chips">
              {requiredFields.map((field) => (
                <span className="field-chip" key={field.key} title={field.purpose}>
                  <strong>{field.key}</strong><small>{field.label}</small>
                </span>
              ))}
            </div>
          </section>
        </div>
        <div className="insight-column">
          <ENSOStatusPanel frame={frame} grid={simulation.grid} scenarioValue={scenarioValue} />
          <Nino34Chart current={frame} grid={simulation.grid} neutral={neutralFrame} />
          <section className="handoff-panel panel">
            <div className="handoff-icon"><Icon name="droplet" /></div>
            <div>
              <span className="eyebrow">Next data handoff</span>
              <h3>SST + climatology</h3>
              <p>정식 Niño 3.4 anomaly와 ENSO 분류에 필요한 다음 필드입니다.</p>
            </div>
          </section>
        </div>
      </main>
      <footer className="app-footer">
        <span>{bundle.sourceLabel}</span>
        <span>Web UI · Earth2Studio field contract v1</span>
      </footer>
    </div>
  );
}
