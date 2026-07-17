import { render } from "@solidjs/web";

// oxlint-disable-next-line import/no-unassigned-import -- The application entry owns global styles.
import "./styles.css";
import { App } from "./app.js";

const root = document.querySelector("#app");
if (root === null) {
  throw new Error("找不到应用挂载点");
}
render(() => <App />, root);
