import { createContext, createElement, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import type { DisplayVariableKey, ExperimentInputs, ViewMode } from "../types/simulation";

interface ViewerState {
  selectedVariable: DisplayVariableKey;
  draftInputs: ExperimentInputs;
  appliedInputs: ExperimentInputs;
  showWind: boolean;
  viewMode: ViewMode;
  hasPendingChanges: boolean;
  setSelectedVariable: (value: DisplayVariableKey) => void;
  setDraftSstAnomaly: (value: number) => void;
  setDraftTradeWindChange: (value: number) => void;
  commitAppliedInputs: (value: ExperimentInputs) => void;
  setShowWind: (value: boolean) => void;
  setViewMode: (value: ViewMode) => void;
}

const ViewerContext = createContext<ViewerState | null>(null);

export function ViewerStoreProvider({ children }: PropsWithChildren) {
  const [selectedVariable, setSelectedVariable] = useState<DisplayVariableKey>("t2m");
  const [draftInputs, setDraftInputs] = useState<ExperimentInputs>({
    sstAnomaly: 0,
    tradeWindChange: 0,
  });
  const [appliedInputs, setAppliedInputs] = useState<ExperimentInputs>({
    sstAnomaly: 0,
    tradeWindChange: 0,
  });
  const [showWind, setShowWind] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("flat");
  const hasPendingChanges =
    draftInputs.sstAnomaly !== appliedInputs.sstAnomaly ||
    draftInputs.tradeWindChange !== appliedInputs.tradeWindChange;

  const value = useMemo(
    () => ({
      selectedVariable,
      draftInputs,
      appliedInputs,
      showWind,
      viewMode,
      hasPendingChanges,
      setSelectedVariable,
      setDraftSstAnomaly: (value: number) =>
        setDraftInputs((current) => ({ ...current, sstAnomaly: value })),
      setDraftTradeWindChange: (value: number) =>
        setDraftInputs((current) => ({ ...current, tradeWindChange: value })),
      commitAppliedInputs: (value: ExperimentInputs) => setAppliedInputs(value),
      setShowWind,
      setViewMode,
    }),
    [
      selectedVariable,
      draftInputs,
      appliedInputs,
      showWind,
      viewMode,
      hasPendingChanges,
    ],
  );

  return createElement(ViewerContext.Provider, { value }, children);
}

export function useViewerStore(): ViewerState {
  const context = useContext(ViewerContext);
  if (!context) throw new Error("useViewerStore must be used inside ViewerStoreProvider");
  return context;
}
