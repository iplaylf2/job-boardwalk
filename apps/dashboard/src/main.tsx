import { render } from "@solidjs/web";

import { App } from "./app.js";

const root = document.querySelector("#app");
if (root === null) {
  throw new Error("找不到应用挂载点");
}
render(() => <App />, root);
