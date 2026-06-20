import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ViewerStoreProvider } from "./store/useViewerStore";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ViewerStoreProvider>
      <App />
    </ViewerStoreProvider>
  </StrictMode>,
);
