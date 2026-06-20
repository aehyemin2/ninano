import { useEffect, useMemo, useRef, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { ENSOStatusPanel } from "./components/ENSOStatusPanel";
import { Icon } from "./components/Icon";
import { Nino34Chart } from "./components/Nino34Chart";
import { PacificMapCanvas } from "./components/PacificMapCanvas";
import { loadSimulationDataset, loadSimulationFrame } from "./data/ensoApi";
import { createVariableCatalog } from "./data/variableCatalog";
import { useViewerStore } from "./store/useViewerStore";
import type { SimulationDataset, SimulationFrame } from "./types/simulation";

const SLIDER_DEBOUNCE_MS = 180;

export default function App() {
  const [dataset, setDataset] = useState<SimulationDataset | null>(null);
  const [frame, setFrame] = useState<SimulationFrame | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const applyController = useRef<AbortController | null>(null);
  const { appliedInputs, commitAppliedInputs, draftInputs, selectedVariable, showWind } = useViewerStore();
  const [requestedInputs, setRequestedInputs] = useState(draftInputs);

  useEffect(() => {
    const controller = new AbortController();
    loadSimulationDataset(selectedVariable, controller.signal).then((result) => {
      setDataset(result);
      setFrame(result.baselineFrame);
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setApplyError("초기 기후 데이터를 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setRequestedInputs(draftInputs), SLIDER_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [draftInputs]);

  useEffect(() => {
    if (!dataset) return undefined;
    applyController.current?.abort();
    const controller = new AbortController();
    applyController.current = controller;
    setIsApplying(true);
    setApplyError(null);
    loadSimulationFrame(dataset, requestedInputs, selectedVariable, controller.signal)
      .then((nextFrame) => {
        if (controller.signal.aborted) return;
        setFrame(nextFrame);
        commitAppliedInputs(requestedInputs);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setApplyError(error instanceof Error ? error.message : "선택한 기후장을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (applyController.current === controller) {
          applyController.current = null;
          setIsApplying(false);
        }
      });
    return () => controller.abort();
  }, [dataset, requestedInputs, selectedVariable]);

  const variables = useMemo(() => dataset ? createVariableCatalog(dataset.metadata) : null, [dataset]);

  if (!dataset || !frame || !variables) {
    return (
      <main className="loading-screen"><div className="brand-mark"><span>N</span></div><p>Pacific climate workspace 준비 중</p><span className="loading-line" /></main>
    );
  }

  const sortedVariables = dataset.metadata.variables.slice().sort((a, b) => a.index - b.index);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><span>N</span></div><div><strong>NINANO</strong><small>Pacific Climate Lab</small></div></div>
        <div className="topbar-center"><span className="workspace-pill"><Icon name="activity" size={15} /> ENSO workspace</span><span className="separator" /><time>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(frame.timestamp))}</time></div>
        <div className={`source-badge ${dataset.source}`}><span />{dataset.source === "preview" ? "PREVIEW DATA" : "DATA CONNECTED"}</div>
      </header>

      <main className="dashboard">
        <ControlPanel applyError={applyError} isApplying={isApplying} metadata={dataset.metadata} variables={variables} />
        <div className="main-column">
          <PacificMapCanvas frame={frame} grid={dataset.grid} showWind={showWind} variable={selectedVariable} variables={variables} />
        </div>
        <div className="insight-column">
          <ENSOStatusPanel frame={frame} grid={dataset.grid} inputs={appliedInputs} />
          <Nino34Chart current={frame} grid={dataset.grid} neutral={dataset.baselineFrame} />
          <section className="readiness-panel panel">
            <div className="panel-heading compact"><div><span className="eyebrow">Source readiness</span><h2>확인된 필드</h2></div></div>
            <div className="field-chips">
              {sortedVariables.map((variable) => <span className="field-chip" key={variable.key}><strong>{variable.key}</strong><small>{variable.label}</small></span>)}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
