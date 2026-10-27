import { jsx as _jsx } from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Workspace } from "./workspace/Workspace.js";
import "./styles.css";
const queryClient = new QueryClient();
function App() {
    return _jsx(QueryClientProvider, { client: queryClient, children: _jsx(Workspace, {}) });
}
createRoot(document.getElementById("root")).render(_jsx(App, {}));
