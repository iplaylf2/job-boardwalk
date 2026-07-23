import { render } from "@solidjs/web";

import "./foundation.css";
import { App } from "./app.js";
import {
  DashboardRuntimeContext,
  createDashboardRuntime,
  reportUnexpectedRoutineFailure,
} from "./dashboard-runtime.js";

const root = document.querySelector("#app");
if (root === null) {
  throw new Error("找不到应用挂载点");
}

const runtime = createDashboardRuntime();
function mountDashboard(rootElement: Element): () => void {
  try {
    return render(
      () => (
        <DashboardRuntimeContext value={runtime}>
          <App />
        </DashboardRuntimeContext>
      ),
      rootElement,
    );
  } catch (error) {
    runtime.close().catch(reportUnexpectedRoutineFailure);
    throw error;
  }
}

const dispose = mountDashboard(root);
function closeDashboard(): void {
  dispose();
  runtime.close().catch(reportUnexpectedRoutineFailure);
}
globalThis.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    closeDashboard();
  }
});
