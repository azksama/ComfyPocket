import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppLock } from "./AppLock";
import "./styles.css";
import "./experience.css";
import "./refinements.css";
import "./polish.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppLock>
      <App />
    </AppLock>
  </React.StrictMode>,
);
