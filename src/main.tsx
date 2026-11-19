import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "@/app/App";
import QuickLog from "@/features/log/QuickLog";
import "./index.css";

// Mesmo bundle para as duas janelas; o label decide o que renderizar.
const Root = getCurrentWindow().label === "quick" ? QuickLog : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
