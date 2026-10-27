import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Workspace } from "./workspace/Workspace.js";
import "./styles.css";

const queryClient = new QueryClient();

function App() {
  return <QueryClientProvider client={queryClient}><Workspace /></QueryClientProvider>;
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
