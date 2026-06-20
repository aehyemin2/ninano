import { useEffect, useMemo, useRef, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { ENSOStatusPanel } from "./components/ENSOStatusPanel";
import { EnsoSchematic } from "./components/EnsoSchematic";
import { Nino34Chart } from "./components/Nino34Chart";
import { PacificMapCanvas } from "./components/PacificMapCanvas";
import {
  loadSimulationDataset,
  loadSimulationScalarFrame,
  loadSimulationSst,
  loadSimulationWind,
} from "./data/ensoApi";
import { createVariableCatalog } from "./data/variableCatalog";
import { useViewerStore } from "./store/useViewerStore";
import type { ExperimentInputs, SimulationDataset, SimulationFrame } from "./types/simulation";

export default function App() {
  const [dataset, setDataset] = useState<SimulationDataset | null>(null);
  const [frame, setFrame] = useState<SimulationFrame | null>(null);
  const [baselineFrame, setBaselineFrame] = useState<SimulationFrame | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const applyController = useRef<AbortController | null>(null);
  const { appliedInputs, commitAppliedInputs, draftInputs, selectedVariable, showWind } = useViewerStore();
  const [requestedInputs, setRequestedInputs] = useState(draftInputs);

  const commitRequestedInputs = (next: ExperimentInputs) => {
    setRequestedInputs((current) =>
      current.sstAnomaly === next.sstAnomaly
      && current.tradeWindChange === next.tradeWindChange
        ? current
        : next);
  };

  useEffect(() => {
    const controller = new AbortController();
    loadSimulationDataset(selectedVariable, controller.signal).then((result) => {
      setDataset(result);
      setFrame(result.baselineFrame);
      setBaselineFrame(result.baselineFrame);
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setApplyError("초기 기후 데이터를 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, []);

  // 편차 보기를 모든 변수에서 쓰려면 변수별 평년(평년=중립 입력) 데이터가 필요하다.
  // 선택 변수의 평년이 아직 없으면 그때그때 받아와 baselineFrame에 합친다.
  useEffect(() => {
    if (!dataset || !baselineFrame) return undefined;
    if (baselineFrame.fields[selectedVariable]?.length) return undefined;
    const controller = new AbortController();
    loadSimulationScalarFrame(dataset, { sstAnomaly: 0, tradeWindChange: 0 }, selectedVariable, controller.signal)
      .then((neutral) => {
        const field = neutral.fields[selectedVariable];
        if (controller.signal.aborted || !field?.length) return;
        setBaselineFrame((current) => current
          ? { ...current, fields: { ...current.fields, [selectedVariable]: field } }
          : current);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [dataset, baselineFrame, selectedVariable]);

  useEffect(() => {
    if (!dataset) return undefined;
    applyController.current?.abort();
    const controller = new AbortController();
    applyController.current = controller;
    setIsApplying(true);
    setApplyError(null);

    const applyProgressively = async () => {
      let scalarReady = false;
      try {
        const scalarFrame = await loadSimulationScalarFrame(
          dataset,
          requestedInputs,
          selectedVariable,
          controller.signal,
        );
        if (controller.signal.aborted) return;

        // 선택 레이어가 도착하면 wind를 기다리지 않고 지도를 먼저 바꾼다.
        scalarReady = true;
        setFrame(scalarFrame);
        commitAppliedInputs(requestedInputs);
        setIsApplying(false);

        const sstTask = scalarFrame.fields.sst.length
          ? Promise.resolve()
          : loadSimulationSst(dataset, requestedInputs, controller.signal)
            .then((sst) => {
              if (controller.signal.aborted) return;
              setFrame((current) => current ? {
                ...current,
                fields: { ...current.fields, sst },
              } : current);
            })
            .catch((error: unknown) => {
              if (!(error instanceof DOMException && error.name === "AbortError")) {
                setApplyError("기후장은 표시했지만 SST 진단 데이터를 불러오지 못했습니다.");
              }
            });

        const windTask = (async () => {
          try {
            const wind = await loadSimulationWind(dataset, requestedInputs, controller.signal);
            if (controller.signal.aborted) return;
            setFrame((current) => current ? {
              ...current,
              fields: { ...current.fields, u10m: wind.u10m, v10m: wind.v10m },
            } : current);
          } catch (error: unknown) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
              setApplyError("기후장은 표시했지만 바람 데이터를 불러오지 못했습니다.");
            }
          }
        })();

        await Promise.all([sstTask, windTask]);
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setApplyError(error instanceof Error ? error.message : "선택한 기후장을 불러오지 못했습니다.");
        }
      } finally {
        if (applyController.current === controller) {
          applyController.current = null;
          if (!scalarReady) setIsApplying(false);
        }
      }
    };

    void applyProgressively();
    return () => controller.abort();
  }, [dataset, requestedInputs, selectedVariable]);

  const variables = useMemo(() => dataset ? createVariableCatalog(dataset.metadata) : null, [dataset]);

  if (!dataset || !frame || !variables || !baselineFrame) {
    return (
      <main className="loading-screen"><div className="brand-mark"><span>N</span></div><p>Pacific climate workspace 준비 중</p><span className="loading-line" /></main>
    );
  }

  const sortedVariables = dataset.metadata.variables.slice().sort((a, b) => a.index - b.index);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><span>N</span></div><div><strong>NINANO</strong></div></div>
      </header>

      <main className="dashboard">
        <ControlPanel
          applyError={applyError}
          isApplying={isApplying}
          metadata={dataset.metadata}
          onCommitInputs={commitRequestedInputs}
          variables={variables}
        />
        <div className="main-column">
          <PacificMapCanvas baseline={baselineFrame} frame={frame} grid={dataset.grid} showWind={showWind} variable={selectedVariable} variables={variables} />
        </div>
        <div className="insight-column">
          <EnsoSchematic />
          <ENSOStatusPanel frame={frame} grid={dataset.grid} inputs={appliedInputs} />
          <Nino34Chart current={frame} grid={dataset.grid} neutral={dataset.baselineFrame} />
          <section className="readiness-panel panel">
            <div className="panel-heading compact"><div><span className="eyebrow">데이터 상태</span><h2>확인된 필드</h2></div></div>
            <div className="field-chips">
              {sortedVariables.map((variable) => <span className="field-chip" key={variable.key}><strong>{variable.key}</strong><small>{variable.label}</small></span>)}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
