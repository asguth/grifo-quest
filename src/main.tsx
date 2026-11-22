import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "@/app/App";
import { MotionRoot } from "@/components/motion";
import QuickLog from "@/features/log/QuickLog";
import { applyTheme, DEFAULT_THEME, loadTheme } from "@/lib/theme";
import "@/styles/retro.css";
import "./index.css";

// Mesmo bundle para as janelas; o label decide o que renderizar.
const Welcome = lazy(() => import("@/features/welcome/Welcome"));
const label = getCurrentWindow().label;
const Root = label === "quick" ? QuickLog : label === "welcome" ? Welcome : App;

// Cores padrão já na primeira pintura; o tema salvo chega em seguida pelo IPC.
applyTheme(DEFAULT_THEME);
void loadTheme().then(applyTheme);

// O arrasto nativo do Tauri está desligado (senão o drop do PDF nunca chega ao React). Sem ele, um arquivo
// solto fora de uma área de upload faria o WebView abrir o arquivo no lugar do app.
for (const type of ["dragover", "drop"]) window.addEventListener(type, (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MotionRoot>
      <Suspense fallback={null}>
        <Root />
      </Suspense>
    </MotionRoot>
  </React.StrictMode>,
);
