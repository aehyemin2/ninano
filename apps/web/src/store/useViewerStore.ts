import { createContext, createElement, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import type { DisplayVariableKey } from "../types/simulation";

interface ViewerState {
  selectedVariable: DisplayVariableKey;
  scenarioValue: number;
  timeIndex: number;
  showWind: boolean;
  setSelectedVariable: (value: DisplayVariableKey) => void;
  setScenarioValue: (value: number) => void;
  setTimeIndex: (value: number) => void;
  setShowWind: (value: boolean) => void;
}

const ViewerContext = createContext<ViewerState | null>(null);

export function ViewerStoreProvider({ children }: PropsWithChildren) {
  const [selectedVariable, setSelectedVariable] = useState<DisplayVariableKey>("t2m");
  const [scenarioValue, setScenarioValue] = useState(50);
  const [timeIndex, setTimeIndex] = useState(0);
  const [showWind, setShowWind] = useState(true);

  const value = useMemo(
    () => ({
      selectedVariable,
      scenarioValue,
      timeIndex,
      showWind,
      setSelectedVariable,
      setScenarioValue,
      setTimeIndex,
      setShowWind,
    }),
    [selectedVariable, scenarioValue, timeIndex, showWind],
  );

  return createElement(ViewerContext.Provider, { value }, children);
}

export function useViewerStore(): ViewerState {
  const context = useContext(ViewerContext);
  if (!context) throw new Error("useViewerStore must be used inside ViewerStoreProvider");
  return context;
}
